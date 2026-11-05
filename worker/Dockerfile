# Worker Baileys untuk FYY WhatsApp Admin
FROM node:22-alpine

WORKDIR /app

# Dependensi native ringan untuk libsignal/curve
RUN apk add --no-cache python3 make g++ ca-certificates

COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund

COPY tsconfig.json ./
COPY src ./src

ENV NODE_ENV=production
ENV WA_LOG_LEVEL=info

# Worker tidak membuka port: komunikasi hanya lewat MongoDB
CMD ["npx", "tsx", "src/index.ts"]
