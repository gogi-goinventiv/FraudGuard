// pages/api/email.js

import sendgrid from '@sendgrid/mail';
import clientPromise from '../../lib/mongo';
import jwt from 'jsonwebtoken';


// Set your SendGrid API key
sendgrid.setApiKey(process.env.SENDGRID_API_KEY);

export default async function handler(req, res) {

  const client = await clientPromise;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { order } = req.body;
    const { id: orderId, order_number: orderNumber, email: customerEmail, shop, customer, guard, receivedAt, line_items: lineItems, total_price: totalPrice } = order;

    console.info({ category: 'api-email', message: 'Request received for email verification', orderId, orderNumber, customerEmail });

    // Validate required fields
    if (!orderId || !orderNumber || !customerEmail) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (!canSendEmail(guard)) {
      const remainingMs = getEmailResendWaitTime(guard);
      const formattedTime = formatMs(remainingMs);
      if (guard.isVerificationRequired === false) {
        return res.status(400).json({ error: `Email already sent.` });
      }
      return res.status(400).json({ error: `Email already sent, please wait ${formattedTime} before trying again.` });
    }

    const token = jwt.sign({ orderId, customerEmail, shop }, process.env.JWT_SECRET, { expiresIn: '24h' });

    let url = '';

    if (guard.tier === 1) {
      url = `${process.env.HOST}/form/tier-1/${orderId}?token=${encodeURIComponent(token)}`;
    } else {
      url = `${process.env.HOST}/form/${orderId}?token=${encodeURIComponent(token)}`;
    }

    console.debug({ category: 'api-email', message: 'Generated URL for email verification', url, orderId, orderNumber, customerEmail });

    const shopNameResponse = await fetch(`${process.env.HOST}/api/shop/shop-name?shop=${shop}`);
    const shopNameData = await shopNameResponse.json();
    const shopName = shopNameData.name;

    const message = {
      to: customerEmail,
      from: {
        email: process.env.FROM_EMAIL,
        name: `Order Verification - ${shopName}`
      },
      subject: `Quick verification needed for your order #${orderNumber}`,
      text: `Hi ${customer?.first_name || customer?.last_name || 'there'}, before we can process your order #${orderNumber} with ${shopName}, we just need to confirm a few quick details. Our system detected some unusual activity with this order. This extra step helps protect you and our store. Please click the secure link to verify your information: ${url}. Once verified, your order will be approved automatically. Please complete verification within 24 hours. If not verified, your order may be canceled. Thanks for understanding, The ${shopName} Team. This message was sent via FraudGuard.`,
      html: `
    <!DOCTYPE html>
     <html lang="en">
    <head>
      <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Quick Verification Needed for Order #${orderNumber}</title>
      <style type="text/css">
        /* Minimal CSS for clients that support it, but primary styling is inline */
        body {
          margin: 0 !important;
          padding: 0 !important;
          width: 100% !important;
          -webkit-font-smoothing: antialiased;
          -webkit-text-size-adjust: 100%;
          -ms-text-size-adjust: 100%;
        }
        img {
          border: 0;
          outline: none;
          text-decoration: none;
          -ms-interpolation-mode: bicubic; /* Improves image rendering in Outlook */
        }
        a {
          text-decoration: none;
        }
        table {
          border-collapse: collapse;
          mso-table-lspace: 0pt; /* Outlook specific */
          mso-table-rspace: 0pt; /* Outlook specific */
        }
        td, p, h1, h2, h3 {
          font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif;
          mso-line-height-rule: exactly; /* Outlook specific */
        }
      </style>
    </head>
    <body style="margin: 0; padding: 0; width: 100%; background-color: #f0f4f8;">
      <center>
        <table width="100%" border="0" cellpadding="0" cellspacing="0" bgcolor="#f0f4f8">
          <tr>
            <td align="center" valign="top">
              <table width="100%" border="0" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto;">
                <tr>
                  <td bgcolor="#4a90e2" style="padding: 25px 20px; text-align: center;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 600; line-height: 30px;">
                      Quick Verification Needed
                    </h1>
                  </td>
                </tr>

                <tr>
                  <td bgcolor="#ffffff" style="padding: 30px 20px 20px 20px; border-left: 1px solid #dddddd; border-right: 1px solid #dddddd;">
                    <table width="100%" border="0" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="text-align: center;">
                          <h2 style="font-size: 22px; margin-top: 0; margin-bottom: 15px; font-weight: 600; color: #333333; line-height: 28px;">
                            Thank you for shopping with ${shopName}
                          </h2>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding-bottom: 10px;">
                          <p style="margin-top: 0; margin-bottom: 12px; font-size: 16px; color: #333333; line-height: 1.6;">
                            Hi ${customer?.first_name || customer?.last_name || 'there'},
                          </p>
                          <p style="margin-top: 0; margin-bottom: 15px; font-size: 16px; color: #333333; line-height: 1.6;">
                            Thanks for placing your order with <strong style="font-weight: 600;">${shopName}</strong>!
                            Before we can process your order <strong style="font-weight: 500;">#${orderNumber}</strong>, we need to confirm a few details.
                          </p>
                        </td>
                      </tr>

                      <tr>
                        <td style="padding-top: 10px; padding-bottom: 20px;">
                          <table width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color: #f9f9f9; padding: 20px border-radius: 8px;">
                            <tr>
                              <td colspan="2" style="padding-bottom: 15px;">
                                <h3 style="margin-top: 0; margin-bottom: 0; font-size: 18px; font-weight: 600; color: #333333; line-height: 24px; padding: 20px">Order Summary</h3>
                              </td>
                            </tr>
                            <tr>
                              <td style="padding: 6px 0; font-size: 14px; font-weight: 500; color: #555555; line-height: 1.5; padding: 0px 20px" width="40%">Order Number:</td>
                              <td style="padding: 6px 0; font-size: 14px; color: #333333; line-height: 1.5;" width="60%">${orderNumber}</td>
                            </tr>
                            <tr>
                              <td style="padding: 6px 0; font-size: 14px; font-weight: 500; color: #555555; line-height: 1.5; padding: 0px 20px" width="40%">Date:</td>
                              <td style="padding: 6px 0; font-size: 14px; color: #333333; line-height: 1.5;" width="60%">${new Date(receivedAt).toLocaleDateString("en-GB")}</td>
                            </tr>
                            <tr>
                              <td style="padding: 6px 0; font-size: 14px; font-weight: 500; color: #555555; line-height: 1.5; padding: 0px 20px" width="40%">Product:</td>
                              <td style="padding: 6px 0; font-size: 14px; color: #333333; line-height: 1.5;" width="60%">${lineItems?.[0]?.name || 'N/A'}</td>
                            </tr>
                            <tr>
                              <td colspan="2" style="padding-top: 15px;">
                                <table width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color: #eaf1fb; padding: 12px; border-radius: 6px;">
                                  <tr>
                                    <td style="font-size: 16px; font-weight: 600; color: #333333; line-height: 1.5; padding: 10px 20px">Total Amount:</td>
                                    <td style="font-size: 16px; font-weight: 600; color: #333333; text-align: right; line-height: 1.5; padding: 10px 20px">${totalPrice}</td>
                                  </tr>
                                </table>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>

                      <tr>
                        <td style="padding-top: 10px;">
                          <p style="margin-top: 0; margin-bottom: 10px; font-size: 16px; color: #333333; line-height: 1.6;">
                            Our system detected some unusual activity with this order. This extra step helps protect you and our store from fraudulent transactions.
                          </p>
                          <p style="margin-top: 0; margin-bottom: 15px; font-size: 16px; color: #333333; line-height: 1.6;">
                            It's quick and secure — and once completed, your order will be automatically approved.
                          </p>
                          <p style="margin-top: 0; margin-bottom: 10px; font-size: 16px; color: #333333; line-height: 1.6;">
                            Please click the secure link below to verify your information:
                          </p>
                        </td>
                      </tr>

                      <tr>
                        <td align="center" style="padding-top: 20px; padding-bottom: 25px;">
                          <table border="0" cellspacing="0" cellpadding="0">
                            <tr>
                              <td align="center" bgcolor="#4a90e2" style="border-radius: 5px;">
                                <a href="${url}" target="_blank" style="font-size: 16px; font-weight: 600; color: #ffffff; text-decoration: none; padding: 14px 28px; border: 1px solid #4a90e2; border-radius: 5px; display: inline-block;">
                                  Verify My Order
                                </a>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>

                      <tr>
                        <td>
                          <p style="margin-top: 0; margin-bottom: 15px; font-size: 15px; color: #333333; line-height: 1.6;">
                            <strong style="font-weight: 500;">Note:</strong> Please complete verification within 24 hours. If not verified, your order may be canceled.
                          </p>
                          <p style="margin-top: 0; margin-bottom: 10px; font-size: 15px; color: #333333; line-height: 1.6;">
                            If you have any questions, visit our website:
                            <br />
                            <a href="https://${shop}" target="_blank" style="color: #4a90e2; text-decoration: underline;">${shopName}</a>
                          </p>
                        </td>
                      </tr>

                      <tr>
                        <td style="padding-top: 20px;">
                          <p style="margin-top: 0; margin-bottom: 4px; font-size: 16px; color: #333333; line-height: 1.6;">Thank you,</p>
                          <p style="margin-top: 0; margin-bottom: 0; font-size: 16px; color: #333333; line-height: 1.6;">The ${shopName} Team</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <tr>
                  <td bgcolor="#ffffff" style="padding: 20px 20px 20px 20px; border-left: 1px solid #dddddd; border-right: 1px solid #dddddd; border-bottom: 1px solid #dddddd; border-radius: 0 0 8px 8px;">
                     <table width="100%" border="0" cellpadding="0" cellspacing="0" style="border-top: 1px solid #dddddd; padding-top: 15px;">
                      <tr>
                        <td width="24" valign="middle" style="padding-right: 8px;">
                          <img src="https://fraudgard-shopify-app.vercel.app/logo.png" alt="FraudGuard Logo" width="20" height="20" style="display: block; height: 20px; width: 20px;" />
                        </td>
                        <td valign="middle" style="font-size: 12px; color: #777777; line-height: 1.5;">
                          This message was sent via FraudGuard on behalf of ${shopName}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <tr>
                  <td style="text-align: center; padding: 30px 20px 20px 20px; font-size: 12px; color: #888888; line-height: 1.5;">
                    <p style="margin: 5px 0;">This is an automated message. Please do not reply.</p>
                    <p style="margin: 5px 0;">Need help? Contact our support team anytime.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </center>
    </body>
    </html>
  `
    };

    // Send the email
    const delivery = await sendgrid.send(message);
    console.debug({ category: 'api-email', message: 'Email sending attempt', orderId, orderNumber, customerEmail, delivery });
    if (!delivery) {
      console.error({ category: 'api-email', message: 'Failed to send verification email', orderId, orderNumber, customerEmail });
      return res.status(500).json({ error: 'Failed to send verification email' });
    }

    // await sendgrid.send(message);
    const storeName = shop.split('.')[0];
    const db = client.db(storeName);

    const result = await db.collection('orders').updateOne(
      { 'shop': shop, 'id': orderId }, // Filter by shop and orderId
      {
        $set: { "guard.email.lastSentAt": new Date().toISOString() },
        $inc: { "guard.email.count": 1 }
      }
    );

    if (result.modifiedCount === 0) {
      console.error({ category: 'api-email', message: 'Failed to update email field for order', orderId, orderNumber, customerEmail });
      return res.status(500).json({ error: 'Failed to update emailSent field for order' });
    }

    console.info({ category: 'api-email', message: 'Verification email sent', orderId, orderNumber, customerEmail });

    res.status(200).json({ success: true });
  } catch (error) {
    console.error({ category: 'api-email', message: 'SendGrid Error', error: error.response.body, orderId, orderNumber, customerEmail });
    res.status(500).json({ error: error.response.body.errors[0].message ? error.response.body.errors[0].message : error.response.body });
  }
}

