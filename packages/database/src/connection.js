import mongoose from 'mongoose';

let connectionPromise = null;

/**
 * Connect to MongoDB. Idempotent — returns the existing connection if already connected.
 * @param {string} uri - MongoDB connection URI
 * @returns {Promise<typeof mongoose>}
 */
export async function connectDatabase(uri) {
  if (mongoose.connection.readyState === 1) {
    return mongoose;
  }

  if (connectionPromise) {
    return connectionPromise;
  }

  mongoose.connection.on('connected', () => {
    // Connection confirmed — no-op, caller logs
  });

  mongoose.connection.on('error', (err) => {
    // Log without exposing the URI (may contain credentials)
    process.stderr.write(`[database] MongoDB connection error: ${err.message}\n`);
  });

  mongoose.connection.on('disconnected', () => {
    connectionPromise = null;
  });

  connectionPromise = mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10_000,
    socketTimeoutMS: 45_000,
  });

  await connectionPromise;
  return mongoose;
}

/**
 * Gracefully close the MongoDB connection.
 */
export async function disconnectDatabase() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.close();
    connectionPromise = null;
  }
}

export { mongoose };
