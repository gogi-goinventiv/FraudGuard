// pages/api/orders/capture.js

import sessionHandler from "./utils/sessionHandler";
import clientPromise from '../../lib/mongo';
import { updateOrdersOnHold } from "./utils/updateRiskStats";
import { shopify } from "../../lib/shopify";
import { removeStatusTags } from "./utils/removeStatusTags";

export default async function handler(req, res) {

  const client = await clientPromise;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { orderId, shop, orderAmount, notFlagged, isManuallyApproved, admin_graphql_api_id } = req.body;

  try {
    const session = await sessionHandler.loadSession(shop);

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

    console.log('txData:', txData);

    const authorizationTx = txData.transactions.find(
      (tx) => tx.kind === 'authorization' && tx.status === 'success'
    );

    if (!authorizationTx) {
      return res.status(400).json({ error: 'No successful authorization transaction found' });
    }

    // Step 2: Capture the authorized transaction
    const captureRes = await fetch(
      `https://${session.shop}/admin/api/2025-04/orders/${orderId}/transactions.json`,
      {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': session.accessToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          transaction: {
            kind: 'capture',
            parent_id: authorizationTx.id,
          },
        }),
      }
    );

    const captureData = await captureRes.json();
    if (!captureRes.ok) {
      const errorMessage = captureData?.errors?.base?.[0] || 'Capture failed';
      return res.status(captureRes.status).json({ error: errorMessage });
    }

    if (notFlagged) {
      return res.status(200).json({ success: true, transaction: captureData.transaction });
    }

    const storeName = shop.split('.')[0];
    const db = client.db(storeName);

    // Get risk status tag for the order
    const existingOrder = await db.collection('orders').findOne(
      { shop: shop, id: orderId },
      { projection: { 'guard.riskStatusTag': 1 } }
    );

    const riskStatusTag = existingOrder?.guard?.riskStatusTag || '';

    const result = await db.collection('orders').updateOne(
      { 'shop': shop, 'id': orderId }, // Filter by shop and orderId
      {
        $set: {
          'guard.status': 'captured payment',
          'guard.paymentStatus.captured': true,
          'guard.paymentStatus.cancelled': false,
          ...(isManuallyApproved && { 'guard.riskStatusTag': 'none' }),
        }
      } // Update specific fields within guard
    );

    if (result.modifiedCount === 0) {
      return res.status(404).json({ message: 'Failed to update order inside database.' });
    }

    const tagsToRemove = isManuallyApproved ? [riskStatusTag] : '';

    if (tagsToRemove.length > 0) {
      await removeStatusTags(new shopify.clients.Graphql({ session }), admin_graphql_api_id, tagsToRemove);
    }

    await updateOrdersOnHold(shop, true, { location: "/capture" });

    res.status(200).json({ success: true, transaction: captureData.transaction });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
}
