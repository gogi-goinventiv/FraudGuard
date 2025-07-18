// pages/api/process-queue.js
import clientPromise from '../../lib/mongo';
import { processQueuedWebhook } from './webhooks/order-create';
import { processQueuedCancelWebhook } from './webhooks/order-cancel';
import { processQueuedSubscriptionWebhook } from './webhooks/app-subscription-update';
import { processQueuedPaidWebhook } from './webhooks/order-paid';  // Add this import


export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { shop } = req.body;

  if (!shop) {
    return res.status(400).json({ error: 'Shop parameter required' });
  }

  try {
    const mongoClient = await clientPromise;
    const storeName = shop.split('.')[0];
    const db = mongoClient.db(storeName);
    
    // Find items to process from queue (both order creation and cancellation)
    const queueItems = await db.collection('webhook-queue').find({
      $or: [
        { status: 'pending', attempts: { $lt: 3 } },
        { 
          status: 'pending', 
          attempts: { $lt: 3 },
          nextAttemptAfter: { $lte: new Date() }
        }
      ]
    }).sort({ createdAt: 1 }).limit(10).toArray();

    if (queueItems.length === 0) {
      return res.status(200).json({ 
        success: true, 
        message: 'No items to process',
        processed: 0
      });
    }

    const results = [];
    
    for (const item of queueItems) {
      try {
        let result;
        
        // Process different webhook types
        if (item.type === 'order_cancel') {
          result = await processQueuedCancelWebhook(db, item);
          results.push({ 
            orderId: item.orderCancelData?.id || 'unknown', 
            type: 'order_cancel',
            success: result,
            _id: item._id 
          });
        } else if (item.type === 'subscription-update') {
          result = await processQueuedSubscriptionWebhook(db, item);
          results.push({ 
            shop: item.shop || 'unknown', 
            type: 'subscription-update',
            success: result,
            _id: item._id 
          });
        } else if (item.type === 'order_paid') {  // Add this condition
          result = await processQueuedPaidWebhook(db, item);
          results.push({ 
            orderId: item.orderPaidData?.id || 'unknown', 
            type: 'order_paid',
            success: result,
            _id: item._id 
          });
        } else {
          // Default to order creation processing (backward compatibility)
          result = await processQueuedWebhook(db, item);
          results.push({ 
            orderId: item.orderData?.id || 'unknown', 
            type: 'order_create',
            success: result,
            _id: item._id 
          });
        }
      } catch (error) {
        console.error(`Failed to process queue item ${item._id}:`, error.message, { category: 'api-process-queue' });
        results.push({ 
          orderId: item.orderData?.id || item.orderCancelData?.id || 'unknown', 
          type: item.type || 'order_create',
          success: false, 
          error: error.message,
          _id: item._id 
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    
    // Check if there are more items to process
    const hasMoreItems = await db.collection('webhook-queue').countDocuments({
      status: 'pending',
      attempts: { $lt: 3 }
    });

    // If there are more items, trigger another batch after a short delay
    if (hasMoreItems > 0) {
      setTimeout(() => {
        fetch(`${process.env.HOST}/api/process-queue`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ shop }),
        }).catch(err => console.warn('Failed to trigger next batch:', err.message, { category: 'api-process-queue' }));
      }, 1000);
    }

    console.info(`Queue processing completed. Total items: ${queueItems.length}, Successful: ${successCount}, Failed: ${queueItems.length - successCount}, Has more: ${hasMoreItems > 0}`, { category: 'api-process-queue' });

    return res.status(200).json({
      success: true,
      processed: queueItems.length,
      successful: successCount,
      failed: queueItems.length - successCount,
      hasMore: hasMoreItems > 0,
      results
    });

  } catch (error) {
    console.error('Queue processing error:', error, { category: 'api-process-queue' });
    return res.status(500).json({ 
      error: 'Queue processing failed', 
      message: error.message 
    });
  }
}