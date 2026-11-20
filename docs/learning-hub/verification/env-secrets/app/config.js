const REQUIRED = ['DATABASE_URL', 'PAYMENT_API_KEY'];

const missing = REQUIRED.filter((name) => !process.env[name]);
if (missing.length > 0) {
  // Name the missing variables, never print their values.
  console.error(`Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

module.exports = {
  databaseUrl: process.env.DATABASE_URL,
  paymentApiKey: process.env.PAYMENT_API_KEY,
};
