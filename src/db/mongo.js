import mongoose from 'mongoose';
import { config } from '../config.js';

let isConnected = false;

/**
 * Initializes connection to MongoDB Atlas.
 * Handles timeouts and connection errors gracefully so the application
 * continues functioning smoothly even if network IP whitelist is pending.
 */
export async function initMongo() {
  if (isConnected || mongoose.connection.readyState === 1) {
    return true;
  }

  const uri = config.mongoUri;
  if (!uri) {
    console.warn('[MongoDB] No MONGODB_URI configured. Running with in-memory deduplication.');
    return false;
  }

  try {
    console.log('[MongoDB] Connecting to MongoDB Atlas cluster...');
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 10000,
      family: 4 // Prefer IPv4
    });

    isConnected = true;
    console.log('[MongoDB] ✓ Successfully connected to MongoDB Atlas (x_bot database).');

    mongoose.connection.on('disconnected', () => {
      isConnected = false;
      console.warn('[MongoDB] Disconnected from MongoDB Atlas.');
    });

    mongoose.connection.on('reconnected', () => {
      isConnected = true;
      console.log('[MongoDB] ✓ Reconnected to MongoDB Atlas.');
    });

    return true;
  } catch (err) {
    isConnected = false;
    console.warn(`[MongoDB Notice] Could not connect to MongoDB Atlas (${err.message}).`);
    console.warn('[MongoDB Notice] If this is an IP restriction, add 0.0.0.0/0 to your Atlas Network Access list.');
    console.warn('[MongoDB Notice] Application will continue running with in-memory deduplication fallback.');
    return false;
  }
}

export function isMongoConnected() {
  return isConnected && mongoose.connection.readyState === 1;
}

export async function disconnectMongo() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    isConnected = false;
  }
}
