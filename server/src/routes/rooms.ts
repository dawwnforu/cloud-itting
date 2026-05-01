import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getPool } from '../db';
import { authenticate } from '../middleware/auth';

const router = Router();

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

router.post('/', authenticate, async (req: Request, res: Response) => {
  try {
    const { name, videoUrl, videoBvid, videoTitle } = req.body;
    const hostId = (req as any).userId;

    if (!name || !videoUrl) {
      return res.status(400).json({ error: '请填写房间名和视频链接' });
    }

    const pool = getPool();
    const roomId = generateRoomCode();

    await pool.query(
      'INSERT INTO rooms (id, name, host_id, video_url, video_bvid, video_title) VALUES ($1, $2, $3, $4, $5, $6)',
      [roomId, name, hostId, videoUrl, videoBvid || '', videoTitle || '']
    );

    res.status(201).json({
      room: {
        id: roomId,
        name,
        hostId,
        videoUrl,
        videoBvid: videoBvid || '',
        videoTitle: videoTitle || '',
      },
    });
  } catch (err: any) {
    console.error('创建房间失败:', err);
    res.status(500).json({ error: '创建房间失败' });
  }
});

router.get('/', async (_req: Request, res: Response) => {
  try {
    const pool = getPool();
    const result = await pool.query(
      'SELECT r.id, r.name, r.video_title, r.created_at, u.username as host_name FROM rooms r JOIN users u ON r.host_id = u.id WHERE r.is_active = 1 ORDER BY r.created_at DESC LIMIT 50'
    );
    const rooms = result.rows.map(row => ({
      id: row.id,
      name: row.name,
      videoTitle: row.video_title,
      createdAt: row.created_at,
      hostName: row.host_name,
    }));
    res.json({ rooms });
  } catch (err: any) {
    console.error('获取房间列表失败:', err);
    res.status(500).json({ error: '获取房间列表失败' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const roomId = req.params.id;
    console.log('查询房间:', roomId);
    const result = await pool.query(
      'SELECT r.id, r.name, r.host_id, r.video_url, r.video_bvid, r.video_title, r.is_active, r.created_at, u.username as host_name FROM rooms r JOIN users u ON r.host_id = u.id WHERE r.id = $1',
      [roomId]
    );
    if (result.rows.length === 0) {
      console.log('房间未找到:', roomId);
      return res.status(404).json({ error: '房间不存在，请检查房间码是否正确' });
    }
    const row = result.rows[0];
    res.json({
      room: {
        id: row.id,
        name: row.name,
        hostId: row.host_id,
        videoUrl: row.video_url,
        videoBvid: row.video_bvid,
        videoTitle: row.video_title,
        isActive: row.is_active,
        createdAt: row.created_at,
        hostName: row.host_name,
      },
    });
  } catch (err: any) {
    console.error('获取房间信息失败:', err);
    res.status(500).json({ error: '获取房间信息失败' });
  }
});

export default router;
