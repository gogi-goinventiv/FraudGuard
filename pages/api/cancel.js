// pages/api/orders/cancel.js

import sessionHandler from "./utils/sessionHandler";
import clientPromise from '../../lib/mongo';
import { incrementRiskPreventedAmount, updateOrdersOnHold } from "./utils/updateRiskStats";
import { shopify } from "../../lib/shopify";
import { removeStatusTags } from "./utils/removeStatusTags";


export default async function handler(req, res) {

  const client = await clientPromise;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { orderId, shop, orderAmount, isManuallyCancelled, admin_graphql_api_id } = req.body;

  try {
    const session = await sessionHandler.loadSession(shop);

    console.info({ category: 'api-cancel', message: 'Request received for order cancellation', orderId, shop });

    // Step 1: Get transactions for the order
    const txRes = await fetch(
      `https://${session.shop}/admin/api/2025-04/orders/${orderId}/transactions.json`,
      {
        headers: {
          'X-Shopify-Access-Token': session.accessToken,
          'Content-Type': 'application/json',
        },
      }
    );
    const txData = await txRes.json();

    console.debug({ category: 'api-cancel', message: 'Raw transaction data', txData });

    // Find the authorization transaction that needs to be voided
    const authorizationTx = txData.transactions.find(
      (tx) => tx.kind === 'authorization' && tx.status === 'success'
    );

    if (!authorizationTx) {
      console.error({ category: 'api-cancel', message: 'No successful authorization transaction found', orderId, shop });
      return res.status(400).json({ error: 'No successful authorization transaction found' });
    }

    // Check if payment has already been captured
    const capturedTx = txData.transactions.find(
      (tx) => tx.kind === 'capture' && tx.status === 'success'
    );

    if (capturedTx) {
      console.error({ category: 'api-cancel', message: 'Payment has already been captured. Use refund instead of cancel.', orderId, shop, captureId: capturedTx.id });
      return res.status(400).json({
        error: 'Payment has already been captured. Use refund instead of cancel.',
        captureId: capturedTx.id
      });
    }

    // Step 2: Void the authorized transaction
    const voidRes = await fetch(
      `https://${session.shop}/admin/api/2025-04/orders/${orderId}/transactions.json`,
      {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': session.accessToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          transaction: {
            kind: 'void',
            parent_id: authorizationTx.id,
          },
        }),
      }
    );

    const voidData = await voidRes.json();

    if (!voidRes.ok) {
      console.error({ category: 'api-cancel', message: 'Void failed', orderId, shop, status: voidRes.status, errors: voidData.errors });
      return res.status(voidRes.status).json({ error: voidData.errors || 'Void failed' });
    }

    // Additionally, cancel the order in Shopify if required
    const cancelOrderRes = await fetch(
      `https://${session.shop}/admin/api/2025-04/orders/${orderId}/cancel.json`,
      {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': session.accessToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reason: 'Payment cancelled by merchant'
        }),
      }
    );

    const cancelOrderData = await cancelOrderRes.json();

    if (!cancelOrderRes.ok) {
      console.error({ category: 'api-cancel', message: 'Order cancellation failed', orderId, shop, status: cancelOrderRes.status, errors: cancelOrderData.errors });
      const errorMessage = cancelOrderData.errors || 'Order cancellation failed';
      return res.status(voidRes.status).json({ error: errorMessage });
    }

    const storeName = shop.split('.')[0];
    const db = client.db(storeName);

    // Check if order exists in our database
    const existingOrder = await db.collection('orders').findOne(
      { shop: shop, id: orderId },
      { projection: { 'guard.status': 1, 'guard.riskStatusTag': 1 } }
    );

    const previousStatus = existingOrder?.guard?.status || 'unknown';
    const riskStatusTag = existingOrder?.guard?.riskStatusTag || '';

    // Update the order's guard verification field to indicate cancellation
    const result = await db.collection('orders').updateOne(
      { 'shop': shop, 'id': orderId }, // Filter by shop and orderId
      {
        $set: {
          'guard.status': 'cancelled payment',
          'guard.paymentStatus.captured': false,
          'guard.paymentStatus.cancelled': true,
          'guard.remark': `${previousStatus}`,
          'guard.cancelledAt': new Date(),
          'cancelData': cancelOrderData,
          ...(isManuallyCancelled && { 'guard.riskStatusTag': 'none' }),
        }
      } // Update specific fields within guard
    );

    if (result.modifiedCount === 0) {
      console.error({ category: 'api-cancel', message: 'Failed to update order inside database', orderId, shop });
      return res.status(404).json({ message: 'Failed to update order inside database.' });
    }

    const tagsToRemove = isManuallyCancelled ? [riskStatusTag] : '';
  
    if (tagsToRemove.length > 0) {
      await removeStatusTags(new shopify.clients.Graphql({ session }), admin_graphql_api_id, tagsToRemove);
    }  

    await incrementRiskPreventedAmount(shop, parseFloat(orderAmount));
    await updateOrdersOnHold(shop, true, {location: "/cancel"});

    console.info({ category: 'api-cancel', message: 'Order cancellation successful', orderId, shop });
    res.status(200).json({
      success: true,
      transaction: voidData.transaction,
      orderCancelled: cancelOrderRes.ok
    });
  } catch (err) {
    console.error({ category: 'api-cancel', message: 'Cancel payment error', orderId, shop, error: err.message });
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
}

