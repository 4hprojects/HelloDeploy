const express = require('express');
const app = express();
app.get('/', (_req, res) => res.send('express-ok'));
app.get('/acceptance', (_req, res) => res.json({ fixture: 'express', ok: true }));
app.listen(Number(process.env.PORT || 3000), '0.0.0.0');
