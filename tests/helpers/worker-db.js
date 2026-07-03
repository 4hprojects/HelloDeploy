import { MongoMemoryServer } from 'mongodb-memory-server';
import { mongoose, connectDatabase, disconnectDatabase } from '@hellodeploy/database';

let mongod = null;

/** Start an in-memory MongoDB and connect the shared mongoose instance to it. */
export async function startTestDb() {
  mongod = await MongoMemoryServer.create();
  await connectDatabase(mongod.getUri('hellodeploy-test'));
}

/** Disconnect and stop the in-memory MongoDB. */
export async function stopTestDb() {
  await disconnectDatabase();
  if (mongod) {
    await mongod.stop();
    mongod = null;
  }
}

/** Drop all collections between tests without restarting the server. */
export async function clearTestDb() {
  const collections = await mongoose.connection.db.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
}

export function objectId() {
  return new mongoose.Types.ObjectId();
}
