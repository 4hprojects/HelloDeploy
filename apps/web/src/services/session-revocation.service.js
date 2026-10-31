import { mongoose } from '@hellodeploy/database';

/**
 * Delete a user's server-side sessions so a suspension or credential change
 * takes effect at once.
 *
 * `requireAuth` reads status from the session's own copy of the user rather than
 * the record, so suspending alone leaves every signed-in browser working. The
 * cookie is rolling, so an active tab renews it indefinitely and the suspension
 * never lands. Dropping the stored sessions is what ends access.
 *
 * `exceptSessionId` keeps the caller's own session, for a change the user made
 * from that browser. Returns the number of sessions removed; a store that is not reachable is not
 * allowed to fail the caller's action.
 */
export async function revokeUserSessions(userId, { exceptSessionId = null } = {}) {
  const collection = mongoose.connection.db?.collection('sessions');
  if (!collection) {
    return 0;
  }

  // connect-mongo serialises the session to a JSON string, so the user id is
  // matched inside it. An ObjectId's hex carries no regex metacharacters, and
  // normalising through ObjectId keeps anything else out of the pattern.
  const id = new mongoose.Types.ObjectId(String(userId)).toString();
  const { deletedCount } = await collection.deleteMany({
    session: { $regex: `"id":"${id}"` },
    ...(exceptSessionId && { _id: { $ne: String(exceptSessionId) } }),
  });
  return deletedCount ?? 0;
}
