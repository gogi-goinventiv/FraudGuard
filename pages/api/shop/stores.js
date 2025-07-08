import clientPromise from "../../../lib/mongo";
const logger = require('../../../utils/logger');

export default async function handler(req, res) {

    if (req.method !== 'GET') {
        return res.status(405).json({ message: 'Method not allowed' });
    }

    logger.info({ category: 'api-shop-stores', message: 'Request started' });

    const client = await clientPromise;
    const adminDb = client.db().admin();
    const { databases } = await adminDb.listDatabases();
    const shopDbs = databases
      .map(db => db.name)
      .filter(name => !['admin', 'local', 'config'].includes(name));
    
    logger.info({ category: 'api-shop-stores', message: 'Request successful' });
    return res.status(200).json(shopDbs);
}