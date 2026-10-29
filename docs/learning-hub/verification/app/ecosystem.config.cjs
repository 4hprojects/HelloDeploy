module.exports = {
  apps: [
    {
      name: 'myapp',
      script: 'server.js',
      instances: 1,
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
    },
  ],
};
