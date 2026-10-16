const http = require('node:http');
http
  .createServer((_req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ fixture: 'registry-cleanup', version: 'baseline-v1' }));
  })
  .listen(Number(process.env.PORT || 3000), '0.0.0.0');
