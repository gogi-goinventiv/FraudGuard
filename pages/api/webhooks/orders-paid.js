import { buffer } from 'micro';
import { shopify } from '../../../lib/shopify';
import clientPromise from '../../../lib/mongo';
import withMiddleware from '../utils/middleware/withMiddleware';
const logger = require('../../../utils/logger');

export const config = {
  api: {
    bodyParser: false,
  },
};

async function retryDbOperation(operation, maxRetries = 3, delay = 1000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (error.code === 11000 || (error.message && error.message.includes('duplicate key'))) {
        logger.warn(`Duplicate key error during DB operation (attempt ${attempt}/${maxRetries}). Indicating pre-existing data or race condition.`, { category: 'webhook-orders-paid' });
        return { duplicateKeyError: true, error, success: false };
      }
      logger.error(`Database operation failed (attempt ${attempt}/${maxRetries}):`, error.message, { category: 'webhook-orders-paid' });
      if (attempt >= maxRetries) {
        throw error;
      }
      await new Promise(resolve => setTimeout(resolve, delay * attempt));
    }
  }
}

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
    logger.error('Shopify webhook validation error:', error.message, { category: 'webhook-orders-paid' });
    if (!res.headersSent) {
      res.status(401).json({ error: `Webhook validation failed: ${error.message}` });
    }
    return false;
  }
}

async function checkAndMarkWebhookProcessed(db, idempotencyKey, orderId, shop) {
  if (!idempotencyKey) {
    logger.warn(`Missing idempotency key for order paid ${orderId} on shop ${shop}. Proceeding without duplicate check.`, { category: 'webhook-orders-paid' });
    return { canProcess: true };
  }

  try {
    await db.collection('processed-webhooks').createIndex(
      { key: 1, orderId: 1, type: 1 },
      { unique: true, background: true }
    );
  } catch (indexError) {
    logger.warn(`Non-critical: Failed to ensure 'key_1_orderId_1_type_1' index on processed-webhooks for ${shop}: ${indexError.message}.`, { category: 'webhook-orders-paid' });
  }

  const processedWebhook = await db.collection('processed-webhooks').findOne({ 
    key: idempotencyKey, 
    orderId, 
    type: 'order_paid' 
  });
  
  if (processedWebhook) {
    logger.info(`Order paid webhook for order ${orderId} (key: ${idempotencyKey}) on shop ${shop} already processed at ${processedWebhook.processedAt}.`, { category: 'webhook-orders-paid' });
    return { canProcess: false, message: 'Webhook already processed' };
  }

  try {
    await db.collection('processed-webhooks').updateOne(
      { key: idempotencyKey, orderId, type: 'order_paid' },
      { $setOnInsert: { processedAt: new Date(), shop, type: 'order_paid' } },
      { upsert: true }
    );
    return { canProcess: true };
  } catch (err) {
    if (err.code === 11000) {
      logger.warn(`Concurrent processing detected for order paid webhook ${orderId} (key: ${idempotencyKey}) on shop ${shop}.`, { category: 'webhook-orders-paid' });
      return { canProcess: false, message: 'Webhook processed concurrently by another instance' };
    }
    logger.warn(`Failed to mark paid webhook as processed (key: ${idempotencyKey}, order ${orderId}, shop ${shop}): ${err.message}. Proceeding with caution.`, { category: 'webhook-orders-paid' });
    return { canProcess: true, warning: 'Failed to record processed webhook, but proceeding.' };
  }
}

async function enqueuePaidWebhook(db, webhookData) {
  const queueItem = {
    ...webhookData,
    type: 'order_paid',
    status: 'pending',
    createdAt: new Date(),
    attempts: 0,
    maxAttempts: 3
  };

  try {
    await db.collection('webhook-queue').createIndex({ createdAt: 1 }, { background: true });
    await db.collection('webhook-queue').createIndex({ status: 1, createdAt: 1 }, { background: true });
    await db.collection('webhook-queue').createIndex({ type: 1, status: 1 }, { background: true });
    
    const result = await db.collection('webhook-queue').insertOne(queueItem);
    logger.info(`Order paid webhook queued for order ${webhookData.orderPaidData.id} with ID: ${result.insertedId}`, { category: 'webhook-orders-paid' });
    return result.insertedId;
  } catch (error) {
    logger.error('Failed to enqueue order paid webhook:', error, { category: 'webhook-orders-paid' });
    throw error;
  }
}

