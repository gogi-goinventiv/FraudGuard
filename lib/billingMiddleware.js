// lib/billingMiddleware.js
import { shopify } from './shopify';
import sessionHandler from '../pages/api/utils/sessionHandler';

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

async function createBillingSubscription(session) {
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

  const variables = {
    name: BILLING_SETTINGS.chargeName,
    returnUrl: `https://admin.shopify.com/store/${shop.split('.')[0]}/apps/${process.env.NEXT_PUBLIC_APP_NAME}`,
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
    const response = await client.request(mutation, { variables });

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

export const requireBilling = async (req, res, next) => {
  try {
    if (process.env.SHOPIFY_BILLING_REQUIRED !== 'true') {
      return next();
    }

    const sessionId = await shopify.session.getCurrentId({
      rawRequest: req,
      rawResponse: res,
    });

    if (!sessionId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const session = await sessionHandler.loadSession(sessionId);
    
    if (!session) {
      return res.status(401).json({ error: 'Session not found' });
    }

    const hasPayment = await checkBillingStatus(session);
    
    if (!hasPayment) {
      const billingUrl = await createBillingSubscription(session);
      return res.status(402).json({
        error: 'Payment required',
        message: 'Please complete your subscription to continue using the app',
        billingUrl: billingUrl
      });
    }

    req.session = session;
    next();
  } catch (error) {
    console.error('Billing check error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const getBillingStatus = async (session) => {
  if (process.env.SHOPIFY_BILLING_REQUIRED !== 'true') {
    return { hasActiveSubscription: true, billingUrl: null };
  }

  try {
    const hasPayment = await checkBillingStatus(session);
    
    if (!hasPayment) {
      const billingUrl = await createBillingSubscription(session);
      return { hasActiveSubscription: false, billingUrl };
    }

    return { hasActiveSubscription: true, billingUrl: null };
  } catch (error) {
    console.error('Error getting billing status:', error);
    return { hasActiveSubscription: false, billingUrl: null, error: error.message };
  }
};

export const getCurrentSubscriptions = async (session) => {
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
          lineItems {
            id
            plan {
              pricingDetails {
                ... on AppRecurringPricing {
                  price {
                    amount
                    currencyCode
                  }
                  interval
                }
              }
            }
          }
        }
      }
    }
  `;

  const response = await client.request(query);
  return response.data.currentAppInstallation.activeSubscriptions;
};

export const cancelSubscription = async (session, subscriptionId) => {
  const client = new shopify.clients.Graphql({ session });

  const mutation = `
    mutation AppSubscriptionCancel($id: ID!) {
      appSubscriptionCancel(id: $id) {
        userErrors {
          field
          message
        }
        appSubscription {
          id
          status
        }
      }
    }
  `;

  const response = await client.request(mutation, { variables: { id: subscriptionId } });

  if (response.data.appSubscriptionCancel.userErrors.length > 0) {
    throw new Error(response.data.appSubscriptionCancel.userErrors[0].message);
  }

  return response.data.appSubscriptionCancel.appSubscription;
};
