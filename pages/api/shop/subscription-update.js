import clientPromise from "../../../lib/mongo";
import sessionHandler from "../utils/sessionHandler";

export default async function handler(req, res) {

    if (req.method === "GET") {
        const { shop } = req.query;
        if (!shop) return res.status(400).json({ error: "Missing shop" });
        const client = await clientPromise;
        const db = client.db(shop.split('.')[0]);
        const doc = await db.collection("subscription-update").findOne({ shop });
        if (!doc) return res.status(404).json({ error: "Not found" });
        return res.status(200).json({ applied: doc.applied, new_subscription_url: doc.new_subscription_url });
    }

    if (req.method === "PATCH") {
        const { shop } = req.body;
        if (!shop) return res.status(400).json({ error: "Missing shop" });
        const client = await clientPromise;
        const db = client.db(shop.split('.')[0]);
        const result = await db.collection("subscription-update").updateOne({ shop }, { $set: { applied: true, updated_at: new Date() } });
        return res.status(200).json({ result });
    }

    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    const { shop, new_subscription_url } = req.body;

    const session = await sessionHandler.loadSession(shop);

    if (!session) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    const client = await clientPromise;
    const db = client.db(shop.split('.')[0]);
    
    const result = await db.collection("subscription-update").updateOne({ shop }, { $set: { new_subscription_url, updated_at: new Date(), applied: false } }, { upsert: true });

    return res.status(200).json({ result });

}