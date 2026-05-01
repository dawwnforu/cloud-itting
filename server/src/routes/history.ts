import { Router, Request, Response } from 'express';
import { getPool } from '../db';
import { authenticate } from '../middleware/auth';

const router = Router();

router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const pool = getPool();
    const result = await pool.query(
      'SELECT h.id, h.room_id, h.video_url, h.video_title, h.watched_at, r.name as room_name FROM playback_history h LEFT JOIN rooms r ON h.room_id = r.id WHERE h.user_id = $1 ORDER BY h.watched_at DESC LIMIT 100',
      [userId]
    );
    const history = result.rows.map(row => ({
      id: row.id,
      roomId: row.room_id,
      videoUrl: row.video_url,
      videoTitle: row.video_title,
      watchedAt: row.watched_at,
      roomName: row.room_name,
    }));
    res.json({ history });
  } catch (err: any) {
    res.status(500).json({ error: '获取历史记录失败' });
  }
});

export default router;
