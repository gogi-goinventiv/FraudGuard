import clientPromise from '../../../lib/mongo';
import sessionHandler from '../utils/sessionHandler';
import { getCurrentSubscriptions, cancelSubscription } from '../../../lib/billingMiddleware';


export default async function handler(req, res) {
  if (req.method === 'POST') {
    const { shop } = req.body;
    if (!shop) {
      return res.status(400).json({ error: 'Missing shop' });
    }
    try {
      console.info({ category: 'api-shop-lifetime-free', message: 'Request to set lifetime free' });
      // Cancel all active subscriptions for this shop
      const session = await sessionHandler.loadSession(shop);
      if (session) {
        const subscriptions = await getCurrentSubscriptions(session);
        for (const sub of subscriptions) {
          if (sub.status === 'ACTIVE') {
            await cancelSubscription(session, sub.id);
          }
        }
      }
      const client = await clientPromise;
      const db = client.db('fraudguard');
      await db.collection('lifetimeFreeShops').updateOne(
        { shop },
        { $set: { shop } },
        { upsert: true }
      );
      console.info({ category: 'api-shop-lifetime-free', message: 'Lifetime free set successfully' });
      return res.status(200).json({ success: true });
    } catch (error) {
      console.error({ category: 'api-shop-lifetime-free', message: 'Error setting lifetime free', error });
      return res.status(500).json({ error: 'Failed to set lifetime free' });
    }
  } else if (req.method === 'DELETE') {
    const { shop } = req.body;
    if (!shop) {
      return res.status(400).json({ error: 'Missing shop' });
    }
    try {
      console.info({ category: 'api-shop-lifetime-free', message: 'Request to end lifetime free' });
      const client = await clientPromise;
      const db = client.db('fraudguard');
      await db.collection('lifetimeFreeShops').deleteOne({ shop });
      console.info({ category: 'api-shop-lifetime-free', message: 'Lifetime free ended successfully' });
      return res.status(200).json({ success: true });
    } catch (error) {
      console.error({ category: 'api-shop-lifetime-free', message: 'Error ending lifetime free', error });
      return res.status(500).json({ error: 'Failed to end lifetime free' });
    }
  } else {
    return res.status(405).json({ error: 'Method not allowed' });
  }
} 