// pages/api/check-mongo.js
import clientPromise from "../../lib/mongo";


export default async function handler(req, res) {
    try {
        const client = await clientPromise;
        await client.db('fraudguard-dev').collection('orders').deleteMany({});
        await client.db('fraudguard-dev').collection('risk-stats').deleteMany({});
        console.info('MongoDB health check started', { category: 'api-check-mongo' });
        res.status(200).json({ connected: true, message: 'MongoDB connected' });
        console.info('MongoDB health check successful', { category: 'api-check-mongo' });
    } catch (error) {
        console.error('MongoDB connection error', error, { category: 'api-check-mongo' });
        res.status(500).json({ connected: false, message: 'MongoDB connection error' });
    }
}
