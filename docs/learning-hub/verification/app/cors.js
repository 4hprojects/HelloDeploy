const express = require('express');
const cors = require('cors');

const risky = express();
risky.use(cors({ origin: true, credentials: true }));
risky.get('/me', (req, res) => res.json({ user: 'demo' }));
risky.listen(3002);

const safer = express();
safer.use(cors({ origin: ['https://app.example.com'], credentials: true }));
safer.use(express.json({ limit: '100kb' }));
safer.get('/me', (req, res) => res.json({ user: 'demo' }));
safer.post('/data', (req, res) => res.json({ ok: true }));
safer.get('/boom', () => {
  throw new Error('internal detail');
});
safer.listen(3003);
