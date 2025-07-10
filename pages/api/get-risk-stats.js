// pages/api/get-risk-stats.js
import clientPromise from "../../lib/mongo";


export default async function handler(req, res) {
  const { shop: shopParam, id: idParam } = req.method === "POST" ? req.body : req.query;
  const shop = shopParam || req.headers['x-shopify-shop-domain'];
  const id = idParam;

  if (!shop || !id) {
    return res.status(400).json({ error: "Missing 'shop' or 'id'" });
  }

  try {
    const client = await clientPromise;
    const db = client.db(shop.split('.')[0]);
    const result = await db.collection('risk-stats').findOne({ id });

    return res.status(200).json({ result });
  } catch (err) {
    return res.status(500).json({ error: "Internal server error", details: err.message });
  }
}
