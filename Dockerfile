FROM node:24-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080
ENV DATABASE_PATH=/data/conecta-rhid.sqlite

COPY package.json ./
COPY server.js app.js index.html styles.css ./
COPY assets ./assets

RUN mkdir -p /data

EXPOSE 8080

CMD ["node", "server.js"]
