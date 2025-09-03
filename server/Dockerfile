# MCP server Dockerfile
FROM node:20-alpine AS base
WORKDIR /app
COPY package.json pnpm-lock.yaml* package-lock.json* ./
RUN npm i -g pnpm && pnpm install --frozen-lockfile || pnpm install
COPY . .
RUN pnpm build
EXPOSE 8787
CMD [ "node", "dist/index.js" ]
