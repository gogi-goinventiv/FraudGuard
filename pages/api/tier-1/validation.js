import jwt from 'jsonwebtoken';
import sessionHandler from '../utils/sessionHandler';
import clientPromise from '../../../lib/mongo';
import { removeStatusTags } from '../utils/removeStatusTags';
import { addStatusTags } from '../utils/addStatusTags';
import { shopify } from "../../../lib/shopify";

const MAX_VERIFICATION_ATTEMPTS = 3;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    if (!req.headers.authorization) {
      return res.status(401).json({ error: 'Unauthorized', details: 'No authorization token provided' });
    }

    const token = req.headers.authorization.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized', details: 'Invalid token format' });
    }

    const decodedToken = jwt.verify(token, process.env.JWT_SECRET);
    const { lastFourDigits, zipCode } = req.body;
    const { orderId, customerEmail, shop } = decodedToken;

    if (!orderId || !customerEmail || !shop || !lastFourDigits) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const storeName = shop.split('.')[0];
    const client = await clientPromise;
    const db = client.db(storeName);

    const existingOrder = await db.collection('orders').findOne({
      shop: shop,
      id: orderId
    });

    if (existingOrder?.guard?.attempts >= MAX_VERIFICATION_ATTEMPTS) {
      return res.status(429).json({
        error: 'Maximum verification attempts exceeded',
        message: 'No more attempts allowed for this order'
      });
    }

    const session = await sessionHandler.loadSession(shop);

    const [orderResponse, txnsResponse, riskSettingsResponse] = await Promise.all([
      fetch(`https://${shop}/admin/api/2025-04/orders/${orderId}.json`, {
        headers: {
          'X-Shopify-Access-Token': session.accessToken,
          'Content-Type': 'application/json',
        },
      }),
      fetch(`https://${shop}/admin/api/2025-04/orders/${orderId}/transactions.json`, {
        headers: {
          'X-Shopify-Access-Token': session.accessToken,
          'Content-Type': 'application/json',
        },
      }),
      fetch(`${process.env.HOST}/api/settings/risk-settings?shop=${shop}`)
    ]);

    const [{ order: orderData }, txnData, riskSettings] = await Promise.all([
      orderResponse.json(),
      txnsResponse.json(),
      riskSettingsResponse.json()
    ]);

    if (!orderData) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (orderData.email !== customerEmail) {
      return res.status(404).json({ error: 'Invalid customer email' });
    }

    const billingZip = orderData.billing_address?.zip;
    const requiresZipValidation = billingZip && zipCode !== undefined;

    if (billingZip && !zipCode) {
      return res.status(400).json({ error: 'Missing zip code', message: 'Zip code is required' });
    }

    const validTransaction = txnData.transactions.some(txn =>
      txn.status === 'success' &&
      txn.payment_details?.credit_card_number?.slice(-4) === lastFourDigits
    );

    const zipValid = !requiresZipValidation || billingZip === zipCode;
    const isValid = validTransaction && zipValid;

    const currentAttempts = (existingOrder?.guard?.attempts || 0) + 1;

    if (!isValid) {
      const remainingAttempts = MAX_VERIFICATION_ATTEMPTS - currentAttempts;

      if (currentAttempts >= MAX_VERIFICATION_ATTEMPTS) {
        await handleFailedVerification(db, shop, orderId, orderData, riskSettings.autoCancelUnverified, currentAttempts, session);
        return res.status(429).json({
          error: 'Maximum verification attempts exceeded',
          message: 'Order has been marked as unverified due to multiple failed attempts'
        });
      }

      await incrementVerificationAttempts(db, shop, orderId, currentAttempts);

      const errorMessage = !validTransaction ? 'Invalid last four digits' : 'Invalid zip code';
      return res.status(422).json({
        error: errorMessage,
        message: `You have ${remainingAttempts} attempt${remainingAttempts !== 1 ? 's' : ''} left`
      });
    }

    const result = await updateOrderVerificationStatus(db, shop, orderId, 'verified', session);

    if (riskSettings.autoApproveVerified) {
      handleAutoCapture(shop, orderId, orderData?.total_price);
    }

    if (result.modifiedCount === 0) {
      return res.status(404).json({ message: 'Order not found or already verified' });
    }

    return res.status(200).json({ success: true, message: 'Order validated successfully' });
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Unauthorized' });
    } else if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired', details: error.message });
    } else if (error.name === 'NotBeforeError') {
      return res.status(401).json({ error: 'Token not active', details: error.message });
    }

    return res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
}

