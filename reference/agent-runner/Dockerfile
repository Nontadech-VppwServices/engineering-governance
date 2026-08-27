FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig*.json ./
COPY src ./src
RUN npm run build
FROM node:22-alpine
RUN apk add --no-cache git openssh-client
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY git-askpass.sh /usr/local/bin/git-askpass
RUN chmod 500 /usr/local/bin/git-askpass && mkdir -p /workspaces && chown -R node:node /workspaces
USER node
EXPOSE 8088
CMD ["node","dist/main.js"]
