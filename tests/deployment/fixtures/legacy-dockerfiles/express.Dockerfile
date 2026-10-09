FROM node:22-alpine
WORKDIR /app
COPY --chown=node:node . .
RUN npm ci --prefer-offline --omit=dev
USER node
EXPOSE 4000
ENV PORT=4000
CMD ["sh","-c","npm run migrate && node server.js"]
