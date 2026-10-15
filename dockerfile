FROM node:20-bookworm-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build-server && npm run build-web -- --no-optimize

EXPOSE 8133 8134
CMD ["npm", "start"]