// pages/api/exchange-rate.js
import clientPromise from "../../lib/mongo";


export default async function handler(req, res) {
    console.info({ category: 'api-exchange-rate', message: 'Request started' });
    const db = (await clientPromise).db("fraudguard");
    const collection = db.collection("currency_exchange_rates");
    try {
        const data = await collection.find({}).toArray();
        console.info({ category: 'api-exchange-rate', message: 'Request successful' });
        res.status(200).json(data);
    } catch (error) {
        console.error({ category: 'api-exchange-rate', message: 'Request failed', error: error.message });
        res.status(500).json({ message: 'Internal Server Error' });
    }
}