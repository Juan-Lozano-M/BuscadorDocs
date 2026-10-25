FROM node:22-alpine

WORKDIR /app
COPY backend/package.json ./backend/package.json
COPY backend ./backend
COPY shared ./shared
RUN npm install --global opencode-ai

ENV NODE_ENV=production
ENV PORT=3001
WORKDIR /app/backend
EXPOSE 3001
CMD ["npm", "start"]
