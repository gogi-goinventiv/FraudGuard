// utils/middleware/verifyHmac.js
import crypto from "crypto";
import { buffer } from 'micro';

/**
 * HMAC verification middleware for Shopify webhooks
 * @param {import('next').NextApiRequest} req - The incoming request object.
 * @param {import('next').NextApiResponse} res - The response object.
 * @param {Function} next - Callback to pass control to the next middleware function.
 */
const verifyHmac = async (req, res, next) => {
  try {
    // Get the raw body as a buffer (required for HMAC verification)
    const rawBodyBuffer = await buffer(req);
    const rawBodyString = rawBodyBuffer.toString('utf8');
    
    // Store the parsed body and raw body for later use
    req.body = JSON.parse(rawBodyString);
    req.rawBody = rawBodyString;
    req.rawBodyBuffer = rawBodyBuffer;

    // Generate HMAC hash using raw body string
    const generateHash = crypto
      .createHmac("sha256", process.env.SHOPIFY_API_SECRET)
      .update(rawBodyString, "utf8")
      .digest("base64");

    const hmac = req.headers["x-shopify-hmac-sha256"];

    if (!hmac) {
      console.error("Missing HMAC header");
      return res.status(401).json({ 
        success: false, 
        message: "Missing HMAC header" 
      });
    }

    // Use constant-time comparison to prevent timing attacks
    if (crypto.timingSafeEqual(
      Buffer.from(generateHash, 'base64'),
      Buffer.from(hmac, 'base64')
    )) {
      await next();
    } else {
      console.error("HMAC verification failed");
      return res.status(401).json({ 
        success: false, 
        message: "HMAC verification failed" 
      });
    }
  } catch (e) {
    console.error("Error during HMAC verification:", e.message);
    return res.status(500).json({ 
      success: false, 
      message: "HMAC verification error" 
    });
  }
};

export default verifyHmac;
