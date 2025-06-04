// pages/api/auth/index.js
import { shopify } from '../../../lib/shopify';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      await shopify.auth.begin({
        shop: req.query.shop,
        callbackPath: '/api/auth/callback',
        isOnline: false,
        rawRequest: req,
        rawResponse: res,
      });
    } catch (error) {
      console.error('Auth begin error:', error);
      res.status(500).send('Internal Server Error');
    }
    return;
  }
  res.status(405).send('Method Not Allowed');
}
