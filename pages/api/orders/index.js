// pages/api/orders.js
// import { shopify } from '../../lib/shopify';
// import sessionHandler from './utils/sessionHandler';

// export default async function handler(req, res) {
//   const { shop } = req.query;

//   try {
//     if (!shop) {
//       return res.status(400).json({ error: 'Missing shop param' });
//     }

//     // Load the session from MongoDB via your custom sessionHandler
//     const session = await sessionHandler.loadSession(shop);

//     if (!session) {
//       return res.status(401).json({ 
//         error: 'No valid session for this shop',
//         shop
//       });
//     }

//     // Create a Shopify REST client using the loaded session
//     const client = new shopify.clients.Rest({ session });

//     // Fetch orders from the Shopify store
//     const response = await client.get({
//       path: 'orders',
//       query: {
//         status: 'any',
//         limit: 10,
//       },
//     });

//     // Return the orders
//     res.status(200).json(response.body.orders);
//   } catch (error) {
//     console.error('Error fetching orders:', error);
//     res.status(500).json({ 
//       error: error.message || 'Failed to fetch orders',
//     });
//   }
// }

import clientPromise from '../../../lib/mongo';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { shop, page = 1, limit = 10, type } = req.query;

  if (!shop) {
    return res.status(400).json({ message: 'Missing shop identifier in query' });
  }

  try {
    const client = await clientPromise;
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    let queryType = [];
    // Define a base query that includes all your conditions
    const baseQuery = { shop };

    if (parseInt(type) === 1) {
      queryType = ['verified', 'unverified', 'pending']
    } else if (parseInt(type) === 2) {
      queryType = ['captured payment']
    } else if (parseInt(type) === 3) {
      queryType = ['cancelled payment']
    } else {
      queryType = []
    }

    // Only add the guard.status condition if queryType has elements
    if (queryType.length > 0) {
      baseQuery['guard.status'] = { $in: queryType };
    }

    const storeName = shop.split('.')[0];
    const db = client.db(storeName);
    const collection = db.collection('orders');

    const [orders, totalCount] = await Promise.all([
      collection
        .find(baseQuery)
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limitNum)
        .toArray(),
      collection.countDocuments(baseQuery) // Use the same baseQuery for counting
    ]);

    const totalPages = Math.ceil(totalCount / limitNum);

    res.status(200).json({
      orders,
      pagination: {
        total: totalCount,
        page: pageNum,
        limit: limitNum,
        pages: totalPages,
        hasNextPage: pageNum < totalPages && totalCount > 0, // Add check for totalCount
        hasPrevPage: pageNum > 1
      }
    });
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ message: 'Failed to fetch orders', orders: [] });
  }
}

