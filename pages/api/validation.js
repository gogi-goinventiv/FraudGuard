// pages/api/validation.js
import jwt from 'jsonwebtoken';
import sessionHandler from './utils/sessionHandler';
import clientPromise from '../../lib/mongo';
import { removeStatusTags } from './utils/removeStatusTags';
import { addStatusTags } from './utils/addStatusTags';
import { shopify } from "../../lib/shopify";

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
    const {
      lastFourDigits,
      cardholderName,
      zipCode,
      billing_first_name,
      billing_last_name,
      billing_address1,
      billing_city,
      billing_zip,
      billing_province,
      billing_country
    } = req.body;
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

    const billing = orderData.billing_address || {};
    const errors = {};

    // Validate last four digits (as before)
    const validTransaction = txnData.transactions.some(txn =>
      txn.status === 'success' &&
      txn.payment_details?.credit_card_number?.slice(-4) === lastFourDigits
    );
    if (!validTransaction) errors.lastFourDigits = 'Last 4 digits do not match any successful transaction';

    // Validate cardholder name (case-insensitive, ignore spaces)
    if (cardholderName && billing.name) {
      const normalize = s => s.replace(/\s+/g, '').toLowerCase();
      if (normalize(cardholderName) !== normalize(billing.name)) {
        errors.cardholderName = 'Cardholder name does not match billing name';
      }
    }

    // Validate address fields
    if (billing_first_name && billing.first_name && billing_first_name.trim().toLowerCase() !== billing.first_name.trim().toLowerCase()) {
      errors.billing_first_name = 'First name does not match';
    }
    if (billing_last_name && billing.last_name && billing_last_name.trim().toLowerCase() !== billing.last_name.trim().toLowerCase()) {
      errors.billing_last_name = 'Last name does not match';
    }
    if (billing_address1 && billing.address1 && billing_address1.trim().toLowerCase() !== billing.address1.trim().toLowerCase()) {
      errors.billing_address1 = 'Street address does not match';
    }
    if (billing_city && billing.city && billing_city.trim().toLowerCase() !== billing.city.trim().toLowerCase()) {
      errors.billing_city = 'City does not match';
    }
    if (billing_zip && billing.zip && billing_zip.trim().toLowerCase() !== billing.zip.trim().toLowerCase()) {
      errors.billing_zip = 'Zip code does not match';
    }
    if (billing_province && billing.province && billing_province.trim().toLowerCase() !== billing.province.trim().toLowerCase()) {
      errors.billing_province = 'Province does not match';
    }
    if (billing_country && billing.country && billing_country.trim().toLowerCase() !== billing.country.trim().toLowerCase()) {
      errors.billing_country = 'Country does not match';
    }
    // Validate zipCode (form field) against billing zip
    if (billing.zip && zipCode && zipCode.trim().toLowerCase() !== billing.zip.trim().toLowerCase()) {
      errors.zipCode = 'Zip code does not match billing address';
    }

    // If any errors, return them
    if (Object.keys(errors).length > 0) {
      // Increment attempts as in your current logic
      const currentAttempts = (existingOrder?.guard?.attempts || 0) + 1;
      await incrementVerificationAttempts(db, shop, orderId, currentAttempts);

      // Check if max attempts reached
      if (currentAttempts >= MAX_VERIFICATION_ATTEMPTS) {
        await handleFailedVerification(db, shop, orderId, orderData, riskSettings.autoCancelUnverified, currentAttempts, session);
        return res.status(429).json({
          error: 'Maximum verification attempts exceeded',
          message: 'Order has been marked as unverified due to multiple failed attempts'
        });
      }

      const remainingAttempts = MAX_VERIFICATION_ATTEMPTS - currentAttempts;
      return res.status(422).json({ 
        error: 'Validation failed', 
        details: errors,
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