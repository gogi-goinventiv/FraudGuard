import clientPromise from "../../../lib/mongo";

export async function incrementRiskPreventedAmount(shop, amount) {
  if (!amount) return;
  const client = await clientPromise;
  const db = client.db(shop.split(".")[0]);
  await db.collection("risk-stats").updateOne(
    { id: "risk-prevented" },
    { $inc: { amount } },
    { upsert: true }
  );
}

/**
 * Updates the orders on hold count in the risk-stats collection.
 * Prevents negative values and logs any invalid decrement attempts.
 * 
 * @param {string} shop - The shop domain (e.g., example.myshopify.com)
 * @param {boolean} decrement - Whether to decrement (default is false)
 * @param {object} meta - Optional metadata about what triggered the update
 */
export async function updateOrdersOnHold(shop, decrement = false, meta = {}) {
  const client = await clientPromise;
  const db = client.db(shop.split(".")[0]);
  const collection = db.collection("risk-stats");

  const statDoc = await collection.findOne({ id: "risk-orders" });
  const currentCount = statDoc?.count || 0;
  const incValue = decrement ? -1 : 1;

  if (decrement && currentCount <= 0) {
    // Log the invalid decrement attempt
    await db.collection("risk-logs").insertOne({
      id: "risk-orders-negative-attempt",
      shop,
      timestamp: new Date(),
      currentCount,
      attemptedDecrement: true,
      reason: "Attempted to decrement 'orders on hold' count below zero.",
      meta,
    });
    return;
  }

  await collection.updateOne(
    { id: "risk-orders" },
    { $inc: { count: incValue } },
    { upsert: true }
  );
}
