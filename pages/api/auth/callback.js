// pages/api/auth/callback.js
import { DeliveryMethod } from '@shopify/shopify-api';
import { shopify } from '../../../lib/shopify';
import sessionHandler from '../utils/sessionHandler';

export default async function handler(req, res) {
  try {

    // This handles the OAuth callback and automatically stores the session
    const callback = await shopify.auth.callback({
      rawRequest: req,
      rawResponse: res,
    });

    // Get session details
    const { session } = callback;
    const accessToken = session.accessToken;
    const shop = session.shop;

    // console.log("Shop:", shop);
    console.log("Access token:", accessToken);
    // console.log("Session:", session);

    // Register webhook for order creation using the new approach
    shopify.webhooks.addHandlers({
      ORDERS_CREATE: [
        {
          deliveryMethod: DeliveryMethod.Http,
          callbackUrl: `${process.env.HOST}/api/webhooks/order-create`,
        },
      ],
      ORDERS_CANCELLED: [
        {
          deliveryMethod: DeliveryMethod.Http,
          callbackUrl: `${process.env.HOST}/api/webhooks/order-cancel`,
        },
      ],
    });
    
    // Register the webhooks with Shopify
    const registerResponse = await shopify.webhooks.register({
      session,
    });
    
    console.log('Webhook registration result:', JSON.stringify(registerResponse, null, 2));

    await sessionHandler.storeSession(session);
    // Redirect to the app
    console.log(`Redirecting to https://${shop}/admin/apps/${process.env.NEXT_PUBLIC_APP_NAME || 'your-app'}`);
    // Make sure it's a complete URL
    res.redirect(`https://${shop}/admin/apps/${process.env.NEXT_PUBLIC_APP_NAME || 'your-app'}`);

  } catch (e) {
    console.error("Error during auth callback", e);
    res.status(500).send({
      error: e.message
    });
  }
}
