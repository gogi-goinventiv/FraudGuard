// pages/api/orders/capture.js

import sessionHandler from "./utils/sessionHandler";
import clientPromise from '../../lib/mongo';
import { updateOrdersOnHold } from "./utils/updateRiskStats";
import { shopify } from "../../lib/shopify";
import { removeStatusTags } from "./utils/removeStatusTags";

// GraphQL utility to get order transactions (copied from webhooks/order-create.js)
async function getOrderTxnDetails(shopifyClient, orderIdGid) {
  const query = `
    query GetOrderTransactions($orderId: ID!) {
      order(id: $orderId) {
        transactions { id status kind }
      }
    }
  `;
  try {
    const response = await shopifyClient.request(query, { variables: { orderId: orderIdGid } });
    if (response?.data?.order?.transactions) {
      return response.data.order.transactions;
    }
    return [];
  } catch (error) {
    return [];
  }
}

export default async function handler(req, res) {
  const client = await clientPromise;
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { orderId, shop, orderAmount, notFlagged, isManuallyApproved, admin_graphql_api_id } = req.body;

  try {
    const session = await sessionHandler.loadSession(shop);
    const shopifyClient = new shopify.clients.Graphql({ session });

    // Step 1: Get transactions for the order (GraphQL)
    const transactions = await getOrderTxnDetails(shopifyClient, admin_graphql_api_id);
    const authorizationTx = transactions.find(
      (tx) => tx.kind === 'AUTHORIZATION' && tx.status === 'SUCCESS'
    );
    if (!authorizationTx) {
      return res.status(400).json({ error: 'No successful authorization transaction found' });
    }

    // Step 2: Capture the authorized transaction (GraphQL)
    const mutation = `
      mutation orderCapture($input: OrderCaptureInput!) {
        orderCapture(input: $input) {
          transaction {
            id
            kind
            status
            amountSet {
              presentmentMoney {
                amount
                currencyCode
              }
            }
            order {
              id
              totalCapturable
              capturable
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;
    const variables = {
      input: {
        id: admin_graphql_api_id,
        parentTransactionId: authorizationTx.id,
        // amount: orderAmount, // Optional: for partial capture
      }
    };
    const captureRes = await shopifyClient.request(mutation, { variables });
    const captureData = captureRes?.data?.orderCapture;

    if (captureData?.userErrors?.length) {
      return res.status(400).json({ error: captureData.userErrors.map(e => e.message).join(', ') });
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
      { 'shop': shop, 'id': orderId },
      {
        $set: {
          'guard.status': 'captured payment',
          'guard.paymentStatus.captured': true,
          'guard.paymentStatus.cancelled': false,
          ...(isManuallyApproved && { 'guard.riskStatusTag': 'none' }),
        }
      }
    );

    if (result.modifiedCount === 0) {
      return res.status(404).json({ message: 'Failed to update order inside database.' });
    }

    const tagsToRemove = isManuallyApproved ? [riskStatusTag] : '';
    if (tagsToRemove.length > 0) {
      await removeStatusTags(shopifyClient, admin_graphql_api_id, tagsToRemove);
    }

    await updateOrdersOnHold(shop, true, { location: "/capture" });

    res.status(200).json({ success: true, transaction: captureData.transaction });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
}
