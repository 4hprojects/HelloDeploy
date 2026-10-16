require('node:http')
  .createServer((_req, res) => res.end('{"fixture":"slow-build","ok":true}'))
  .listen(Number(process.env.PORT || 3000), '0.0.0.0');
