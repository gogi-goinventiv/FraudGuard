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
  const incValue = decrement ? -1 : 1;
  await db.collection("risk-stats").updateOne(
    { id: "risk-orders" },
    { $inc: { count: incValue } },
    { upsert: true }
  );
}
