import express from 'express';
import cors from 'cors';
import http from 'http';
import path from 'path';
import { initDb, closeDb } from './db';
import { setupSocket } from './socket';
import authRoutes from './routes/auth';
import roomRoutes from './routes/rooms';
import historyRoutes from './routes/history';

const PORT = process.env.PORT || 3001;
const CLIENT_DIR = path.join(__dirname, '..', '..', 'client', 'dist');

async function main() {
  // Initialize database
  await initDb();

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

  // Proxy B站 video info (server-to-server avoids browser CORS)
  app.get('/api/bilibili/video-info', async (req, res) => {
    const bvid = req.query.bvid as string;
    if (!bvid) return res.status(400).json({ error: 'bvid required' });
    try {
      const r = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`, {
        headers: { 'User-Agent': 'CloudSitting/1.0', 'Referer': 'https://www.bilibili.com' },
      });
      const json = await r.json();
      res.json(json);
    } catch {
      res.status(502).json({ error: 'B站 API 请求失败' });
    }
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
  const shutdown = async () => {
    await closeDb();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
