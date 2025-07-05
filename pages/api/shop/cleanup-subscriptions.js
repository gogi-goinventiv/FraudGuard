import clientPromise from "../../../lib/mongo";
import sessionHandler from "../utils/sessionHandler";
import { getCurrentSubscriptions, cancelSubscription } from '../../../lib/billingMiddleware';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { shop } = req.body;
  if (!shop) {
    return res.status(400).json({ error: 'Missing shop parameter' });
  }

  try {
    const client = await clientPromise;
    const db = client.db(shop.split('.')[0]);
    
    // Clean up old subscription updates (older than 24 hours)
    const twentyFourHoursAgo = new Date(Date.now() - (24 * 60 * 60 * 1000));
    const cleanupResult = await db.collection('subscription-update').updateMany(
      { 
        createdAt: { $lt: twentyFourHoursAgo },
        applied: false 
      },
      { $set: { applied: true, cleanedUp: true } }
    );

    console.log(`Cleaned up ${cleanupResult.modifiedCount} old subscription updates for shop: ${shop}`);

    // Also check for any invalid subscriptions and clean them up
    try {
      const session = await sessionHandler.loadSession(shop);
      if (session) {
        const subscriptions = await getCurrentSubscriptions(session);
        
        // Check for subscriptions that might be in an invalid state
        for (const sub of subscriptions) {
          if (sub.status === 'DECLINED' || sub.status === 'FROZEN' || sub.status === 'EXPIRED') {
            console.log(`Found ${sub.status} subscription for shop ${shop}, cleaning up...`);
            try {
              await cancelSubscription(session, sub.id);
            } catch (cancelError) {
              console.error(`Error cancelling ${sub.status} subscription:`, cancelError);
            }
          }
        }
      }
    } catch (sessionError) {
      console.error('Error checking session for cleanup:', sessionError);
    }

    return res.status(200).json({ 
      success: true, 
      cleanedUp: cleanupResult.modifiedCount,
      message: 'Subscription cleanup completed'
    });

  } catch (error) {
    console.error('Error during subscription cleanup:', error);
    return res.status(500).json({ error: 'Failed to cleanup subscriptions' });
  }
} 