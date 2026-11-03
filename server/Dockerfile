FROM node:22-alpine

ENV NODE_ENV=production \
    UPLOADS_DIR=/data/uploads \
    TZ=Europe/Madrid
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src
COPY migrations ./migrations
COPY seed ./seed
COPY scripts ./scripts

RUN mkdir -p /data/uploads && chown -R node:node /data
USER node

EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -qO- http://127.0.0.1:3001/health || exit 1

CMD ["node", "src/index.js"]
