import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { mongoose, connectDatabase, disconnectDatabase } from '@hellodeploy/database';

let replicaSet = null;

export async function startApprovalTestDb() {
  replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await connectDatabase(replicaSet.getUri('hellodeploy-approval-test'));
}

export async function stopApprovalTestDb() {
  await disconnectDatabase();
  if (replicaSet) {
    await replicaSet.stop();
    replicaSet = null;
  }
}

export async function clearApprovalTestDb() {
  const collections = await mongoose.connection.db.collections();
  await Promise.all(collections.map((collection) => collection.deleteMany({})));
}

export function approvalObjectId() {
  return new mongoose.Types.ObjectId();
}
