# Leapbud 租赁系统后端（NestJS + Prisma + LibreOffice）
# 构建上下文：项目根目录
FROM node:20-bookworm-slim AS builder

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY backend/package*.json ./
COPY backend/prisma ./prisma/

RUN npm ci

COPY backend/ .

RUN rm -rf dist && \
    npx prisma generate --schema=prisma/schema.prisma && \
    npm run build && \
    test -f dist/main.js

FROM node:20-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production
ENV TZ=Asia/Hong_Kong

# curl：健康检查；LibreOffice + CJK 字体：协议/账单 PDF；python3-uno：UNO 转换
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    python3 \
    python3-uno \
    libreoffice-writer-nogui \
    libreoffice-java-common \
    default-jre-headless \
    fonts-dejavu \
    fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/*

COPY backend/package*.json ./
COPY backend/prisma ./prisma/

# bcrypt 编译需要 make/g++；保留系统 python3（LibreOffice UNO）
RUN apt-get update && apt-get install -y --no-install-recommends make g++ \
    && npm ci --omit=dev \
    && npm install prisma@6.15.0 --no-save \
    && npx prisma generate --schema=prisma/schema.prisma \
    && apt-get purge -y make g++ \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/dist ./dist
COPY backend/scripts ./scripts

COPY docker/backend/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh \
    && mkdir -p /app/uploads

EXPOSE 3410

HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=5 \
  CMD curl -f http://127.0.0.1:3410/api/health || exit 1

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["node", "dist/main.js"]
