# Phase 4b: Optional Support HelloDeploy

## Experience
Optional Support HelloDeploy card on Pricing with small footer/About link. Supporters choose PayPal, GCash QR or bank-generated interoperable transfer QR when verified. State donations do not change tier, resources, queue priority, appeal outcome, or service guarantees. No required login, recurring payment opt-in or guilt messaging.

## Security and operations
Prefer provider-hosted PayPal payment page and provider-generated QR. Never manufacture QR payment payloads or put raw banking details in source. Confirm identity/eligibility of recipient, QR validity, PayPal availability/fees, transfer restrictions, public personal data exposure, accounting/tax treatment and provider terms. Avoid representing an unregistered service as a charity or payments as tax-deductible. Do not build custom card capture or unneeded webhooks. If any transaction callback later exists, verify cryptographic signatures and minimize data. Do not disclose supporter identity without consent.

## Explicit gate
Without owner-provided VERIFIED PayPal link and QR images/details, deliver designed placeholders disabled/hidden in production; do not publish payment facilities or invent banking info. Human approval required before collection begins.
