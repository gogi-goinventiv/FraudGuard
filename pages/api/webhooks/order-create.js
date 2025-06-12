// pages/api/webhooks/order-create.js
import { buffer } from 'micro';
import { shopify } from '../../../lib/shopify';
import clientPromise from '../../../lib/mongo';
import { getRiskLevel } from '../utils/riskLevel';
import sessionHandler from '../utils/sessionHandler';
import { updateOrdersOnHold } from '../utils/updateRiskStats';
import { whichOrdersToFlag } from '../utils/whichOrdersToFlag';
import { whichOrdersToSendEmail } from '../utils/whichOrdersToSendEmail';
import withMiddleware from '../utils/middleware/withMiddleware';
import { EMAIL_RESEND_DELAY_IN_DAYS } from '../../../config/constants';

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
        console.log(`Duplicate key error during DB operation (attempt ${attempt}/${maxRetries}). Indicating pre-existing data or race condition.`);
        return { duplicateKeyError: true, error, success: false };
      }
      console.error(`Database operation failed (attempt ${attempt}/${maxRetries}):`, error.message);
      if (attempt >= maxRetries) {
        throw error;
      }
      await new Promise(resolve => setTimeout(resolve, delay * attempt));
    }
  }
}

async function getOrderRisks(shopifyClient, orderIdGid) {
  const query = `
    query getOrderRisks($orderId: ID!) {
      order(id: $orderId) {
        risk { assessments { facts { description sentiment } riskLevel } recommendation }
      }
    }
  `;
  try {
    const response = await shopifyClient.request(query, { variables: { orderId: orderIdGid } });
    if (response?.data?.order?.risk) {
      return response.data.order.risk;
    }
    const errorDetails = response?.errors ? JSON.stringify(response.errors, null, 2) : 'No risk data found.';
    console.error('Unexpected response structure for order risks:', errorDetails);
    return {};
  } catch (error) {
    const gqlErrors = error.response?.errors ? JSON.stringify(error.response.errors, null, 2) : '';
    console.error('Error fetching order risks:', error.message, gqlErrors);
    return {};
  }
}

async function getOrderTxnDetails(shopifyClient, orderIdGid){
  const query = `
    query GetOrderTransactions($orderId: ID!) {
      order(id: $orderId) {
        transactions { accountNumber status kind }
      }
    }
  `
  try {
    const response = await shopifyClient.request(query, { variables: { orderId: orderIdGid } });
    if (response?.data?.order?.transactions) {
      return response.data.order.transactions;
    }
    const errorDetails = response?.errors ? JSON.stringify(response.errors, null, 2) : 'No transaction data found.';
    console.error('Unexpected response structure for order transactions:', errorDetails);
    return [];
  } catch (error) {
    const gqlErrors = error.response?.errors ? JSON.stringify(error.response.errors, null, 2) : '';
    console.error('Error fetching order transactions:', error.message, gqlErrors);
    return [];
  }
}

