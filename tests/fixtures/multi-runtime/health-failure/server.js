const http = require('node:http');
http
  .createServer((_req, res) => {
    res.statusCode = 200;
    res.end('{"fixture":"health-failure","baseline":true}');
  })
  .listen(Number(process.env.PORT || 3000), '0.0.0.0');
