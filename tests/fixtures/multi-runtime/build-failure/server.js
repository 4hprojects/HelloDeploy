require('node:http')
  .createServer((_req, res) => res.end('{"fixture":"build-failure","baseline":true}'))
  .listen(Number(process.env.PORT || 3000), '0.0.0.0');
