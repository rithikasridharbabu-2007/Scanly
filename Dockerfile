FROM node:22-bookworm-slim
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends procps ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
RUN npx playwright install --with-deps chromium
COPY . .
RUN npm run build && mkdir -p /app/data && chown -R node:node /app/data /app/.next
ENV NODE_ENV=production SCANLY_DB_PATH=/app/data/scanly.sqlite
USER node
CMD ["npm", "start"]
