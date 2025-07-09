// pages/api/auth/install.js
import sessionHandler from '../utils/sessionHandler';

export default async function handler(req, res) {
    const { shop, host } = req.query;

    if (req.method === 'GET') {

        console.log(process.env.NODE_ENV)

        try {
            const session = await sessionHandler.loadSession(shop);

            if (session) {
                // Check billing status if billing is required
                if (process.env.SHOPIFY_BILLING_REQUIRED === 'true') {
                    const { getBillingStatus } = await import('../../../lib/billingMiddleware');
                    const billingStatus = await getBillingStatus(session);
                    if (!billingStatus.hasActiveSubscription && billingStatus.billingUrl) {
                        // Redirect to app root with billingRequired and billingUrl as query params
                        res.redirect(302, `/?shop=${shop}&host=${host}&billingRequired=1&billingUrl=${encodeURIComponent(billingStatus.billingUrl)}`);
                        return;
                    }
                }
                // Session exists and billing is either not required or active
                res.redirect(302, `/?shop=${shop}&host=${host}`);
                return;
            }
            res.redirect(302, `/api/auth?shop=${shop}&host=${host}`);
        } catch (error) {
            console.error('Auth begin error:', error);
            res.status(500).send('Internal Server Error');
        }
        return;
    }
    res.status(405).send('Method Not Allowed');
}
