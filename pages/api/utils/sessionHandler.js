// pages/api/utils/sessionHandler.js

import { Session } from "@shopify/shopify-api";
import clientPromise from "../../../lib/mongo";

const collectionName = "sessions";

async function getCollection(dbName) {
  const client = await clientPromise;
  //  Extra guard for rare disconnected client cases
  if (!client.topology?.isConnected()) {
    await client.connect();
  }
  return client.db(dbName).collection(collectionName);
}

const storeSession = async (session) => {
  const dbName = session.shop.split('.')[0];
  const collection = await getCollection(dbName);

  await collection.updateOne(
    { _id: session.id },
    {
      $set: {
        content: JSON.stringify(session),
        shop: session.shop,
      },
    },
    { upsert: true }
  );

  return true;
};

const loadSession = async (shop) => {
  const dbName = shop.split('.')[0];
  const collection = await getCollection(dbName);

  const sessionResult = await collection.findOne({ shop });

  if (!sessionResult || !sessionResult.content) {
    return undefined;
  }

  const sessionObj = JSON.parse(sessionResult.content);
  return new Session(sessionObj);
};

const deleteSession = async (id, shop) => {
  const dbName = shop.split('.')[0];
  const collection = await getCollection(dbName);
  await collection.deleteOne({ _id: id });
  return true;
};

const sessionHandler = { storeSession, loadSession, deleteSession };

export default sessionHandler;
