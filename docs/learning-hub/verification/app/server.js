const express = require('express');

const app = express();
const port = Number(process.env.PORT) || 3000;

app.get('/healthz', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/', (req, res) => {
  res.send('Hello from Node.js');
});

const server = app.listen(port, () => {
  console.log(`Listening on port ${port}`);
});

process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});
