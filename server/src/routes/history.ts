import { Router, Request, Response } from 'express';
import { getDb } from '../db';
import { authenticate } from '../middleware/auth';

const router = Router();

// Get user's playback history
router.get('/', authenticate, (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const db = getDb();
    const result = db.exec(
      'SELECT h.id, h.room_id, h.video_url, h.video_title, h.watched_at, r.name as room_name FROM playback_history h LEFT JOIN rooms r ON h.room_id = r.id WHERE h.user_id = ? ORDER BY h.watched_at DESC LIMIT 100',
      [userId]
    );
    const history = result.length > 0 ? result[0].values.map(row => ({
      id: row[0],
      roomId: row[1],
      videoUrl: row[2],
      videoTitle: row[3],
      watchedAt: row[4],
      roomName: row[5],
    })) : [];
    res.json({ history });
  } catch (err: any) {
    res.status(500).json({ error: '获取历史记录失败' });
  }
});

export default router;
