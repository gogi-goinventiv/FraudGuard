// pages/api/auth/index.js
import { shopify } from '../../../lib/shopify';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const redirectUrl = await shopify.auth.begin({
      shop: req.query.shop,
      callbackPath: '/api/auth/callback',
      isOnline: false,
      rawRequest: req,
      rawResponse: res,
    });
    return res.redirect(redirectUrl);
  }

  res.status(405).send('Method Not Allowed');
}
