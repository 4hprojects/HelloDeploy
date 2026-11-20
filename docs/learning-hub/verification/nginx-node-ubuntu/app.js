const http = require('node:http');

const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'text/plain');
  res.end(`hello from ${req.headers['x-forwarded-for'] ?? 'unknown'}\n`);
});

server.listen(3000, '127.0.0.1');
