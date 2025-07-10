import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;
const options = {
  retryWrites: true,
  retryReads: true,
  serverSelectionTimeoutMS: 5000,
  maxPoolSize: 10,
  minPoolSize: 5,
  maxIdleTimeMS: 30000,
  connectTimeoutMS: 30000,
  socketTimeoutMS: 45000,
  serverApi: '1', // Enable stable API
};

let client;
let clientPromise;

if (!process.env.MONGODB_URI) {
  throw new Error('Please define the MONGODB_URI environment variable');
}

if (process.env.NODE_ENV === 'development') {
  if (!global._mongoClientPromise) {
    client = new MongoClient(uri, options);
    global._mongoClientPromise = client.connect();
  }
  clientPromise = global._mongoClientPromise;
} else {
  client = new MongoClient(uri, options);
  clientPromise = client.connect();
}

// Enhanced client retrieval with better error handling
export const getMongoClient = async () => {
  try {
    return await clientPromise;
  } catch (err) {
    console.error('Initial MongoDB connection failed:', err.message);
    
    // Handle various MongoDB connection errors
    if (
      err.name === 'MongoServerSelectionError' || 
      err.name === 'MongoStalePrimaryError' ||
      err.name === 'MongoNetworkTimeoutError' ||
      err.name === 'MongoTopologyClosedError'
    ) {
      console.warn('MongoDB topology error, creating fresh connection...');
      
      try {
        // Create a new client and connection
        const freshClient = new MongoClient(uri, options);
        const freshConnection = await freshClient.connect();
        
        // Update the global promise in development
        if (process.env.NODE_ENV === 'development') {
          global._mongoClientPromise = Promise.resolve(freshConnection);
        }
        
        return freshConnection;
      } catch (retryErr) {
        console.error('Failed to create fresh MongoDB connection:', retryErr.message);
        throw retryErr;
      }
    }
    
    // Re-throw other types of errors
    throw err;
  }
};

// Helper function to get database with automatic retry
export const getDatabase = async (databaseName) => {
  try {
    const client = await getMongoClient();
    return client.db(databaseName);
  } catch (error) {
    console.error('Error getting database:', error.message);
    throw error;
  }
};

// Connection health check
export const checkConnection = async () => {
  try {
    const client = await getMongoClient();
    await client.db('admin').command({ ping: 1 });
    return true;
  } catch (error) {
    console.error('MongoDB health check failed:', error.message);
    return false;
  }
};

// Graceful shutdown
export const closeConnection = async () => {
  try {
    const client = await getMongoClient();
    await client.close();
    console.info('MongoDB connection closed gracefully');
  } catch (error) {
    console.error('Error closing MongoDB connection:', error.message);
  }
};

// Handle process termination
if (typeof process !== 'undefined') {
  process.on('SIGINT', async () => {
    console.info('Received SIGINT, closing MongoDB connection...');
    await closeConnection();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.info('Received SIGTERM, closing MongoDB connection...');
    await closeConnection();
    process.exit(0);
  });
}

export default clientPromise;
