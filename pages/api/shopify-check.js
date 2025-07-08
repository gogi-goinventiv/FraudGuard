import { sessionStorage } from '../../lib/shopify';
const logger = require('../../utils/logger');

export default async function handler(req, res) {
  const { shop } = req.query;
  
  if (!shop) {
    return res.status(400).json({ error: 'Missing shop parameter' });
  }

  // Try to find a session for this shop
  const sessions = await sessionStorage.findSessionsByShop(shop);
  
  if (sessions && sessions.length > 0) {
    return res.status(200).json({ connected: true, shop });
  } else {
    return res.status(200).json({ connected: false });
  }
}