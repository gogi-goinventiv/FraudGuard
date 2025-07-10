import clientPromise from '../../../lib/mongo';


export default async function handler(req, res) {
  const client = await clientPromise;
  const db = client.db('fraudguard');
  const collection = db.collection('trialExtensionHistory');

  if (req.method === 'POST') {
    const { shop, action, details, admin } = req.body;
    if (!shop || !action) {
      return res.status(400).json({ error: 'Missing shop or action' });
    }
    try {
      const log = {
        shop,
        action,
        details: details || '',
        admin: admin || null,
        timestamp: new Date()
      };
      await collection.insertOne(log);
      return res.status(200).json({ success: true });
    } catch (error) {
      console.error('Error logging history:', error, { category: 'api-shop-history' });
      return res.status(500).json({ error: 'Failed to log history' });
    }
  } else if (req.method === 'GET') {
    const { shop } = req.query;
    if (!shop) {
      return res.status(400).json({ error: 'Missing shop' });
    }
    try {
      const logs = await collection.find({ shop }).sort({ timestamp: -1 }).limit(50).toArray();
      return res.status(200).json({ logs });
    } catch (error) {
      console.error('Error fetching history:', error, { category: 'api-shop-history' });
      return res.status(500).json({ error: 'Failed to fetch history' });
    }
  } else {
    return res.status(405).json({ error: 'Method not allowed' });
  }
} 