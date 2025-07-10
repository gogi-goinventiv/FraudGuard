// pages/api/billing/status.js
import { getBillingStatus, getCurrentSubscriptions } from '../../../lib/billingMiddleware';
import { shopify } from '../../../lib/shopify';
import sessionHandler from '../utils/sessionHandler';

export default async function handler(req, res) {
  try {
    const sessionId = await shopify.session.getCurrentId({
      rawRequest: req,
      rawResponse: res,
    });

    if (!sessionId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const session = await sessionHandler.loadSession(sessionId);
    
    if (!session) {
      return res.status(401).json({ error: 'Session not found' });
    }

    if (req.method === 'GET') {
      console.info('Billing status request started', { category: 'api-billing-status' });
      const billingStatus = await getBillingStatus(session);
      const subscriptions = await getCurrentSubscriptions(session);
      
      res.json({
        ...billingStatus,
        subscriptions,
        billingRequired: process.env.SHOPIFY_BILLING_REQUIRED === 'true'
      });
      console.info('Billing status request successful', { category: 'api-billing-status' });
    } else {
      res.setHeader('Allow', ['GET']);
      res.status(405).end(`Method ${req.method} Not Allowed`);
    }

  } catch (error) {
    console.error('Billing status error', error, { category: 'api-billing-status' });
    res.status(500).json({ error: 'Internal Server Error' });
  }
}