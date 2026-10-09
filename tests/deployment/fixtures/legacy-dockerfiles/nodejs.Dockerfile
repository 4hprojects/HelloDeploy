FROM node:22-alpine
WORKDIR /app
COPY --chown=node:node . .
RUN npm ci --prefer-offline --omit=dev
USER node
EXPOSE 3000
ENV PORT=3000
CMD ["sh","-c","node server.js"]
