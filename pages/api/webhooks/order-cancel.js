// pages/api/webhooks/order-cancel.js
import { buffer } from 'micro';
import { shopify } from '../../../lib/shopify';
import clientPromise from '../../../lib/mongo';
import { incrementRiskPreventedAmount, updateOrdersOnHold } from "../utils/updateRiskStats";
import withMiddleware from '../utils/middleware/withMiddleware';
import sessionHandler from '../utils/sessionHandler';
import { removeStatusTags } from '../utils/removeStatusTags';

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
        console.warn(`Duplicate key error during DB operation (attempt ${attempt}/${maxRetries}). Indicating pre-existing data or race condition.`, { category: 'webhook-order-cancel' });
        return { duplicateKeyError: true, error, success: false };
      }
      console.error(`Database operation failed (attempt ${attempt}/${maxRetries}):`, error.message, { category: 'webhook-order-cancel' });
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
    console.error('Shopify webhook validation error:', error.message, { category: 'webhook-order-cancel' });
    if (!res.headersSent) {
      res.status(401).json({ error: `Webhook validation failed: ${error.message}` });
    }
    return false;
  }
}

async function checkAndMarkWebhookProcessed(db, idempotencyKey, orderId, shop) {
  if (!idempotencyKey) {
    console.warn(`Missing idempotency key for order cancellation ${orderId} on shop ${shop}. Proceeding without duplicate check.`, { category: 'webhook-order-cancel' });
    return { canProcess: true };
  }

  try {
    await db.collection('processed-webhooks').createIndex(
      { key: 1, orderId: 1, type: 1 },
      { unique: true, background: true }
    );
  } catch (indexError) {
    console.warn(`Non-critical: Failed to ensure 'key_1_orderId_1_type_1' index on processed-webhooks for ${shop}: ${indexError.message}.`, { category: 'webhook-order-cancel' });
  }

  const processedWebhook = await db.collection('processed-webhooks').findOne({ 
    key: idempotencyKey, 
    orderId, 
    type: 'order_cancel' 
  });
  
  if (processedWebhook) {
    console.info(`Order cancellation webhook for order ${orderId} (key: ${idempotencyKey}) on shop ${shop} already processed at ${processedWebhook.processedAt}.`, { category: 'webhook-order-cancel' });
    return { canProcess: false, message: 'Webhook already processed' };
  }

  try {
    await db.collection('processed-webhooks').updateOne(
      { key: idempotencyKey, orderId, type: 'order_cancel' },
      { $setOnInsert: { processedAt: new Date(), shop, type: 'order_cancel' } },
      { upsert: true }
    );
    return { canProcess: true };
  } catch (err) {
    if (err.code === 11000) {
      console.warn(`Concurrent processing detected for order cancellation webhook ${orderId} (key: ${idempotencyKey}) on shop ${shop}.`, { category: 'webhook-order-cancel' });
      return { canProcess: false, message: 'Webhook processed concurrently by another instance' };
    }
    console.warn(`Failed to mark cancellation webhook as processed (key: ${idempotencyKey}, order ${orderId}, shop ${shop}): ${err.message}. Proceeding with caution.`, { category: 'webhook-order-cancel' });
    return { canProcess: true, warning: 'Failed to record processed webhook, but proceeding.' };
  }
}

async function enqueueCancelWebhook(db, webhookData) {
  const queueItem = {
    ...webhookData,
    type: 'order_cancel',
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
    console.info(`Order cancellation webhook queued for order ${webhookData.orderCancelData.id} with ID: ${result.insertedId}.`, { category: 'webhook-order-cancel' });
    return result.insertedId;
  } catch (error) {
    console.error('Failed to enqueue order cancellation webhook:', error, { category: 'webhook-order-cancel' });
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
      console.warn(`Queue processor trigger failed: ${response.status}.`, { category: 'webhook-order-cancel' });
    }
  } catch (error) {
    console.warn('Failed to trigger queue processor:', error.message, { category: 'webhook-order-cancel' });
  }
}

