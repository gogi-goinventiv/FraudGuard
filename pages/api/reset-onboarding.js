import clientPromise from '../../lib/mongo';

export default async function handler(req, res) {
    const { shop } = req.query;
    const client = await clientPromise;
    const db = client.db(shop.split('.')[0]);
    const response = await db.collection('shop-onboarding').deleteMany({});
    const data = { result: response };
    return res.status(200).json(data);
}