const http = require('node:http');
http
  .createServer((_req, res) => {
    res.statusCode = 503;
    res.end('{"fixture":"health-failure","candidate":"unhealthy-v2"}');
  })
  .listen(Number(process.env.PORT || 3000), '0.0.0.0');
