// pages/api/protected-feature.js
import { requireBilling } from '../../lib/billingMiddleware';

export default async function handler(req, res) {
  await new Promise((resolve, reject) => {
    requireBilling(req, res, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });

  res.json({ 
    message: 'This feature requires an active subscription',
    shop: req.session.shop 
  });
}