const http = require('node:http');

const server = http.createServer((req, res) => {
  if (req.url === '/acceptance') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ fixture: 'dockerfile-node', ok: true, uid: process.getuid() }));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('dockerfile-node-ok');
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0');
