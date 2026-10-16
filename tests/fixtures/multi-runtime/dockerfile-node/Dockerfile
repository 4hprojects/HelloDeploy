# syntax=docker/dockerfile:1
FROM node:22-alpine
WORKDIR /app
COPY server.js ./
USER node
EXPOSE 8080
CMD ["node", "server.js"]