function canSendEmail(guard) {
  if (!guard.isVerificationRequired) return false;
  if (!guard.email || !guard.email.lastSentAt) return true;

  const now = Date.now();
  const last = new Date(guard.email.lastSentAt).getTime();
  const delay = guard.email.minResendDelayMs || (EMAIL_RESEND_DELAY_IN_DAYS * 24 * 60 * 60 * 1000); // default EMAIL_RESEND_DELAY_IN_DAYS days

  return (now - last) >= delay;
}

function getEmailResendWaitTime(guard) {
  if (!guard.isVerificationRequired || !guard.email || !guard.email.lastSentAt) {
    return 0; // email can be sent immediately
  }

  const now = Date.now();
  const last = new Date(guard.email.lastSentAt).getTime();
  const delay = guard.email.minResendDelayMs || (EMAIL_RESEND_DELAY_IN_DAYS * 24 * 60 * 60 * 1000); // default EMAIL_RESEND_DELAY_IN_DAYS days
  const remainingMs = delay - (now - last);

  return Math.max(0, remainingMs); // if negative, return 0
}

function formatMs(ms) {
  const seconds = Math.floor(ms / 1000) % 60;
  const minutes = Math.floor(ms / (1000 * 60)) % 60;
  const hours = Math.floor(ms / (1000 * 60 * 60)) % 24;
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));

  return `${days}d ${hours}h ${minutes}m ${seconds}s`;
}
