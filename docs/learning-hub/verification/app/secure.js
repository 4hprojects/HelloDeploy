const express = require('express');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');

const app = express();
app.set('trust proxy', 'loopback');
app.disable('x-powered-by');
app.use(helmet());
app.use(express.json({ limit: '100kb' }));

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5 });
app.post('/login', loginLimiter, (req, res) => res.json({ ip: req.ip }));
app.get('/ip', (req, res) => res.json({ ip: req.ip }));

app.listen(Number(process.env.PORT) || 3001);
