import clientPromise from '../../../lib/mongo';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const { shop } = req.query;
  if (!shop) {
    return res.status(400).json({ error: 'Missing shop' });
  }
  try {
    const client = await clientPromise;
    const db = client.db('fraudguard');
    const found = await db.collection('lifetimeFreeShops').findOne({ shop });
    return res.status(200).json({ lifetimeFree: !!found });
  } catch (error) {
    console.error('Error checking lifetime free:', error);
    return res.status(500).json({ error: 'Failed to check lifetime free' });
  }
} 