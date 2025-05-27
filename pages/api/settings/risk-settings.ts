import type { NextApiRequest, NextApiResponse } from "next";
import clientPromise from "../../../lib/mongo";

const ALLOWED_RISK_LEVELS = ["high", "high+medium", "medium"];
const COLLECTION_NAME = "risk-settings";
const ALLOWED_AUTO_ACTIONS = [
  "autoCancelHighRisk",
  "autoCancelUnverified",
  "autoApproveVerified",
];

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const client = await clientPromise;

  if (!client.topology?.isConnected()) {
    await client.connect();
  }

  try {
    const shop: string =
      req.body.shop ||
      req.query.shop ||
      (req.headers["x-shopify-shop-domain"] as string);

    if (!shop) {
      return res.status(400).json({ error: "Shop parameter is required" });
    }

    const DB_NAME = shop.split(".")[0];
    const database = client.db(DB_NAME);
    const collection = database.collection(COLLECTION_NAME);

    const defaultConfig = {
      id: "risk-config",
      flagHighRisk: true,
      flagMediumRisk: true,
      flagLowRisk: false,
      emailHighRisk: true,
      emailMediumRisk: true,
      emailLowRisk: false,
      autoCancelHighRisk: false,
      autoCancelUnverified: false,
      autoApproveVerified: false,
    };

    if (req.method === "GET") {
      const config = await collection.findOne({ id: "risk-config" });
      if (!config) {
        // Insert the default config into the database
        await collection.insertOne(defaultConfig);

        return res.status(200).json(defaultConfig);
      }

      const { _id, ...configWithoutId } = config;
      return res.status(200).json(configWithoutId);
    } else if (req.method === "POST") {
      const { riskLevel, settingType = "flag", actionType } = req.body;
      let updateFields = {};

      if (settingType === "flag") {
        if (!ALLOWED_RISK_LEVELS.includes(riskLevel)) {
          return res
            .status(400)
            .json({ error: "Invalid risk level provided." });
        }

        updateFields = {
          flagHighRisk: riskLevel === "high" || riskLevel === "high+medium",
          flagMediumRisk: riskLevel === "medium" || riskLevel === "high+medium",
          flagLowRisk: false,
        };
      } else if (settingType === "email") {
        if (!ALLOWED_RISK_LEVELS.includes(riskLevel)) {
          return res
            .status(400)
            .json({ error: "Invalid risk level provided." });
        }

        updateFields = {
          emailHighRisk: riskLevel === "high" || riskLevel === "high+medium",
          emailMediumRisk:
            riskLevel === "medium" || riskLevel === "high+medium",
          emailLowRisk: false,
        };
      } else if (settingType === "autoAction") {
        if (!ALLOWED_AUTO_ACTIONS.includes(actionType)) {
          return res
            .status(400)
            .json({ error: "Invalid auto action type provided." });
        }

        if (typeof riskLevel !== "boolean") {
          return res
            .status(400)
            .json({ error: "Value must be a boolean for auto actions." });
        }

        // Create an object with the specific action field set to the provided value
        updateFields = {
          [actionType]: riskLevel,
        };
      } else {
        return res
          .status(400)
          .json({ error: "Invalid setting type provided." });
      }

      const result = await collection.updateOne(
        { id: "risk-config" },
        {
          $set: {
            ...updateFields,
            updatedAt: new Date(),
          },
        },
        { upsert: true }
      );

      return res.status(200).json({
        success: true,
        config: updateFields,
        mongoResult: {
          acknowledged: result.acknowledged,
          modifiedCount: result.modifiedCount,
          upsertedCount: result.upsertedCount,
        },
      });
    } else {
      return res.status(405).json({ error: "Method not allowed" });
    }
  } catch (error) {
    console.error("Error with risk level config in MongoDB:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
