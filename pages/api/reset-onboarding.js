import clientPromise from '../../lib/mongo';


export default async function handler(req, res) {
    const { shop } = req.query;
    const client = await clientPromise;
    const db = client.db(shop.split('.')[0]);
    console.info({ category: 'api-reset-onboarding', message: 'Request started for resetting onboarding data' });
    try {
        const response = await db.collection('shop-onboarding').deleteMany({});
        const data = { result: response };
        console.info({ category: 'api-reset-onboarding', message: 'Onboarding data reset successfully' });
        return res.status(200).json(data);
    } catch (error) {
        console.error({ category: 'api-reset-onboarding', message: 'Error resetting onboarding data', error });
        return res.status(500).json({ message: 'Failed to reset onboarding data' });
    }
}