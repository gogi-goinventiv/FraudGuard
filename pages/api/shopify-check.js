// import clientPromise from '../../lib/mongo';
// import { sessionStorage } from '../../lib/shopify';


// export default async function handler(req, res) {
//   const { shop } = req.query;

//   if (!shop) {
//     return res.status(400).json({ error: 'Missing shop parameter' });
//   }

//   const client = await clientPromise;
//   const db = client.db(shop.split('.')[0]);
//   console.info({ category: 'api-reset-orders', db: db.databaseName, shop });
//   const collection = db.collection('orders');
//   const orderToUpdate = ['29615', '29607', '29581', '29563', '29537', '29145', '29148', '29149', '29192', '29196', '29275', '29331', '29332', '29365', '29372', '29388', '29394', '29427', '29487', '29503', '29515', '29513', '29504'];

//   const result = await collection.updateMany(
//   { order_number: { $in: orderToUpdate.map(Number) } }, // ensure numbers, not strings
//   {
//     $set: {
//       'guard.status': 'captured payment',
//       'guard.paymentStatus.captured': true,
//       'guard.paymentStatus.cancelled': false,
//     }
//   }
// );


//   if (result.modifiedCount === 0) {
//     return res.status(404).json({ message: 'No orders found to update.' });
//   }

//   return res.status(200).json({ success: true, message: `${result.modifiedCount} orders updated successfully.` });

//   // // Try to find a session for this shop
//   // const sessions = await sessionStorage.findSessionsByShop(shop);

//   // if (sessions && sessions.length > 0) {
//   //   return res.status(200).json({ connected: true, shop });
//   // } else {
//   //   return res.status(200).json({ connected: false });
//   // }
// }