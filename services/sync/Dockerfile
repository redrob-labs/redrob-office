# Redrob Office sync. Runs the TypeScript source directly with Node's type stripping.
FROM node:22-alpine
WORKDIR /srv
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod --ignore-workspace
COPY src ./src
ENV NODE_ENV=production
USER node
EXPOSE 8787 8788
CMD ["node", "--experimental-strip-types", "src/main.ts"]