export async function processQueuedCancelWebhook(db, queueItem) {
  const { orderCancelData, shop, idempotencyKey } = queueItem;
  
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

    console.info(`Processing order cancellation for order ${orderCancelData.id} on shop ${shop}. Cancel data:`, orderCancelData, { category: 'webhook-order-cancel' });

    // Check if order exists in our database
    const existingOrder = await db.collection('orders').findOne(
      { shop: shop, id: orderCancelData.id },
      { projection: { 'guard.status': 1, 'guard.riskStatusTag': 1, 'admin_graphql_api_id': 1 } }
    );

    if (!existingOrder) {
      console.info(`Order ${orderCancelData.id} does not exist in our database, skipping.`, { category: 'webhook-order-cancel' });
      return;
    }

    const previousStatus = existingOrder?.guard?.status || 'unknown';
    const riskStatusTag = existingOrder?.guard?.riskStatusTag || '';

    const tagsToRemove = [riskStatusTag];
    const session = await sessionHandler.loadSession(shop);

    if (tagsToRemove.length > 0) {
      await removeStatusTags(new shopify.clients.Graphql({ session }), existingOrder?.admin_graphql_api_id, tagsToRemove);
      console.info({ category: 'webhook-orders-paid', message: 'Status tags removed for order', tags: tagsToRemove });
    }

    if (previousStatus === 'cancelled payment') {
      console.info(`Order ${orderCancelData.id} is already cancelled, skipping.`, { category: 'webhook-order-cancel' });
      return;
    }
    
    // Update the order status to cancelled
    const updateOperation = () => db.collection('orders').updateOne(
      { shop: shop, id: orderCancelData.id },
      {
        $set: {
          'guard.status': 'cancelled payment',
          'guard.paymentStatus.captured': false,
          'guard.paymentStatus.cancelled': true,
          'guard.remark': `${previousStatus}`,
          'guard.cancelledAt': new Date(),
          'cancelData': orderCancelData
        }
      }
    );

    const updateResult = await retryDbOperation(updateOperation);

    if (updateResult?.duplicateKeyError) {
      console.info(`Order cancellation update for ${orderCancelData.id} resulted in duplicate key error, but this is non-critical for updates.`, { category: 'webhook-order-cancel' });
    } else if (updateResult?.modifiedCount > 0) {
      console.info(`Order ${orderCancelData.id} successfully updated to cancelled status.`, { category: 'webhook-order-cancel' });
    } else if (updateResult?.matchedCount > 0) {
      console.info(`Order ${orderCancelData.id} was matched but no modifications were needed (possibly already cancelled).`, { category: 'webhook-order-cancel' });
    } else {
      console.warn(`Order ${orderCancelData.id} was not found in database for cancellation update. This might be expected if the order was never flagged.`, { category: 'webhook-order-cancel' });
    }

    await incrementRiskPreventedAmount(shop, parseFloat(orderCancelData.total_price));
    await updateOrdersOnHold(shop, true);

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

    console.info(`Successfully processed queued cancellation webhook for order ${orderCancelData.id}.`, { category: 'webhook-order-cancel' });
    return true;

  } catch (error) {
    console.error(`Error processing queued cancellation webhook for order ${orderCancelData.id}:`, error.message, { category: 'webhook-order-cancel' });
    
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
      console.error(`Cancellation webhook processing failed permanently for order ${orderCancelData.id} after ${queueItem.attempts} attempts.`, { category: 'webhook-order-cancel' });
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
    console.error('Failed to buffer request body:', bufError, { category: 'webhook-order-cancel' });
    return res.status(500).json({ error: 'Failed to read request body' });
  }

  if (!await validateShopifyWebhook(req, rawBodyString, res)) {
    return;
  }

  let orderCancelData;
  try {
    orderCancelData = JSON.parse(rawBodyString);
  } catch (parseError) {
    console.error('Failed to parse webhook JSON body:', parseError, { category: 'webhook-order-cancel' });
    return res.status(400).json({ error: 'Invalid JSON in webhook body' });
  }

  if (!shop || !orderCancelData?.id) {
    console.error('Invalid webhook data: Missing shop or order ID.', { shop, orderId: orderCancelData?.id, category: 'webhook-order-cancel' });
    return res.status(400).json({ error: 'Incomplete or invalid order cancellation data in webhook.' });
  }

  let mongoClient;
  let db;
  try {
    mongoClient = await clientPromise;
    const storeName = shop.split('.')[0];
    db = mongoClient.db(storeName);
  } catch (dbConnectionError) {
    console.error(`MongoDB connection error for shop ${shop}:`, dbConnectionError, { category: 'webhook-order-cancel' });
    return res.status(500).json({ error: 'Database connection failed' });
  }

  const processingStatus = await checkAndMarkWebhookProcessed(db, idempotencyKey, orderCancelData.id, shop);
  if (!processingStatus.canProcess) {
    return res.status(200).json({ success: true, message: processingStatus.message });
  }
  if (processingStatus.warning) console.warn(processingStatus.warning, { category: 'webhook-order-cancel' });

  try {
    const webhookData = {
      orderCancelData,
      shop,
      idempotencyKey,
      rawHeaders: req.headers
    };

    await enqueueCancelWebhook(db, webhookData);
    
    // Trigger queue processor (fire and forget)
    triggerQueueProcessor(shop);

    return res.status(200).json({ 
      success: true, 
      message: 'Order cancellation webhook received and queued for processing' 
    });

  } catch (error) {
    console.error(`Failed to queue cancellation webhook for order ${orderCancelData.id}, shop ${shop}:`, error, { category: 'webhook-order-cancel' });
    return res.status(500).json({ error: 'Failed to queue cancellation webhook for processing' });
  }
}

// Export the handler wrapped with HMAC verification middleware
export default withMiddleware("verifyHmac")(handler);
