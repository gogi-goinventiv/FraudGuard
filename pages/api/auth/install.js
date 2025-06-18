// pages/api/auth/install.js
export default async function handler(req, res) {
    const { shop, host } = req.query;

    if (req.method === 'GET') {
        try {
            res.redirect(302, `/api/auth?shop=${shop}&host=${host}`);
        } catch (error) {
            console.error('Auth begin error:', error);
            res.status(500).send('Internal Server Error');
        }
        return;
    }
    res.status(405).send('Method Not Allowed');
}
