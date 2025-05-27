// pages/api/orders/cancel-email.js
import sendgrid from '@sendgrid/mail';

sendgrid.setApiKey(process.env.SENDGRID_API_KEY);

export default async function handler(req, res) {

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { order, shop } = req.body;
        const { id: orderId, order_number: orderNumber, email: customerEmail, customer } = order;

        // Validate required fields
        if (!orderId || !orderNumber || !customerEmail) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const message = {
            to: customerEmail,
            from: process.env.MAIL_FROM,
            subject: `Your order #${orderNumber} from ${shop} has been cancelled.`,
            text: `Your order with order number ${orderNumber} has been cancelled.`,
            html: `<!DOCTYPE html>
                    <html>
                    <head>
                        <meta charset="utf-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <title>Order Cancellation Notice</title>
                        <style>
                        body {
                            font-family: Arial, sans-serif;
                            line-height: 1.6;
                            color: #333333;
                            margin: 0;
                            padding: 0;
                        }
                        .container {
                            max-width: 600px;
                            margin: 0 auto;
                            padding: 20px;
                        }
                        .header {
                            background-color: #e25353;
                            padding: 20px;
                            text-align: center;
                        }
                        .header h1 {
                            color: white;
                            margin: 0;
                            font-size: 24px;
                        }
                        .content {
                            background-color: #ffffff;
                            padding: 30px 20px;
                            border: 1px solid #e9e9e9;
                        }
                        .button {
                            display: inline-block;
                            background-color: #4a90e2;
                            color: white;
                            text-decoration: none;
                            padding: 12px 30px;
                            border-radius: 4px;
                            font-weight: bold;
                            margin: 20px 0;
                        }
                        .footer {
                            text-align: center;
                            padding: 20px;
                            font-size: 12px;
                            color: #999999;
                        }
                        </style>
                    </head>
                    <body>
                        <div class="container">
                        <div class="header">
                            <h1>Order Cancellation Notice</h1>
                        </div>
                        <div class="content">
                            <p>Hi ${customer?.first_name || customer?.last_name || 'there'},</p>
                            <p>We regret to inform you that your order #${orderNumber} has been cancelled because we were unable to verify the details you provided.</p>
                            <p>This could be due to:</p>
                            <ul>
                            <li>Incomplete verification information</li>
                            <li>Mismatched billing or shipping details</li>
                            <li>Unable to validate payment information</li>
                            </ul>
                            <p>You're welcome to place a new order on our website:</p>
                            <div style="text-align: center;">
                            <a href="${shop}" class="button">Visit Our Shop</a>
                            </div>
                            <p>If you have any questions or need assistance, please don't hesitate to contact our customer support team for clarification.</p>
                            <p>We apologize for any inconvenience this may have caused.</p>
                            <p>Thank you for your understanding,</p>
                            <p>Customer Service Team</p>
                        </div>
                        <div class="footer">
                            <p>This is an automated message. Please do not reply to this email.</p>
                            <p>For assistance, please contact our customer support.</p>
                        </div>
                        </div>
                    </body>
                    </html>`
        };

        const delivery = await sendgrid.send(message);

        if (!delivery) {
            throw new Error('Failed to send cancellation of order notification email');
        }
        console.log('Cancellation of order notification email sent successfully.');
        return res.status(200).json({ success: true, message: 'Cancellation of order notification email sent successfully.' });
    } catch (error) {
        console.error('Error sending cancellation of order notification email:', error);
        return res.status(500).json({ error: 'Internal server error', details: error.message });
    }

} 