import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export function getPool(): Pool {
  return pool;
}

export async function initDb(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS rooms (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        host_id INTEGER NOT NULL REFERENCES users(id),
        video_url TEXT,
        video_bvid TEXT,
        video_title TEXT DEFAULT '',
        is_active INTEGER DEFAULT 1,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS playback_history (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        room_id TEXT NOT NULL,
        video_url TEXT,
        video_title TEXT DEFAULT '',
        watched_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
  } finally {
    client.release();
  }
}

export async function closeDb(): Promise<void> {
  await pool.end();
}
