import clientPromise from '../../../lib/mongo';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const { shop } = req.body;
  if (!shop) {
    return res.status(400).json({ error: 'Missing shop' });
  }
  try {
    const client = await clientPromise;
    const db = client.db('fraudguard');
    await db.collection('lifetimeFreeShops').updateOne(
      { shop },
      { $set: { shop } },
      { upsert: true }
    );
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error setting lifetime free:', error);
    return res.status(500).json({ error: 'Failed to set lifetime free' });
  }
} 