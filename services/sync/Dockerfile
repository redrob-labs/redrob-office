# Redrob Office sync. Runs the TypeScript source directly with Node's type stripping.
FROM node:22-alpine
WORKDIR /srv
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod --ignore-workspace
COPY src ./src
# Amazon RDS's certificate authorities, for verified TLS to the database (SYNC_DB_CA_FILE)
ADD --chmod=644 https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem /srv/rds-global-bundle.pem
ENV NODE_ENV=production
USER node
EXPOSE 8787 8788
CMD ["node", "--experimental-strip-types", "src/main.ts"]
