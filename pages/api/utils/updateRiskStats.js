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

export async function updateOrdersOnHold(shop, decrement = false) {
  const client = await clientPromise;
  const db = client.db(shop.split(".")[0]);
  const collection = db.collection("risk-stats");

  const statDoc = await collection.findOne({ id: "risk-orders" });
  const currentCount = statDoc?.count || 0;
  const incValue = decrement ? -1 : 1;

  if (decrement && currentCount <= 0) {
    // Prevent decrementing below 0 and log the event
    await db.collection("risk-logs").insertOne({
      id: "risk-orders-negative-attempt",
      shop,
      timestamp: new Date(),
      currentCount,
      attemptedDecrement: true,
      message: "Attempted to decrement orders on hold below zero",
    });
    return;
  }

  await collection.updateOne(
    { id: "risk-orders" },
    { $inc: { count: incValue } },
    { upsert: true }
  );
}
