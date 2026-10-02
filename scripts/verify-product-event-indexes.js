#!/usr/bin/env node

import 'dotenv/config';
import { connectDatabase, disconnectDatabase, ProductEvent } from '@hellodeploy/database';

if (!process.env.MONGODB_URI) {
  throw new Error('MONGODB_URI is required to verify product-event indexes.');
}

await connectDatabase(process.env.MONGODB_URI);
try {
  const indexes = await ProductEvent.collection.indexes();
  const ttl = indexes.find(
    (index) => index.key?.createdAt === 1 && index.expireAfterSeconds === 90 * 24 * 60 * 60,
  );
  if (!ttl) {
    throw new Error('The 90-day ProductEvent TTL index is missing.');
  }
  process.stdout.write('ProductEvent indexes verified (contents were not read).\n');
} finally {
  await disconnectDatabase();
}
