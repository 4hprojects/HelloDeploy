const fs = require('node:fs');
const http = require('node:http');
http
  .createServer((_req, res) => {
    const result = {
      fixture: 'isolation-probe',
      dockerSocket: fs.existsSync('/var/run/docker.sock'),
      hostRootMounted: fs.existsSync('/host/etc/passwd'),
      privilegedDevice: fs.existsSync('/dev/kmsg'),
    };
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(result));
  })
  .listen(Number(process.env.PORT || 3000), '0.0.0.0');