async function makeApiRequest(endpoint, data, ignoreErrors = false) {
  try {
    const response = await fetch(`${process.env.HOST}/api/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const responseData = await response.json();
    if (!response.ok) {
      const errorMessage = responseData.error || `API request to /api/${endpoint} failed with status ${response.status}`;
      if (!ignoreErrors) throw new Error(errorMessage);
      console.warn(`Ignored non-critical /api/${endpoint} error:`, errorMessage);
      return { success: false, error: errorMessage, data: responseData };
    }
    return responseData;
  } catch (error) {
    if (ignoreErrors) {
      console.warn(`Ignored non-critical /api/${endpoint} fetch error:`, error.message);
      return { success: false, error: error.message };
    }
    console.error(`Error in makeApiRequest for /api/${endpoint}:`, error.message);
    throw error;
  }
}

async function handleFlaggedOrder(db, orderData, shop, riskLevel, riskSettings, shopifyRiskAssessments, orderTxnDetails) {
  const existingOrder = await db.collection('orders').findOne({ shop, id: orderData.id });
  if (existingOrder) {
    console.log(`Order ${orderData.id} for shop ${shop} already exists in database. Skipping insertion step.`);
  } else {
    const orderDoc = {
      ...orderData,
      shop,
      guard: {
        isVerificationRequired: true,
        email: { lastSentAt: null, count: 0, maxPerPeriod: 1, minResendDelayMs: EMAIL_RESEND_DELAY_IN_DAYS * 24 * 60 * 60 * 1000 },
        status: 'pending',
        paymentStatus: { captured: false, cancelled: false },
        riskLevel,
        shopifyRisk: shopifyRiskAssessments,
        txnDetails: orderTxnDetails
      },
      receivedAt: new Date(),
    };

    const insertOperation = () => db.collection('orders').updateOne(
      { shop, id: orderData.id },
      { $setOnInsert: orderDoc },
      { upsert: true }
    );
    const result = await retryDbOperation(insertOperation);

    if (result?.duplicateKeyError) {
      console.log(`Order ${orderData.id} insertion attempt resulted in duplicate key, likely inserted concurrently.`);
    } else if (result?.upsertedId) {
      console.log(`Order ${orderData.id} successfully inserted with new ID: ${result.upsertedId}.`);
    } else if (result?.matchedCount > 0) {
      console.log(`Order ${orderData.id} matched existing document, $setOnInsert had no effect.`);
    } else if (!result?.acknowledged) {
      console.warn(`Order ${orderData.id} database operation was not acknowledged. Result:`, result);
    }
  }

  if (riskLevel.risk === 'high' && riskSettings?.autoCancelHighRisk) {
    console.log(`Auto-cancelling high-risk order ${orderData.id} for ${shop}.`);
    await makeApiRequest('cancel', { orderId: orderData.id, shop, orderAmount: orderData.total_price }, true);
  }

  try {
    await updateOrdersOnHold(shop);
  } catch (statsError) {
    console.error(`Failed to update orders on hold stats for ${shop}:`, statsError.message);
  }

  if (whichOrdersToSendEmail(riskLevel, riskSettings)) {
    try {
      const fetchStoredOrderOp = async () => {
        const order = await db.collection('orders').findOne({ shop, id: orderData.id });
        if (!order) throw new Error(`Could not retrieve stored order ${orderData.id} for email.`);
        return order;
      };
      const storedOrder = await retryDbOperation(fetchStoredOrderOp);
      
      if (storedOrder && !storedOrder.duplicateKeyError && storedOrder.id) {
         await makeApiRequest('email', { order: storedOrder }, true);
      } else {
        console.warn(`Skipping email for order ${orderData.id}; order not found after upsert or fetch issue.`);
      }
    } catch (emailError) {
      console.error(`Failed to send verification email for order ${orderData.id}:`, emailError.message);
    }
  }
  return true;
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
    console.error('Shopify webhook validation error:', error.message);
    if (!res.headersSent) {
      res.status(401).json({ error: `Webhook validation failed: ${error.message}` });
    }
    return false;
  }
}

async function fetchRiskSettings(shop) {
  try {
    const response = await fetch(`${process.env.HOST}/api/settings/risk-settings?shop=${shop}`);
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Failed to fetch risk settings for ${shop}: ${response.status} ${errorText}`);
      return {};
    }
    return await response.json();
  } catch (error) {
    console.error(`Network or parsing error fetching risk settings for ${shop}:`, error.message);
    return {};
  }
}

async function checkAndMarkWebhookProcessed(db, idempotencyKey, orderId, shop) {
  if (!idempotencyKey) {
    console.warn(`Missing idempotency key for order ${orderId} on shop ${shop}. Proceeding without duplicate check.`);
    return { canProcess: true };
  }

  try {
    await db.collection('processed-webhooks').createIndex(
      { key: 1, orderId: 1 },
      { unique: true, background: true }
    );
  } catch (indexError) {
    console.warn(`Non-critical: Failed to ensure 'key_1_orderId_1' index on processed-webhooks for ${shop}: ${indexError.message}.`);
  }

  const processedWebhook = await db.collection('processed-webhooks').findOne({ key: idempotencyKey, orderId });
  if (processedWebhook) {
    console.log(`Webhook for order ${orderId} (key: ${idempotencyKey}) on shop ${shop} already processed at ${processedWebhook.processedAt}.`);
    return { canProcess: false, message: 'Webhook already processed' };
  }

  try {
    await db.collection('processed-webhooks').updateOne(
      { key: idempotencyKey, orderId },
      { $setOnInsert: { processedAt: new Date(), shop } },
      { upsert: true }
    );
    return { canProcess: true };
  } catch (err) {
    if (err.code === 11000) {
      console.log(`Concurrent processing detected for webhook order ${orderId} (key: ${idempotencyKey}) on shop ${shop}.`);
      return { canProcess: false, message: 'Webhook processed concurrently by another instance' };
    }
    console.warn(`Failed to mark webhook as processed (key: ${idempotencyKey}, order ${orderId}, shop ${shop}): ${err.message}. Proceeding with caution.`);
    return { canProcess: true, warning: 'Failed to record processed webhook, but proceeding.' };
  }
}

