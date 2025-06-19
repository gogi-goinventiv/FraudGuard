// pages/api/webhooks/app-subscription-update.js
import { shopify } from '../../../lib/shopify';
import withMiddleware from '../utils/middleware/withMiddleware';
import sessionHandler from '../utils/sessionHandler';

const handler = async (req, res) => {
  try {
    const { body, headers } = req;
    
    const isValid = await shopify.webhooks.process({
      rawBody: JSON.stringify(body),
      rawRequest: req,
      rawResponse: res,
    });

    if (!isValid) {
      console.log('Invalid webhook signature');
      return res.status(401).send('Unauthorized');
    }

    const subscription = body;
    const shopDomain = subscription.app_installation?.shop?.domain;
    
    console.log(`Subscription ${subscription.status} for shop: ${shopDomain}`);

    switch (subscription.status) {
      case 'ACTIVE':
        await handleActiveSubscription(subscription);
        break;
      case 'CANCELLED':
        await handleCancelledSubscription(subscription);
        break;
      case 'EXPIRED':
        await handleExpiredSubscription(subscription);
        break;
      case 'FROZEN':
        await handleFrozenSubscription(subscription);
        break;
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('App subscription webhook error:', error);
    res.status(500).send('Internal Server Error');
  }
}

async function handleActiveSubscription(subscription) {
  const shopDomain = subscription.app_installation?.shop?.domain;
  console.log(`Subscription activated for shop: ${shopDomain}`);
}

async function handleCancelledSubscription(subscription) {
  const shopDomain = subscription.app_installation?.shop?.domain;
  console.log(`Subscription cancelled for shop: ${shopDomain}`);
}

async function handleExpiredSubscription(subscription) {
  const shopDomain = subscription.app_installation?.shop?.domain;
  console.log(`Subscription expired for shop: ${shopDomain}`);
}

async function handleFrozenSubscription(subscription) {
  const shopDomain = subscription.app_installation?.shop?.domain;
  console.log(`Subscription frozen for shop: ${shopDomain}`);
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb',
    },
  },
}

// Export the handler wrapped with HMAC verification middleware
export default withMiddleware("verifyHmac")(handler);