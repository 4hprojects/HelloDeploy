# syntax=docker/dockerfile:1
FROM node:22-alpine
WORKDIR /app
COPY server.js ./
USER 1000
EXPOSE 8080
CMD ["node", "server.js"]
