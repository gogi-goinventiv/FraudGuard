// pages/api/auth/callback.js
import { DeliveryMethod } from '@shopify/shopify-api';
import { shopify } from '../../../lib/shopify';
import sessionHandler from '../utils/sessionHandler';


const BILLING_SETTINGS = {
  chargeName: process.env.SHOPIFY_BILLING_PLAN_NAME || 'Premium Plan',
  amount: parseFloat(process.env.SHOPIFY_BILLING_AMOUNT || '29.99'),
  currencyCode: process.env.SHOPIFY_BILLING_CURRENCY || 'USD',
  interval: process.env.SHOPIFY_BILLING_INTERVAL || 'EVERY_30_DAYS',
  trialDays: parseInt(process.env.SHOPIFY_BILLING_TRIAL_DAYS || '7'),
  test: false
};

async function checkBillingStatus(session) {
  const client = new shopify.clients.Graphql({ session });

  const query = `
    query {
      currentAppInstallation {
        activeSubscriptions {
          id
          name
          status
          createdAt
          currentPeriodEnd
          trialDays
        }
      }
    }
  `;

  try {
    const response = await client.request(query);
    const subscriptions = response.data.currentAppInstallation.activeSubscriptions;
    
    return subscriptions && subscriptions.length > 0 && 
           subscriptions.some(sub => sub.status === 'ACTIVE');
  } catch (error) {
    console.error('Error checking billing status:', error);
    return false;
  }
}

async function createBillingSubscription(session, host = '') {
  const client = new shopify.clients.Graphql({ session });

  const mutation = `
    mutation AppSubscriptionCreate($name: String!, $lineItems: [AppSubscriptionLineItemInput!]!, $returnUrl: URL!, $test: Boolean, $trialDays: Int) {
      appSubscriptionCreate(name: $name, lineItems: $lineItems, returnUrl: $returnUrl, test: $test, trialDays: $trialDays) {
        userErrors {
          field
          message
        }
        confirmationUrl
        appSubscription {
          id
          name
          status
          createdAt
          trialDays
          currentPeriodEnd
        }
      }
    }
  `;

  const returnUrl = `${process.env.HOST}/?shop=${session.shop}&host=${host}`;
  
  const variables = {
    name: BILLING_SETTINGS.chargeName,
    returnUrl: returnUrl,
    test: BILLING_SETTINGS.test,
    trialDays: BILLING_SETTINGS.trialDays,
    lineItems: [
      {
        plan: {
          appRecurringPricingDetails: {
            price: {
              amount: BILLING_SETTINGS.amount,
              currencyCode: BILLING_SETTINGS.currencyCode,
            },
            interval: BILLING_SETTINGS.interval,
          },
        },
      },
    ],
  };

  try {
    console.debug('Creating subscription with variables:', JSON.stringify(variables, null, 2));
    const response = await client.request(mutation, { variables });

    console.debug('Subscription response:', JSON.stringify(response, null, 2));

    if (response.data.appSubscriptionCreate.userErrors.length > 0) {
      throw new Error(
        `Billing API error: ${response.data.appSubscriptionCreate.userErrors[0].message}`
      );
    }

    return response.data.appSubscriptionCreate.confirmationUrl;
  } catch (error) {
    console.error('Error creating subscription:', error);
    throw error;
  }
}

export default async function handler(req, res) {
  try {
    console.info('Auth callback request received', { category: 'api-auth-callback' });
    const callback = await shopify.auth.callback({
      rawRequest: req,
      rawResponse: res,
    });

    const { session } = callback;
    const accessToken = session.accessToken;
    const shop = session.shop;

    console.debug('Auth callback successful', { category: 'api-auth-callback' });

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
      ORDERS_PAID: [
        {
          deliveryMethod: DeliveryMethod.Http,
          callbackUrl: `${process.env.HOST}/api/webhooks/order-paid`,
        },
      ],
      APP_SUBSCRIPTIONS_UPDATE: [
        {
          deliveryMethod: DeliveryMethod.Http,
          callbackUrl: `${process.env.HOST}/api/webhooks/app-subscription-update`,
        },
      ],
      APP_UNINSTALLED: [
        {
          deliveryMethod: DeliveryMethod.Http,
          callbackUrl: `${process.env.HOST}/api/webhooks/app-uninstalled`,
        },
      ],
      CUSTOMERS_DATA_REQUEST: [
        {
          deliveryMethod: DeliveryMethod.Http,
          callbackUrl: `${process.env.HOST}/api/webhooks/customers-data-request`,
        },
      ],
      CUSTOMERS_REDACT: [
        {
          deliveryMethod: DeliveryMethod.Http,
          callbackUrl: `${process.env.HOST}/api/webhooks/customers-redact`,
        },
      ],
      SHOP_REDACT: [
        {
          deliveryMethod: DeliveryMethod.Http,
          callbackUrl: `${process.env.HOST}/api/webhooks/shop-redact`,
        },
      ]
    });
    
    const registerResponse = await shopify.webhooks.register({
      session,
    });
    
    console.debug('Webhook registration result:', JSON.stringify(registerResponse, null, 2));

    await sessionHandler.storeSession(session);

    if (process.env.SHOPIFY_BILLING_REQUIRED === 'true') {
      const hasPayment = await checkBillingStatus(session);
      
      if (!hasPayment) {
        const billingUrl = await createBillingSubscription(session, req.query.host);
        return res.redirect(billingUrl);
      }
    }

    console.info(`Redirecting to https://${shop}/admin/apps/${process.env.NEXT_PUBLIC_APP_NAME || 'your-app'}`, { category: 'api-auth-callback' });
    const host = req.query.host;
    res.redirect(`/?shop=${shop}&host=${host}`);

  } catch (e) {
    console.error("Error during auth callback", e, { category: 'api-auth-callback' });

    // Detect missing OAuth cookie error and restart OAuth
    if (
      e.message &&
      e.message.includes('Could not find an OAuth cookie')
    ) {
      const shop = req.query.shop;
      const host = req.query.host;
      return res.redirect(`/api/auth?shop=${shop}&host=${host}`);
    }

    res.status(500).send({
      error: e.message
    });
  }
}
