import sessionHandler from "../utils/sessionHandler";
import { shopify } from "../../../lib/shopify";


export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { shop } = req.query;

    try {
        const session = await sessionHandler.loadSession(shop);

        if (!session) {
            return res.status(401).json({ error: 'No valid session found for this shop' });
        }

        const client = new shopify.clients.Graphql({ session });

        const query = `query { shop { name } }`

        const response = await client.request(query);

        if (response?.data?.shop?.name) {
            return res.status(200).json({ name: response.data.shop.name });
        } else {
            console.error('Unexpected response structure:', response);
            return res.status(500).json({ error: 'Failed to fetch shop name' });
        }
    } catch (error) {
        console.error('Error fetching shop name:', error);
        return res.status(500).json({
            error: 'Failed to fetch shop name',
            details: error.message
        });
    }
}