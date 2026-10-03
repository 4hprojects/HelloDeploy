import { applyPlatformReleaseCallback } from '../services/platform-release.service.js';

export async function postPlatformReleaseCallback(req, res) {
  const result = await applyPlatformReleaseCallback({
    requestId: req.params.requestId,
    rawBody: req.body,
    timestamp: req.headers['x-hellodeploy-timestamp'],
    signature: req.headers['x-hellodeploy-signature'],
  });
  if (!result.success) {
    return res.status(result.statusCode).json({ error: result.error });
  }
  return res.status(204).end();
}
