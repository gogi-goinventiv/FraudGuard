import clientPromise from "../../../lib/mongo";


export default async function handler(req, res) {

    if (req.method === 'GET') {
        try {
            const { shop } = req.query;

            const client = await clientPromise;
            const db = client.db(shop.split(".")[0]);

            const result = await db.collection('shop-onboarding').findOne({});

            if (!result) {
                const insertData = {
                    onboardingComplete: false,
                    manualCaptureEnabled: false
                };

                const insertResult = await db.collection('shop-onboarding').insertOne(insertData);
                const insertedDocument = await db
                    .collection('shop-onboarding')
                    .findOne({ _id: insertResult.insertedId });

                return res.status(200).json({ result: insertedDocument });
            }

            return res.status(200).json({ result });
        } catch (error) {
            return res.status(500).json({ error: "Internal server error", details: error.message });
        }
    }

    if (req.method === 'POST') {
        try {
            const { shop } = req.query;
            const { onboardingComplete, manualCaptureEnabled } = req.body;

            const client = await clientPromise;
            const db = client.db(shop.split(".")[0]);

            // Create an update object that only includes fields that are defined
            const updateFields = {};
            if (onboardingComplete !== undefined) {
                updateFields.onboardingComplete = onboardingComplete;
            }
            if (manualCaptureEnabled !== undefined) {
                updateFields.manualCaptureEnabled = manualCaptureEnabled;
            }

            // Only update if there are fields to update
            if (Object.keys(updateFields).length > 0) {
                const updateResult = await db.collection('shop-onboarding').updateOne(
                    {},
                    { $set: updateFields },
                    { upsert: true }
                );
                return res.status(200).json({ result: updateResult });
            }

            return res.status(200).json({ result: null });
        } catch (error) {
            return res.status(500).json({ error: "Internal server error", details: error.message });
        }
    }

    return res.status(405).json({ error: "Method not allowed" });

}