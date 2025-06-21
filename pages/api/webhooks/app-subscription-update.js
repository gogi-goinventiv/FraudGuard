// pages/api/webhooks/app-subscription-update.js
import { shopify } from '../../../lib/shopify';
import withMiddleware from '../utils/middleware/withMiddleware';
import sessionHandler from '../utils/sessionHandler';
import clientPromise from '../../../lib/mongo';
import { buffer } from 'micro';

export const config = {
  api: {
    bodyParser: false,
  },
};

async function validateShopifyWebhook(req, rawBodyString, res) {
  const shop = req.headers['x-shopify-shop-domain'];
  const topic = req.headers['x-shopify-topic'];

  if (!shop) {
    if (!res.headersSent) res.status(400).json({ error: 'Missing x-shopify-shop-domain header' });
    return false;
  }
  if (!topic) {
    if (!res.headersSent) res.status(400).json({ error: 'Missing x-shopify-topic header' });
    return false;
  }

  try {
    const isValid = await shopify.webhooks.validate({ rawBody: rawBodyString, rawRequest: req, rawResponse: res });
    if (!isValid && !res.headersSent) {
      res.status(401).json({ error: 'Invalid webhook signature (returned false)' });
    }
    return isValid;
  } catch (error) {
    console.error('Shopify webhook validation error:', error.message);
    if (!res.headersSent) {
      res.status(401).json({ error: `Webhook validation failed: ${error.message}` });
    }
    return false;
  }
}

async function enqueueSubscriptionWebhook(db, webhookData) {
  const queueItem = {
    ...webhookData,
    _id: `subscription_${webhookData.idempotencyKey}_${Date.now()}`,
    type: 'subscription-update',
    status: 'pending',
    attempts: 0,
    maxAttempts: 3,
    createdAt: new Date(),
    nextAttemptAfter: new Date()
  };

  await db.collection('webhook-queue').insertOne(queueItem);
  console.log(`Subscription webhook queued for shop: ${webhookData.shop}`);
  return queueItem;
}

async function triggerQueueProcessor(shop) {
  try {
    await fetch(`${process.env.HOST}/api/process-queue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shop }),
    });
  } catch (error) {
    console.error(`Failed to trigger queue processor for shop ${shop}:`, error.message);
  }
}

async function handleActiveSubscription(subscription) {
  const shopDomain = subscription.app_installation?.shop?.domain;
  console.log(`Subscription activated for shop: ${shopDomain}`);
  // Add any specific logic for active subscriptions
}

async function handleCancelledSubscription(subscription) {
  const shopDomain = subscription.app_installation?.shop?.domain;
  console.log(`Subscription cancelled for shop: ${shopDomain}`);
  // Add any specific logic for cancelled subscriptions
}

async function handleExpiredSubscription(subscription) {
  const shopDomain = subscription.app_installation?.shop?.domain;
  console.log(`Subscription expired for shop: ${shopDomain}`);
  // Add any specific logic for expired subscriptions
}

async function handleFrozenSubscription(subscription) {
  const shopDomain = subscription.app_installation?.shop?.domain;
  console.log(`Subscription frozen for shop: ${shopDomain}`);
  // Add any specific logic for frozen subscriptions
}

export async function processQueuedSubscriptionWebhook(db, queueItem) {
  const { subscription, shop, idempotencyKey } = queueItem;

  try {
    await db.collection('webhook-queue').updateOne(
      { _id: queueItem._id },
      {
        $set: {
          status: 'processing',
          processingStartedAt: new Date(),
          attempts: queueItem.attempts + 1
        }
      }
    );

    console.log(`Processing subscription webhook for shop: ${shop}, status: ${subscription.status}`);

    switch (subscription.status) {
      case 'ACTIVE':
        await handleActiveSubscription(subscription);
        break;
      case 'CANCELLED':
        await handleCancelledSubscription(subscription);
        break;
      case 'EXPIRED':
        await handleExpiredSubscription(subscription);
        break;
      case 'FROZEN':
        await handleFrozenSubscription(subscription);
        break;
    }

    await db.collection('webhook-queue').updateOne(
      { _id: queueItem._id },
      {
        $set: {
          status: 'completed',
          completedAt: new Date()
        }
      }
    );

    console.log(`Successfully processed subscription webhook for shop: ${shop}`);
    return true;

  } catch (error) {
    console.error(`Error processing subscription webhook for shop ${shop}:`, error.message);

    const shouldRetry = queueItem.attempts < queueItem.maxAttempts;
    const updateData = shouldRetry
      ? {
        status: 'pending',
        lastError: error.message,
        lastAttemptAt: new Date(),
        nextAttemptAfter: new Date(Date.now() + (queueItem.attempts * 30000))
      }
      : {
        status: 'failed',
        lastError: error.message,
        failedAt: new Date()
      };

    await db.collection('webhook-queue').updateOne(
      { _id: queueItem._id },
      { $set: updateData }
    );

    if (!shouldRetry) {
      console.error(`Subscription webhook processing failed permanently for shop ${shop} after ${queueItem.attempts} attempts`);
    }

    return false;
  }
}

const handler = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const shop = req.headers['x-shopify-shop-domain'];
  const idempotencyKey = req.headers['x-shopify-hmac-sha256'] || req.headers['x-shopify-order-id'];

  let rawBodyString;
  try {
    const rawBodyBuffer = await buffer(req);
    rawBodyString = rawBodyBuffer.toString('utf8');
  } catch (bufError) {
    console.error('Failed to buffer request body:', bufError);
    return res.status(500).json({ error: 'Failed to read request body' });
  }

  if (!await validateShopifyWebhook(req, rawBodyString, res)) {
    return;
  }

  let subscription;
  try {
    subscription = JSON.parse(rawBodyString);
  } catch (parseError) {
    console.error('Failed to parse webhook JSON body:', parseError);
    return res.status(400).json({ error: 'Invalid JSON in webhook body' });
  }

  if (!shop || !subscription?.status) {
    console.error('Invalid webhook data: Missing shop or subscription status.', { shop, status: subscription?.status });
    return res.status(400).json({ error: 'Incomplete or invalid subscription data in webhook.' });
  }

  let mongoClient;
  let db;
  try {
    mongoClient = await clientPromise;
    const storeName = shop.split('.')[0];
    db = mongoClient.db(storeName);
  } catch (dbConnectionError) {
    console.error(`MongoDB connection error for shop ${shop}:`, dbConnectionError);
    return res.status(500).json({ error: 'Database connection failed' });
  }

  try {
    const webhookData = {
      subscription,
      shop,
      idempotencyKey,
      rawHeaders: req.headers
    };

    await enqueueSubscriptionWebhook(db, webhookData);

    triggerQueueProcessor(shop);

    return res.status(200).json({
      success: true,
      message: 'Subscription webhook received and queued for processing'
    });

  } catch (error) {
    console.error(`Failed to queue subscription webhook for shop ${shop}:`, error);
    return res.status(500).json({ error: 'Failed to queue subscription webhook for processing' });
  }
}

// Export the handler wrapped with HMAC verification middleware
export default withMiddleware("verifyHmac")(handler);