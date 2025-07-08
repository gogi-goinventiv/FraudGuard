import clientPromise from '../../../lib/mongo';
const logger = require('../../../utils/logger');

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
    logger.info('Lifetime free check request completed', { category: 'api-shop-is-lifetime-free' });
    return res.status(200).json({ lifetimeFree: !!found });
  } catch (error) {
    logger.error('Failed to check lifetime free', { error, category: 'api-shop-is-lifetime-free' });
    return res.status(500).json({ error: 'Failed to check lifetime free' });
  }
} 