async function enqueueWebhook(db, webhookData) {
  const queueItem = {
    ...webhookData,
    status: 'pending',
    createdAt: new Date(),
    attempts: 0,
    maxAttempts: 3
  };

  try {
    await db.collection('webhook-queue').createIndex({ createdAt: 1 }, { background: true });
    await db.collection('webhook-queue').createIndex({ status: 1, createdAt: 1 }, { background: true });
    
    const result = await db.collection('webhook-queue').insertOne(queueItem);
    console.log(`Webhook queued for order ${webhookData.orderData.id} with ID: ${result.insertedId}`);
    return result.insertedId;
  } catch (error) {
    console.error('Failed to enqueue webhook:', error);
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
      console.warn(`Queue processor trigger failed: ${response.status}`);
    }
  } catch (error) {
    console.warn('Failed to trigger queue processor:', error.message);
  }
}

export async function processQueuedWebhook(db, queueItem) {
  const { orderData, shop, idempotencyKey, rawHeaders } = queueItem;
  
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

    let session;
    try {
      session = await sessionHandler.loadSession(shop);
      if (!session?.accessToken) throw new Error('Invalid session or missing access token');
    } catch (sessionError) {
      throw new Error(`Session loading error for ${shop}: ${sessionError.message}`);
    }

    const [riskSettings, shopifyApiRiskData] = await Promise.all([
      fetchRiskSettings(shop),
      getOrderRisks(new shopify.clients.Graphql({ session }), orderData.admin_graphql_api_id),
    ]);

    const orderTxnDetails = await getOrderTxnDetails(new shopify.clients.Graphql({ session }), orderData.admin_graphql_api_id);
    console.log(`Order ${orderData.id} for shop ${shop} has transaction details:`, orderTxnDetails);

    const riskLevel = await getRiskLevel(orderData, shop, session.accessToken, shopifyApiRiskData, orderTxnDetails)
      .catch(err => {
        console.error(`Critical error in getRiskLevel for order ${orderData.id}, shop ${shop}:`, err.message);
        return { risk: 'unknown', score: 0, factors: [], error: `Risk assessment failed: ${err.message}` };
      });

    if (whichOrdersToFlag(riskLevel, riskSettings)) {
      console.log(`Order ${orderData.id} for shop ${shop} is being flagged. Risk: ${riskLevel.risk}, Score: ${riskLevel.score}`);
      await handleFlaggedOrder(db, orderData, shop, riskLevel, riskSettings, shopifyApiRiskData, orderTxnDetails);
    } else {
      const existingOrderInDb = await db.collection('orders').findOne({ shop, id: orderData.id });
      if (existingOrderInDb) {
        console.log(`Order ${orderData.id} (not flagged path) for shop ${shop} already exists in our database. Assuming handled.`);
      } else {
        console.log(`Order ${orderData.id} for shop ${shop} not flagged. Attempting payment capture.`);
        const captureData = { orderId: orderData.id, shop, orderAmount: orderData.total_price, notFlagged: true };
        const captureResult = await makeApiRequest('capture', captureData, true);

        if (!captureResult.success) {
          console.warn(`Payment capture attempt for order ${orderData.id} (shop ${shop}) was not successful: ${captureResult.error}`);
        } else {
          console.log(`Payment capture attempt for order ${orderData.id} (shop ${shop}) processed. API response:`, captureResult);
        }
      }
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

    console.log(`Successfully processed queued webhook for order ${orderData.id}`);
    return true;

  } catch (error) {
    console.error(`Error processing queued webhook for order ${orderData.id}:`, error.message);
    
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
      console.error(`Webhook processing failed permanently for order ${orderData.id} after ${queueItem.attempts} attempts`);
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

  let orderData;
  try {
    orderData = JSON.parse(rawBodyString);
  } catch (parseError) {
    console.error('Failed to parse webhook JSON body:', parseError);
    return res.status(400).json({ error: 'Invalid JSON in webhook body' });
  }

  if (!shop || !orderData?.id || !orderData?.admin_graphql_api_id) {
    console.error('Invalid webhook data: Missing shop, order ID, or admin_graphql_api_id.', { shop, orderId: orderData?.id });
    return res.status(400).json({ error: 'Incomplete or invalid order data in webhook.' });
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

  const processingStatus = await checkAndMarkWebhookProcessed(db, idempotencyKey, orderData.id, shop);
  if (!processingStatus.canProcess) {
    return res.status(200).json({ success: true, message: processingStatus.message });
  }
  if (processingStatus.warning) console.warn(processingStatus.warning);

  try {
    const webhookData = {
      orderData,
      shop,
      idempotencyKey,
      rawHeaders: req.headers
    };

    await enqueueWebhook(db, webhookData);
    
    triggerQueueProcessor(shop);

    return res.status(200).json({ 
      success: true, 
      message: 'Webhook received and queued for processing' 
    });

  } catch (error) {
    console.error(`Failed to queue webhook for order ${orderData.id}, shop ${shop}:`, error);
    return res.status(500).json({ error: 'Failed to queue webhook for processing' });
  }
}

// Export the handler wrapped with HMAC verification middleware
export default withMiddleware("verifyHmac")(handler);
