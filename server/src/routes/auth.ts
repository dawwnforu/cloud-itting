import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { getPool } from '../db';
import { generateToken, authenticate } from '../middleware/auth';

const router = Router();

router.post('/register', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: '请填写用户名和密码' });
    }

    if (password.length < 4) {
      return res.status(400).json({ error: '密码至少4位' });
    }

    if (username.length < 2 || username.length > 20) {
      return res.status(400).json({ error: '用户名2-20个字符' });
    }

    const pool = getPool();
    const existing = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: '用户名已被注册' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    // email has UNIQUE constraint — generate a placeholder since we don't use email
    const placeholderEmail = `u${Date.now()}@user.local`;
    const result = await pool.query(
      'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id',
      [username, placeholderEmail, passwordHash]
    );
    const userId = result.rows[0].id;

    const token = generateToken(userId);
    res.status(201).json({ token, user: { id: userId, username } });
  } catch (err: any) {
    console.error('注册失败:', err);
    res.status(500).json({ error: '注册失败' });
  }
});

router.post('/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: '请填写用户名和密码' });
    }

    const pool = getPool();
    const result = await pool.query(
      'SELECT id, username, password_hash FROM users WHERE username = $1',
      [username]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    const row = result.rows[0];
    const valid = await bcrypt.compare(password, row.password_hash);
    if (!valid) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    const token = generateToken(row.id);
    res.json({ token, user: { id: row.id, username: row.username } });
  } catch (err: any) {
    console.error('登录失败:', err);
    res.status(500).json({ error: '登录失败' });
  }
});

router.post('/reset-password', async (req: Request, res: Response) => {
  try {
    const { username, newPassword } = req.body;

    if (!username || !newPassword) {
      return res.status(400).json({ error: '请填写用户名和新密码' });
    }

    if (newPassword.length < 4) {
      return res.status(400).json({ error: '新密码至少4位' });
    }

    const pool = getPool();
    const result = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: '该用户名未注册' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password_hash = $1 WHERE username = $2', [passwordHash, username]);

    res.json({ message: '密码重置成功，请使用新密码登录' });
  } catch (err: any) {
    console.error('密码重置失败:', err);
    res.status(500).json({ error: '密码重置失败' });
  }
});

router.get('/me', authenticate, async (req: Request, res: Response) => {
  const pool = getPool();
  const userId = (req as any).userId;
  const result = await pool.query('SELECT id, username FROM users WHERE id = $1', [userId]);
  if (result.rows.length === 0) {
    return res.status(404).json({ error: '用户不存在' });
  }
  const { id, username } = result.rows[0];
  res.json({ user: { id, username } });
});

export default router;
