import sessionHandler from "../utils/sessionHandler";
import { getCurrentSubscriptions, cancelSubscription } from '../../../lib/billingMiddleware';
import { shopify } from '../../../lib/shopify';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const { shop } = req.query;
    try {
      const session = await sessionHandler.loadSession(shop);
      if (!session) {
        return res.status(401).json({ error: 'No valid session found for this shop' });
      }
      const subscriptions = await getCurrentSubscriptions(session);
      return res.status(200).json({ subscriptions });
    } catch (error) {
      console.error('Error fetching subscription details:', error);
      return res.status(500).json({ error: 'Failed to fetch subscription details', details: error.message });
    }
  } else if (req.method === 'POST') {
    const { shop, extendDays, price: customPrice, interval: customInterval } = req.body;
    if (!shop || typeof extendDays !== 'number') {
      return res.status(400).json({ error: 'Missing shop or extendDays' });
    }
    try {
      const session = await sessionHandler.loadSession(shop);
      if (!session) {
        return res.status(401).json({ error: 'No valid session found for this shop' });
      }
      // Get current subscriptions
      const subscriptions = await getCurrentSubscriptions(session);
      const activeSub = subscriptions.find(sub => sub.status === 'ACTIVE');
      let plan, price, currencyCode, interval, trialDays;
      if (activeSub) {
        // Cancel current subscription
        await cancelSubscription(session, activeSub.id);
        plan = activeSub.name;
        price = customPrice || activeSub.lineItems[0].plan.pricingDetails.price.amount;
        currencyCode = activeSub.lineItems[0].plan.pricingDetails.price.currencyCode;
        interval = customInterval || activeSub.lineItems[0].plan.pricingDetails.interval;
        // Use the trial days left + extension
        const createdAt = activeSub.createdAt;
        const origTrialDays = activeSub.trialDays || 0;
        const start = new Date(createdAt);
        const now = new Date();
        const daysPassed = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
        const left = origTrialDays - daysPassed;
        const trialDaysLeft = left > 0 ? left : 0;
        trialDays = trialDaysLeft + extendDays;
      } else {
        // No active subscription: use defaults or custom
        plan = process.env.SHOPIFY_BILLING_PLAN_NAME || 'Premium Plan';
        price = customPrice || process.env.SHOPIFY_BILLING_AMOUNT || '29.99';
        currencyCode = process.env.SHOPIFY_BILLING_CURRENCY || 'USD';
        interval = customInterval || process.env.SHOPIFY_BILLING_INTERVAL || 'EVERY_30_DAYS';
        trialDays = extendDays;
      }
      const allowedIntervals = ['EVERY_30_DAYS', 'ANNUAL'];
      if (!allowedIntervals.includes(interval)) {
        return res.status(400).json({ error: 'Invalid interval. Only EVERY_30_DAYS and ANNUAL are supported.' });
      }
      // Create new subscription
      const client = new shopify.clients.Graphql({ session });
      const mutation = `
        mutation AppSubscriptionCreate($name: String!, $lineItems: [AppSubscriptionLineItemInput!]!, $returnUrl: URL!, $test: Boolean, $trialDays: Int) {
          appSubscriptionCreate(name: $name, lineItems: $lineItems, returnUrl: $returnUrl, test: $test, trialDays: $trialDays) {
            userErrors { field message }
            confirmationUrl
            appSubscription { id name status createdAt trialDays currentPeriodEnd }
          }
        }
      `;
      const variables = {
        name: plan,
        returnUrl: `${process.env.HOST}/?shop=${session.shop}`,
        test: false,
        trialDays,
        lineItems: [
          {
            plan: {
              appRecurringPricingDetails: {
                price: { amount: price, currencyCode },
                interval,
              },
            },
          },
        ],
      };
      const response = await client.request(mutation, { variables });
      const errors = response.data.appSubscriptionCreate.userErrors;
      if (errors && errors.length > 0) {
        return res.status(400).json({ error: errors[0].message });
      }
      const confirmationUrl = response.data.appSubscriptionCreate.confirmationUrl;
      return res.status(200).json({ confirmationUrl });
    } catch (error) {
      console.error('Error extending subscription:', error);
      return res.status(500).json({ error: 'Failed to extend subscription', details: error.message });
    }
  } else {
    return res.status(405).json({ error: 'Method not allowed' });
  }
} 