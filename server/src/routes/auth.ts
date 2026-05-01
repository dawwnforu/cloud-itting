import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { getPool } from '../db';
import { generateToken, authenticate } from '../middleware/auth';

const router = Router();

router.post('/register', async (req: Request, res: Response) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: '请填写所有字段' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: '密码至少6位' });
    }

    const pool = getPool();
    const existing = await pool.query('SELECT id FROM users WHERE username = $1 OR email = $2', [username, email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: '用户名或邮箱已被注册' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id',
      [username, email, passwordHash]
    );
    const userId = result.rows[0].id;

    const token = generateToken(userId);
    res.status(201).json({ token, user: { id: userId, username, email } });
  } catch (err: any) {
    console.error('注册失败:', err);
    res.status(500).json({ error: '注册失败' });
  }
});

router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: '请填写邮箱和密码' });
    }

    const pool = getPool();
    const result = await pool.query(
      'SELECT id, username, email, password_hash FROM users WHERE email = $1',
      [email]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ error: '邮箱或密码错误' });
    }

    const { id, username, email: userEmail, password_hash: passwordHash } = result.rows[0];
    const valid = await bcrypt.compare(password, passwordHash);
    if (!valid) {
      return res.status(401).json({ error: '邮箱或密码错误' });
    }

    const token = generateToken(id);
    res.json({ token, user: { id, username, email: userEmail } });
  } catch (err: any) {
    console.error('登录失败:', err);
    res.status(500).json({ error: '登录失败' });
  }
});

router.post('/reset-password', async (req: Request, res: Response) => {
  try {
    const { email, newPassword } = req.body;

    if (!email || !newPassword) {
      return res.status(400).json({ error: '请填写邮箱和新密码' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: '新密码至少6位' });
    }

    const pool = getPool();
    const result = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: '该邮箱未注册' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password_hash = $1 WHERE email = $2', [passwordHash, email]);

    res.json({ message: '密码重置成功，请使用新密码登录' });
  } catch (err: any) {
    console.error('密码重置失败:', err);
    res.status(500).json({ error: '密码重置失败' });
  }
});

router.get('/me', authenticate, async (req: Request, res: Response) => {
  const pool = getPool();
  const userId = (req as any).userId;
  const result = await pool.query('SELECT id, username, email FROM users WHERE id = $1', [userId]);
  if (result.rows.length === 0) {
    return res.status(404).json({ error: '用户不存在' });
  }
  const { id, username, email } = result.rows[0];
  res.json({ user: { id, username, email } });
});

export default router;
