import sessionHandler from "./utils/sessionHandler";


export default async function handler(req, res) {
    try {
        const { shop } = req.query;
        console.info({ category: 'api-reset-session', message: 'Request received for resetting session' });
        console.log('Shop:', shop);
        
        // Ensure shop is converted to string and validate it exists
        if (!shop) {
            console.error({ category: 'api-reset-session', message: 'Shop parameter is required' });
            return res.status(400).json({ error: 'Shop parameter is required' });
        }
        
        const shopString = String(shop);
        
        await sessionHandler.deleteSession(`offline_${shopString}`, shopString);
        console.info({ category: 'api-reset-session', message: 'Session cleared successfully' });

        res.status(200).json({ message: 'Session cleared' });
        
    } catch (error) {
        console.error({ category: 'api-reset-session', message: 'Error clearing session', error: error.message });
        
        // Return appropriate status code based on error type
        if (error.message.includes('not found')) {
            return res.status(404).json({ error: error.message });
        }
        
        if (error.message.includes('required') || error.message.includes('Invalid')) {
            return res.status(400).json({ error: error.message });
        }
        
        // Generic server error for unexpected issues
        res.status(500).json({ error: 'Failed to clear session' });
    }
}
