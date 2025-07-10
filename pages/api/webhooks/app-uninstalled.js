import { shopify } from '../../../lib/shopify';
import { buffer } from 'micro';
import withMiddleware from '../utils/middleware/withMiddleware';

export const config = {
    api: {
        bodyParser: false,
    },
};

async function validateShopifyWebhook(req, rawBodyString, res) {
    const shop = req.headers['x-shopify-shop-domain'];
    const topic = req.headers['x-shopify-topic'];

    if (!shop) {
        if (!res.headersSent) res.status(400).json({ error: 'Missing x-shopify-shop-domain header' });
        return false;
    }
    if (!topic) {
        if (!res.headersSent) res.status(400).json({ error: 'Missing x-shopify-topic header' });
        return false;
    }

    try {
        const isValid = await shopify.webhooks.validate({ rawBody: rawBodyString, rawRequest: req, rawResponse: res });
        if (!isValid && !res.headersSent) {
            res.status(401).json({ error: 'Invalid webhook signature (returned false)' });
        }
        return isValid;
    } catch (error) {
        console.error('Shopify webhook validation error:', error.message, { category: 'webhook-app-uninstalled' });
        if (!res.headersSent) {
            res.status(401).json({ error: `Webhook validation failed: ${error.message}` });
        }
        return false;
    }
}

const handler = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
    }

    const shop = req.headers['x-shopify-shop-domain'];
    const idempotencyKey = req.headers['x-shopify-hmac-sha256'] || req.headers['x-shopify-order-id'];

    let rawBodyString;
    try {
        const rawBodyBuffer = await buffer(req);
        rawBodyString = rawBodyBuffer.toString('utf8');
    } catch (bufError) {
        console.error('Failed to buffer request body:', bufError, { category: 'webhook-app-uninstalled' });
        return res.status(500).json({ error: 'Failed to read request body' });
    }

    if (!await validateShopifyWebhook(req, rawBodyString, res)) {
        return;
    }

    // If the app is uninstalled clear onboarding and session data from the database
    const sessionRemoved = await fetch(`${process.env.HOST}/api/reset-session?shop=${shop}`, { method: 'GET' });
    if(!sessionRemoved.ok) {
        console.error('Failed to clear session data', { category: 'webhook-app-uninstalled' });
        return res.status(500).json({ error: 'Failed to clear session data' });
    }

    const onboardingRemoved = await fetch(`${process.env.HOST}/api/reset-onboarding?shop=${shop}`, { method: 'GET' });
    if(!onboardingRemoved.ok) {
        console.error('Failed to clear onboarding data', { category: 'webhook-app-uninstalled' });
        return res.status(500).json({ error: 'Failed to clear onboarding data' });
    }

    console.info(`App successfully uninstalled from ${shop} with idempotency key ${idempotencyKey}`, { category: 'webhook-app-uninstalled' });
    return res.status(200).json({ status: 'success' });
}

// Export the handler wrapped with HMAC verification middleware
export default withMiddleware("verifyHmac")(handler);
