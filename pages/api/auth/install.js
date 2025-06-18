// pages/api/auth/install.js
import sessionHandler from '../utils/sessionHandler';

export default async function handler(req, res) {
    const { shop, host } = req.query;

    if (req.method === 'GET') {

        try {
            const session = await sessionHandler.loadSession(shop);

            if (session) {
                res.redirect(302, `/?shop=${shop}&host=${host}`);
                return;
            }
            res.redirect(302, `/api/auth?shop=${shop}&host=${host}`);
        } catch (error) {
            console.error('Auth begin error:', error);
            res.status(500).send('Internal Server Error');
        }
        return;
    }
    res.status(405).send('Method Not Allowed');
}
