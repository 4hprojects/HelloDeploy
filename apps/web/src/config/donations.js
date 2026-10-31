import { env } from './env.js';

/**
 * The donation options to show, or null while donations must stay hidden:
 * the owner's switch is off or no verified destination is configured.
 */
export function donationOptions({
  enabled = env.DONATIONS_ENABLED,
  paypalUrl = env.PAYPAL_DONATE_URL,
  gcashQrPath = env.DONATION_GCASH_QR_PATH,
  bankQrPath = env.DONATION_BANK_QR_PATH,
} = {}) {
  if (!enabled || !(paypalUrl || gcashQrPath || bankQrPath)) {
    return null;
  }
  return { paypalUrl, gcashQrPath, bankQrPath };
}
