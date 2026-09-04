# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS client
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
RUN npm ci
COPY client client
RUN npm run build -w client

FROM node:22-bookworm-slim
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ git ca-certificates libudev1 libudev-dev \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
RUN npm ci --omit=dev
COPY server server
COPY --from=client /app/client/dist /app/client/dist
ENV CLIENT_DIST=/app/client/dist
ENV PORT=3848
ENV LISTEN_HOST=0.0.0.0
EXPOSE 3848
WORKDIR /app/server
CMD ["node", "index.js"]