async function updateOrderVerificationStatus(db, shop, orderId, status, session) {

  const shopifyClient = new shopify.clients.Graphql({ session });

  const existingOrder = await db.collection('orders').findOne(
    { shop: shop, id: orderId },
    { projection: { 'admin_graphql_api_id': 1, 'guard.verificationStatusTag': 1 } }
  );

  if (status === 'verified') {
    const tagsToRemove = [existingOrder?.guard?.verificationStatusTag] || [];
    const tagsToAdd = ['FG_Verified'];

    if (tagsToRemove.length > 0) {
      await removeStatusTags(shopifyClient, existingOrder?.admin_graphql_api_id, tagsToRemove);
    }

    if (tagsToAdd.length > 0) {
      await addStatusTags(shopifyClient, existingOrder?.admin_graphql_api_id, tagsToAdd);
    }
  }

  return db.collection('orders').updateOne(
    {
      shop: shop,
      id: orderId,
      'guard.isVerificationRequired': true
    },
    {
      $set: {
        'guard.isVerificationRequired': false,
        'guard.status': status,
        'guard.remark': status,
        'guard.verificationStatusTag': status === 'verified' ? 'FG_Verified' : 'FG_Unverified'
      }
    }
  );
}

async function incrementVerificationAttempts(db, shop, orderId, attempts) {
  return db.collection('orders').updateOne(
    {
      shop: shop,
      id: orderId
    },
    {
      $set: {
        'guard.attempts': attempts,
        'guard.lastAttempt': new Date()
      }
    },
    { upsert: true }
  );
}

async function handleFailedVerification(db, shop, orderId, orderData, autoCancelUnverified, attempts, session) {

  const shopifyClient = new shopify.clients.Graphql({ session });

  const existingOrder = await db.collection('orders').findOne(
    { shop: shop, id: orderId },
    { projection: { 'admin_graphql_api_id': 1, 'guard.verificationStatusTag': 1 } }
  );

  const tagsToRemove = [existingOrder?.guard?.verificationStatusTag] || [];
  const tagsToAdd = ['FG_Unverified'];

  if (tagsToRemove.length > 0) {
    await removeStatusTags(shopifyClient, existingOrder?.admin_graphql_api_id, tagsToRemove);
  }

  if (tagsToAdd.length > 0) {
    await addStatusTags(shopifyClient, existingOrder?.admin_graphql_api_id, tagsToAdd);
  }

  await db.collection('orders').updateOne(
    {
      shop: shop,
      id: orderId
    },
    {
      $set: {
        'guard.isVerificationRequired': false,
        'guard.status': 'unverified',
        'guard.remark': 'unverified',
        'guard.attempts': attempts,
        'guard.maxAttemptsReached': true,
        'guard.lastAttempt': new Date(),
        'guard.verificationStatusTag': 'FG_Unverified'
      }
    },
    { upsert: true }
  );

  if (autoCancelUnverified) {
    try {
      const cancelResponse = await fetch(`${process.env.HOST}/api/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, shop, orderAmount: orderData?.total_price }),
      });

      if (!cancelResponse.ok) {
        const cancelData = await cancelResponse.json();
        throw new Error(cancelData.error || 'Auto cancel failed');
      }

      console.log('Auto cancelling unverified orders');
    } catch (error) {
      console.log('Auto cancel failed:', error);
    }
  }
}

async function handleAutoCapture(shop, orderId, orderAmount) {
  try {
    const captureResponse = await fetch(`${process.env.HOST}/api/capture`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId, shop, orderAmount }),
    });

    if (!captureResponse.ok) {
      const captureData = await captureResponse.json();
      throw new Error(captureData.error || 'Auto capture failed');
    }

    console.log('Auto capturing verified orders');
  } catch (error) {
    console.log('Auto capture failed:', error);
  }
}