// pages/api/auth/index.js
import { shopify } from '../../../lib/shopify';


export default async function handler(req, res) {
  console.info('Request received for auth index', { category: 'api-auth-index' });
  if (req.method === 'GET') {
    try {
      await shopify.auth.begin({
        shop: req.query.shop,
        callbackPath: '/api/auth/callback',
        isOnline: false,
        rawRequest: req,
        rawResponse: res,
      });
      console.debug('Auth begin successful', { category: 'api-auth-index' });
    } catch (error) {
      console.error('Auth begin error', error, { category: 'api-auth-index' });
      res.status(500).send('Internal Server Error');
    }
    return;
  }
  console.warn('Method not allowed for auth index', { category: 'api-auth-index' });
  res.status(405).send('Method Not Allowed');
}
