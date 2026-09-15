# Backend bot (Node.js)
FROM node:20-alpine

WORKDIR /app

# Install dependencies dulu (cache layer)
COPY package.json package-lock.json ./
RUN npm ci

# Salin sumber backend dan frontend dashboard
COPY src ./src
COPY dashboard ./dashboard
COPY public ./public
# Salin template Excel (Form Nominasi LNG)
COPY templates ./templates

# Build dashboard Vite ke public/dashboard.
# Dependensi dev diperlukan hanya pada tahap build lalu tidak ikut runtime.
RUN npm run build:dashboard && npm prune --omit=dev

ENV NODE_ENV=production
EXPOSE 3001

CMD ["node", "src/server.js"]
