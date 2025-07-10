import clientPromise from "../../../lib/mongo";


export default async function handler(req, res) {

    if (req.method === 'GET') {
        const { shop } = req.query;
        if (!shop) {
            return res.status(400).json({ message: 'Missing shop' });
        }

        const client = await clientPromise;
        const db = client.db(shop.split('.')[0]);
        const collection = db.collection('subscription-update');

        try {
            // find the latest subscription update document
            const result = await collection.find().sort({ createdAt: -1 }).limit(1).toArray();
            return res.status(200).json(result);
        } catch (error) {
            console.error('Error fetching subscription update:', error, { category: 'api-shop-subscription-update' });
            return res.status(500).json({ message: 'Failed to fetch subscription update' });
        }
    } else if (req.method === 'POST') {
        const { shop, id } = req.body;
        if (!shop || !id) {
            return res.status(400).json({ message: 'Missing shop or id' });
        }
        const client = await clientPromise;
        const db = client.db(shop.split('.')[0]);
        const collection = db.collection('subscription-update');
        try {
            await collection.updateOne({ id }, { $set: { applied: true } });
            console.info('Subscription update updated successfully', { category: 'api-shop-subscription-update' });
            return res.status(200).json({ success: true });
        } catch (error) {
            console.error('Error updating subscription update:', error, { category: 'api-shop-subscription-update' });
            return res.status(500).json({ message: 'Failed to update subscription' });
        }
    } else {
        return res.status(405).json({ message: 'Method not allowed' });
    }
}