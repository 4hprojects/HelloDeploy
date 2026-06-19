#!/usr/bin/env node
/**
 * Seed the first Super Admin account.
 *
 * Usage:
 *   node scripts/seed-super-admin.js
 *
 * Required environment variables (loaded from .env):
 *   MONGODB_URI, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD,
 *   SUPER_ADMIN_FIRST_NAME, SUPER_ADMIN_LAST_NAME
 *
 * This script is single-use by design:
 *   - It will refuse to run if a Super Admin already exists.
 *   - Delete or archive the existing Super Admin before re-seeding.
 */

import 'dotenv/config';
import { connectDatabase, disconnectDatabase, User } from '@hellodeploy/database';
import { hashPassword } from '@hellodeploy/auth';
import { PlatformRole, UserStatus } from '@hellodeploy/contracts';

const required = (name) => {
  const v = process.env[name];
  if (!v) {
    process.stderr.write(`Missing required env var: ${name}\n`);
    process.exit(1);
  }
  return v;
};

async function seed() {
  const mongoUri = required('MONGODB_URI');
  const email = required('SUPER_ADMIN_EMAIL').toLowerCase();
  const password = required('SUPER_ADMIN_PASSWORD');
  const firstName = required('SUPER_ADMIN_FIRST_NAME');
  const lastName = required('SUPER_ADMIN_LAST_NAME');

  if (password.length < 12) {
    process.stderr.write('Super Admin password must be at least 12 characters.\n');
    process.exit(1);
  }

  process.stdout.write('Connecting to database…\n');
  await connectDatabase(mongoUri);

  const existing = await User.findOne({ platformRole: PlatformRole.SUPER_ADMIN });
  if (existing) {
    process.stderr.write(
      `A Super Admin already exists (${existing.email}). Refusing to re-seed.\n`,
    );
    await disconnectDatabase();
    process.exit(1);
  }

  const emailTaken = await User.findOne({ email });
  if (emailTaken) {
    process.stderr.write(`Email ${email} is already in use.\n`);
    await disconnectDatabase();
    process.exit(1);
  }

  const passwordHash = await hashPassword(password);

  await User.create({
    firstName,
    lastName,
    email,
    passwordHash,
    platformRole: PlatformRole.SUPER_ADMIN,
    status: UserStatus.ACTIVE,
    emailVerifiedAt: new Date(),
  });

  process.stdout.write(`Super Admin created: ${email}\n`);
  process.stdout.write('Keep these credentials secure and do not store them in source control.\n');

  await disconnectDatabase();
  process.exit(0);
}

seed().catch((err) => {
  process.stderr.write(`Seed failed: ${err.message}\n`);
  process.exit(1);
});
