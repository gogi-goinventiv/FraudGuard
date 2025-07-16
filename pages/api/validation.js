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
    const { lastFourDigits, bin_country } = req.body;
    const { orderId, customerEmail, shop } = decodedToken;


    if (!orderId || !customerEmail || !shop || !lastFourDigits || !bin_country) {
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
    const shopifyClient = new shopify.clients.Graphql({ session });

    // Get order transactions using GraphQL
    const transactionQuery = `
      query GetOrderTransactions($id: ID!) {
        order(id: $id) {
          transactions {
            id
            accountNumber
            status
            kind
            manuallyCapturable
            paymentDetails
          }
        }
      }
    `;

    const [orderResponse, riskSettingsResponse] = await Promise.all([
      fetch(`https://${shop}/admin/api/2025-04/orders/${orderId}.json`, {
        headers: {
          'X-Shopify-Access-Token': session.accessToken,
          'Content-Type': 'application/json',
        },
      }),
      fetch(`${process.env.HOST}/api/settings/risk-settings?shop=${shop}`)
    ]);

    if (!orderResponse.ok) {
      const text = await orderResponse.text();
      throw new Error(`Order API error: ${orderResponse.status} - ${text}`);
    }

    const [{ order: orderData }, riskSettings] = await Promise.all([
      orderResponse.json(),
      riskSettingsResponse.json()
    ]);

    // Get successful transaction and its payment details
    const txnResponse = await shopifyClient.request(transactionQuery, {
      variables: { id: `gid://shopify/Order/${orderId}` }
    });

    const successfulTxn = txnResponse.data.order.transactions.find(txn =>
      txn.status === 'SUCCESS' && txn.kind === 'AUTHORIZATION'
    );

    if (!successfulTxn) {
      return res.status(404).json({ error: 'No successful transaction found' });
    }

    // Get payment details for the successful transaction
    const paymentQuery = `
      query OrderCardPaymentDetails($id: ID!) {
        order(id: $id) {
          transactions(first: 10) {
            id
            paymentDetails {
              __typename
              ... on CardPaymentDetails {
                bin
                number
              }
            }
          }
        }
      }
    `;

    const paymentResponse = await shopifyClient.request(paymentQuery, {
      variables: { id: `gid://shopify/Order/${orderId}` }
    });

    const txnDetails = paymentResponse.data.order.transactions.find(t =>
      t.id === successfulTxn.id
    );

    if (!txnDetails?.paymentDetails?.bin) {
      return res.status(404).json({ error: 'Payment details not found' });
    }

    // Get card BIN country and validate
    const binCountry = await getIssuingCountryFromBin(txnDetails.paymentDetails.bin);
    const creditCardLastFour = txnDetails.paymentDetails.number.replace(/[^0-9]/g, '').slice(-4);

    const validLastFour = creditCardLastFour === lastFourDigits;
    const validCountry = binCountry && bin_country.toLowerCase() === binCountry.toLowerCase();
    
    // Modified validation logic
    let isValid = false;
    let verificationRemark = '';

    if (validLastFour) {
      if (!binCountry) {
        // If BIN lookup failed but last 4 match, consider it valid
        isValid = true;
        verificationRemark = 'Verified (Last 4 only - BIN lookup failed)';
      } else if (validCountry) {
        // Both last 4 and country match
        isValid = true;
        verificationRemark = 'Verified (Full verification)';
      } else {
        // Last 4 match but country doesn't
        isValid = false;
        verificationRemark = 'Country mismatch';
      }
    } else {
      // Last 4 don't match
      isValid = false;
      verificationRemark = 'Invalid last four digits';
    }

    // Returns error messages based on which validation failed
    let errorMessage = !validLastFour ? 'Invalid last four digits' : 'Invalid country';

    const currentAttempts = (existingOrder?.guard?.attempts || 0) + 1;

    if (!isValid) {
      const remainingAttempts = MAX_VERIFICATION_ATTEMPTS - currentAttempts;
      // Handle max attempts
      if (currentAttempts >= MAX_VERIFICATION_ATTEMPTS) {
        await handleFailedVerification(db, shop, orderId, orderData, riskSettings.autoCancelUnverified, currentAttempts, session);
        return res.status(429).json({
          error: 'Maximum verification attempts exceeded',
          message: 'Order has been marked as unverified due to multiple failed attempts'
        });
      }
      await incrementVerificationAttempts(db, shop, orderId, currentAttempts);
      return res.status(422).json({
        error: errorMessage,
        message: `You have ${remainingAttempts} attempt${remainingAttempts !== 1 ? 's' : ''} left`
      });
    }

    // Mark as verified (updated to include remark)
    const result = await updateOrderVerificationStatus(db, shop, orderId, 'verified', session, verificationRemark);
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

async function updateOrderVerificationStatus(db, shop, orderId, status, session, remark) {

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
        'guard.remark': remark,
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

async function getIssuingCountryFromBin(bin) {
  const apis = [
    {
      url: `https://data.handyapi.com/bin/${bin}`,
      parser: (data) => data?.Country?.Name || null
    },
    {
      url: `https://lookup.binlist.net/${bin}`,
      parser: (data) => data?.country?.name || null
    },
    {
      url: `https://api.bincheck.io/bin/${bin}`,
      parser: (data) => data?.country || null
    },
    {
      url: `https://bins.payout.com/api/v1/bin/${bin}`,
      parser: (data) => data?.issuer?.country || null
    }
  ];

  for (const api of apis) {
    try {
      console.info(`Attempting BIN lookup with API: ${api.url}`);
      const response = await fetch(api.url, {
        headers: { 'Accept': 'application/json' }
      });
      
      if (!response.ok) {
        console.warn(`BIN API failed (${api.url}):`, response.status);
        continue;
      }

      const data = await response.json();
      const country = api.parser(data);
      
      if (country) {
        console.info(`Successfully got country from API: ${country}`);
        return country;
      }
    } catch (error) {
      console.warn(`BIN API error (${api.url}):`, error.message);
      continue;
    }
  }
  
  console.warn('All BIN APIs failed to return country');
  return null;
}