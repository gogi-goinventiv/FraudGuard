// pages/api/billing/cancel.js
import { cancelSubscription, getCurrentSubscriptions } from '../../../lib/billingMiddleware';
import { shopify } from '../../../lib/shopify';
import sessionHandler from '../utils/sessionHandler';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

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

    const subscriptions = await getCurrentSubscriptions(session);
    
    if (!subscriptions || subscriptions.length === 0) {
      return res.status(404).json({ error: 'No active subscription found' });
    }

    const subscriptionId = subscriptions[0].id;
    const cancelledSubscription = await cancelSubscription(session, subscriptionId);

    res.json({ 
      success: true, 
      message: 'Subscription cancelled successfully',
      subscription: cancelledSubscription
    });

  } catch (error) {
    console.error('Error cancelling subscription:', error);
    res.status(500).json({ error: 'Failed to cancel subscription' });
  }
}