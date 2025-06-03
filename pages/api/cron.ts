import { MongoClient } from 'mongodb';

const client = new MongoClient(process.env.MONGODB_URI!);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    await client.connect();
    const adminDb = client.db().admin();
    
    // Get all database names (i.e., shop names)
    const { databases } = await adminDb.listDatabases();
    
    // Filter out internal system DBs
    const shopDbs = databases
      .map(db => db.name)
      .filter(name => !['admin', 'local', 'config'].includes(name));

    // POST to /api/process-queue for each shop
    const results = await Promise.allSettled(
      shopDbs.map(shop =>
        fetch(`${process.env.HOST}/api/process-queue`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ shop }),
        })
      )
    );

    console.log(shopDbs);

    res.status(200).json({
      success: true,
      shopsProcessed: shopDbs.length,
      results,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    await client.close();
  }
}
