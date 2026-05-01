import express from 'express';
import cors from 'cors';
import http from 'http';
import path from 'path';
import { initDb, startAutoSave, stopAutoSave } from './db';
import { setupSocket } from './socket';
import authRoutes from './routes/auth';
import roomRoutes from './routes/rooms';
import historyRoutes from './routes/history';

const PORT = process.env.PORT || 3001;
const CLIENT_DIR = path.join(__dirname, '..', '..', 'client', 'dist');

async function main() {
  // Initialize database
  await initDb();
  startAutoSave();

  const app = express();
  const server = http.createServer(app);

  // Request logging
  app.use((req, _res, next) => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
    next();
  });

  // Middleware
  app.use(cors());
  app.use(express.json());

  // API Routes
  app.use('/api/auth', authRoutes);
  app.use('/api/rooms', roomRoutes);
  app.use('/api/history', historyRoutes);

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  // Serve static frontend (after build)
  app.use(express.static(CLIENT_DIR));

  // SPA fallback — all non-API routes to index.html
  app.get(/^(?!\/api\/|\/socket\.io\/).*/, (_req, res) => {
    res.sendFile(path.join(CLIENT_DIR, 'index.html'));
  });

  // WebSocket
  setupSocket(server);

  server.listen(PORT, () => {
    console.log(`🎵 云同坐 server running on http://localhost:${PORT}`);
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    stopAutoSave();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    stopAutoSave();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
