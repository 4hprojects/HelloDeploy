const http = require('node:http');
http
  .createServer((req, res) => {
    if (req.url === '/pressure') {
      const blocks = [];
      for (let i = 0; i < 64; i += 1) {
        blocks.push(Buffer.alloc(1024 * 1024));
      }
      res.end(JSON.stringify({ allocatedMb: blocks.length }));
      return;
    }
    res.end('{"fixture":"resource-pressure","ok":true}');
  })
  .listen(Number(process.env.PORT || 3000), '0.0.0.0');
