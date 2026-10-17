# syntax=docker/dockerfile:1
# Central Kairos - Dockerfile multi-stage
# Stage 1: builder (gera frontend + bundle do servidor)
# Stage 2: runner  (imagem final enxuta)
# Banco: PostgreSQL (kairos-shared-pg do Dokploy)

FROM node:22-alpine AS builder
WORKDIR /app

RUN apk add --no-cache openssl libc6-compat

COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN npm ci 2>&1 || npm install

RUN npx prisma generate

COPY . .

RUN mkdir -p /app/assets || true
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Fontes Noto (Serif/Sans completo) + fontconfig + Liberation/DejaVu fallback
# Pra banner PNG sair com texto nitido em portugues (acentos, etc)
RUN apk add --no-cache openssl libc6-compat curl tini \
    fontconfig \
    font-noto \
    font-noto-cjk \
    ttf-dejavu \
    ttf-liberation

COPY package.json package-lock.json* ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

RUN mkdir -p /app/backups && chown -R node:node /app
USER node

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -fsS http://localhost:3000/api/health || exit 1

EXPOSE 3000

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["sh", "-c", "npx prisma db push --skip-generate --accept-data-loss 2>/dev/null; node dist/server.cjs"]