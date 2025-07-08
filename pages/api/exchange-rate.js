// pages/api/exchange-rate.js
import clientPromise from "../../lib/mongo";

export default async function handler(req, res) {
    const db = (await clientPromise).db("fraudguard");
    const collection = db.collection("currency_exchange_rates");
    const data = await collection.find({}).toArray();
    res.status(200).json(data);
}