# ─── 构建阶段 ─────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ─── 运行阶段 ─────────────────────────────────────────────
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY --from=build /app/dist ./dist
ENV PORT=7100
ENV HOST=0.0.0.0
ENV DATA_DIR=/data
VOLUME /data
EXPOSE 7100
CMD ["node", "server/index.mjs"]