async function triggerQueueProcessor(shop) {
  try {
    const response = await fetch(`${process.env.HOST}/api/process-queue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shop }),
    });
    
    if (!response.ok) {
      logger.warn(`Queue processor trigger failed: ${response.status}`, { category: 'webhook-orders-paid' });
    }
  } catch (error) {
    logger.warn('Failed to trigger queue processor:', error.message, { category: 'webhook-orders-paid' });
  }
}

export async function processQueuedPaidWebhook(db, queueItem) {
  const { orderPaidData, shop, idempotencyKey } = queueItem;
  
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

    // Check if order exists in our database
    const existingOrder = await db.collection('orders').findOne(
      { shop: shop, id: orderPaidData.id },
      { projection: { 'guard.status': 1 } }
    );

    if (!existingOrder) {
      logger.info(`Order ${orderPaidData.id} does not exist in our database, skipping.`, { category: 'webhook-orders-paid' });
      return;
    }

    const previousStatus = existingOrder?.guard?.status || 'unknown';

    if (previousStatus === 'paid') {
      logger.info(`Order ${orderPaidData.id} is already marked as paid, skipping.`, { category: 'webhook-orders-paid' });
      return;
    }
    
    // Update the order status to paid
    const updateOperation = () => db.collection('orders').updateOne(
      { shop: shop, id: orderPaidData.id },
      {
        $set: {
          'guard.status': 'paid',
          'guard.paymentStatus.captured': true,
          'guard.paymentStatus.cancelled': false,
          'guard.remark': `${previousStatus}`,
          'guard.paidAt': new Date(),
          'paidData': orderPaidData
        }
      }
    );

    const updateResult = await retryDbOperation(updateOperation);

    if (updateResult?.duplicateKeyError) {
      logger.info(`Order paid update for ${orderPaidData.id} resulted in duplicate key error, but this is non-critical for updates.`, { category: 'webhook-orders-paid' });
    } else if (updateResult?.modifiedCount > 0) {
      logger.info(`Order ${orderPaidData.id} successfully updated to paid status.`, { category: 'webhook-orders-paid' });
    } else if (updateResult?.matchedCount > 0) {
      logger.info(`Order ${orderPaidData.id} was matched but no modifications were needed (possibly already marked as paid).`, { category: 'webhook-orders-paid' });
    } else {
      logger.warn(`Order ${orderPaidData.id} was not found in database for paid update. This might be expected if the order was never flagged.`, { category: 'webhook-orders-paid' });
    }

    // Mark webhook as completed
    await db.collection('webhook-queue').updateOne(
      { _id: queueItem._id },
      { 
        $set: { 
          status: 'completed', 
          completedAt: new Date()
        } 
      }
    );

    logger.info(`Successfully processed queued paid webhook for order ${orderPaidData.id}`, { category: 'webhook-orders-paid' });
    return true;

  } catch (error) {
    logger.error(`Error processing queued paid webhook for order ${orderPaidData.id}:`, error.message, { category: 'webhook-orders-paid' });
    
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
      logger.error(`Paid webhook processing failed permanently for order ${orderPaidData.id} after ${queueItem.attempts} attempts`, { category: 'webhook-orders-paid' });
    }
    
    return false;
  }
}

const handler = async (req, res) => {
  // if (req.method !== 'POST') {
  //   return res.status(405).json({ error: 'Method not allowed' });
  // }

  const shop = req.headers['x-shopify-shop-domain'];
  const idempotencyKey = req.headers['x-shopify-hmac-sha256'] || req.headers['x-shopify-order-id'];

  let rawBodyString;
  try {
    const rawBodyBuffer = await buffer(req);
    rawBodyString = rawBodyBuffer.toString('utf8');
  } catch (bufError) {
    logger.error('Failed to buffer request body:', bufError, { category: 'webhook-orders-paid' });
    return res.status(500).json({ error: 'Failed to read request body' });
  }

  if (!await validateShopifyWebhook(req, rawBodyString, res)) {
    return;
  }

  let orderPaidData;
  try {
    orderPaidData = JSON.parse(rawBodyString);
  } catch (parseError) {
    logger.error('Failed to parse webhook JSON body:', parseError, { category: 'webhook-orders-paid' });
    return res.status(400).json({ error: 'Invalid JSON in webhook body' });
  }

  if (!shop || !orderPaidData?.id) {
    logger.error('Invalid webhook data: Missing shop or order ID.', { shop, orderId: orderPaidData?.id, category: 'webhook-orders-paid' });
    return res.status(400).json({ error: 'Incomplete or invalid order paid data in webhook.' });
  }

  let mongoClient;
  let db;
  try {
    mongoClient = await clientPromise;
    const storeName = shop.split('.')[0];
    db = mongoClient.db(storeName);
  } catch (dbConnectionError) {
    logger.error(`MongoDB connection error for shop ${shop}:`, dbConnectionError, { category: 'webhook-orders-paid' });
    return res.status(500).json({ error: 'Database connection failed' });
  }

  const processingStatus = await checkAndMarkWebhookProcessed(db, idempotencyKey, orderPaidData.id, shop);
  if (!processingStatus.canProcess) {
    return res.status(200).json({ success: true, message: processingStatus.message });
  }
  if (processingStatus.warning) logger.warn(processingStatus.warning, { category: 'webhook-orders-paid' });

  try {
    const webhookData = {
      orderPaidData,
      shop,
      idempotencyKey,
      rawHeaders: req.headers
    };

    await enqueuePaidWebhook(db, webhookData);
    
    // Trigger queue processor (fire and forget)
    triggerQueueProcessor(shop);

    return res.status(200).json({ 
      success: true, 
      message: 'Order paid webhook received and queued for processing' 
    });

  } catch (error) {
    logger.error(`Failed to queue paid webhook for order ${orderPaidData.id}, shop ${shop}:`, error, { category: 'webhook-orders-paid' });
    return res.status(500).json({ error: 'Failed to queue paid webhook for processing' });
  }
}

export default withMiddleware("verifyHmac")(handler); 