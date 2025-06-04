// utils/middleware/withMiddleware.js
import verifyHmac from './verifyHmac.js';

const middlewares = {
  verifyHmac,
};

/**
 * Higher-order function to apply middleware to API routes
 * @param {string} middlewareName - Name of the middleware to apply
 * @returns {Function} - Function that wraps the handler with middleware
 */
const withMiddleware = (middlewareName) => {
  return (handler) => {
    return async (req, res) => {
      const middleware = middlewares[middlewareName];
      
      if (!middleware) {
        console.error(`Middleware '${middlewareName}' not found`);
        return res.status(500).json({ 
          success: false, 
          message: "Internal server error" 
        });
      }

      // Apply middleware
      await middleware(req, res, async () => {
        // Call the actual handler
        await handler(req, res);
      });
    };
  };
};

export default withMiddleware;
