FROM node:22-alpine AS build
WORKDIR /app
RUN apk add --no-cache git
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache git openssh-client
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY sql ./sql
COPY git-askpass.sh /usr/local/bin/git-askpass
RUN chmod 0755 /usr/local/bin/git-askpass
EXPOSE 8090
USER node
CMD ["node", "dist/main.js"]
