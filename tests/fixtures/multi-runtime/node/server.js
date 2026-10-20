const http = require('node:http');
const server = http.createServer((req, res) => {
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ fixture: 'node', ok: true, path: req.url }));
});
server.listen(Number(process.env.PORT || 3000), '0.0.0.0');
