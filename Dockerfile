FROM node:22-alpine

WORKDIR /app

# Install dependencies (workspaces)
COPY package.json package-lock.json* ./
COPY client/package.json client/
COPY server/package.json server/
RUN npm install --production=false

# Copy source
COPY . .

# Create data directory for SQLite

# Build frontend
RUN npm run build

EXPOSE 3001
CMD ["npm", "start"]
