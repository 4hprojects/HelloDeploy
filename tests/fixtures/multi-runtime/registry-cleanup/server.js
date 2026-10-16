const http = require('node:http');
http
  .createServer((_req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ fixture: 'registry-cleanup', version: 'candidate-v2' }));
  })
  .listen(Number(process.env.PORT || 3000), '0.0.0.0');
