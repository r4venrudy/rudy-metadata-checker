FROM node:24-bookworm-slim
LABEL org.opencontainers.image.source="https://github.com/r4venrudy/rudy-metadata-checker" org.opencontainers.image.licenses="MIT"
RUN apt-get update && apt-get install -y --no-install-recommends libfontconfig1 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY index.js raven.png LICENSE ./
COPY packaging ./packaging
RUN npm test && node --check index.js
ENV NODE_ENV=production
USER node
ENTRYPOINT ["node", "/app/index.js"]
