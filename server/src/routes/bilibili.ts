import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';

const router = Router();

// Shared in-memory store for B站 sessions (keyed by roomId)
export const bilibiliSessions = new Map<string, {
  sessdata: string;
  biliJct: string;
  dedeUserId: string;
  bilibiliUser: string;
  refreshToken?: string;
  expiresAt: number;
}>();

export const playurlCache = new Map<string, {
  dash: any;
  expires: number;
}>();

// Only these fields from B站 cookie are needed for API auth
function cookieString(session: { sessdata: string; biliJct: string; dedeUserId: string }): string {
  return `SESSDATA=${session.sessdata}; bili_jct=${session.biliJct}; DedeUserID=${session.dedeUserId}`;
}

// QR Code flow constants
const BILIBILI_QR_GENERATE = 'https://passport.bilibili.com/x/passport-login/web/qrcode/generate';
const BILIBILI_QR_POLL = 'https://passport.bilibili.com/x/passport-login/web/qrcode/poll';
const BILIBILI_VIDEO_INFO = 'https://api.bilibili.com/x/web-interface/view';
const BILIBILI_PLAYURL = 'https://api.bilibili.com/x/player/playurl';

// 0. Proxy video info (moved from index.ts)
router.get('/video-info', async (req: Request, res: Response) => {
  const bvid = req.query.bvid as string;
  if (!bvid) return res.status(400).json({ error: 'bvid required' });
  try {
    const r = await fetch(`${BILIBILI_VIDEO_INFO}?bvid=${bvid}`, {
      headers: { 'User-Agent': 'CloudSitting/1.0', 'Referer': 'https://www.bilibili.com' },
    });
    const json = await r.json();
    res.json(json);
  } catch {
    res.status(502).json({ error: 'B站 API 请求失败' });
  }
});

// 1. Generate QR code
router.get('/qrcode/generate', authenticate, async (_req: Request, res: Response) => {
  try {
    const resp = await fetch(BILIBILI_QR_GENERATE, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.bilibili.com',
      },
    });
    const data = await resp.json();
    console.log('B站 QR generate response:', JSON.stringify(data).slice(0, 200));
    if (data.code !== 0) {
      return res.status(500).json({ error: data.message || '生成二维码失败' });
    }
    res.json({ qrcode_key: data.data.qrcode_key, url: data.data.url });
  } catch (err: any) {
    console.error('B站 QR generate error:', err.message);
    res.status(500).json({ error: 'B站接口请求失败: ' + err.message });
  }
});

// 2. Poll QR code status. On success, store credentials server-side.
router.get('/qrcode/poll', authenticate, async (req: Request, res: Response) => {
  const { qrcode_key, roomId } = req.query;
  if (!qrcode_key || !roomId) {
    return res.status(400).json({ error: '缺少参数' });
  }

  try {
    const resp = await fetch(`${BILIBILI_QR_POLL}?qrcode_key=${qrcode_key}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://www.bilibili.com',
        },
      });
    const data = await resp.json();

    if (data.code === 0) {
      // Login confirmed — extract cookies from response body
      // B站 returns credential info in response body on success
      const body = data.data;
      const url = body?.url || '';

      // Extract SESSDATA from the URL or parse manually
      const sessdataMatch = url.match(/SESSDATA=([^;&]+)/);
      const biliJctMatch = url.match(/bili_jct=([^;&]+)/);
      const dedeMatch = url.match(/DedeUserID=([^;&]+)/);

      // If not in URL, try extracting from Set-Cookie headers
      // B站 API also returns credentials in the Set-Cookie response header
      const setCookie = resp.headers.get('set-cookie') || '';

      const extractFromCookie = (name: string): string => {
        const re = new RegExp(`${name}=([^;]+)`);
        const m = setCookie.match(re);
        return m ? m[1] : '';
      };

      const sessdata = sessdataMatch ? sessdataMatch[1] : extractFromCookie('SESSDATA');
      const biliJct = biliJctMatch ? biliJctMatch[1] : extractFromCookie('bili_jct');
      const dedeUserId = dedeMatch ? dedeMatch[1] : extractFromCookie('DedeUserID');

      if (!sessdata) {
        return res.status(500).json({ error: '未能获取B站登录凭证，请重试' });
      }

      const session = {
        sessdata,
        biliJct: biliJct || '',
        dedeUserId: dedeUserId || '',
        bilibiliUser: `B站用户${dedeUserId ? `#${dedeUserId}` : ''}`,
        expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 3, // ~3 days
      };

      bilibiliSessions.set(roomId as string, session);

      console.log(`B站登录成功: room=${roomId}, user=${session.bilibiliUser}`);
      return res.json({ status: 'confirmed', bilibiliUser: session.bilibiliUser });
    }

    if (data.code === 86038) {
      return res.json({ status: 'expired' });
    }
    if (data.code === 86090) {
      return res.json({ status: 'scanned' });
    }
    // 86101 or other: pending
    res.json({ status: 'pending' });
  } catch (err: any) {
    res.status(500).json({ error: '轮询失败' });
  }
});

// 3. Check B站 session status for a room
router.get('/session/:roomId', (req: Request, res: Response) => {
  const { roomId } = req.params;
  const session = bilibiliSessions.get(roomId);
  if (!session || session.expiresAt < Date.now()) {
    if (session) bilibiliSessions.delete(roomId); // cleanup expired
    return res.json({ authed: false });
  }
  res.json({ authed: true, bilibiliUser: session.bilibiliUser });
});

// 4. Proxy playurl request using room host's B站 credentials
router.get('/playurl', authenticate, async (req: Request, res: Response) => {
  const { bvid, roomId } = req.query;
  if (!bvid || !roomId) {
    return res.status(400).json({ error: '缺少参数' });
  }

  const session = bilibiliSessions.get(roomId as string);
  if (!session || session.expiresAt < Date.now()) {
    return res.status(401).json({ error: 'host_not_authenticated' });
  }

  // Check cache (5 min TTL for playurl)
  const cacheKey = `${roomId}:${bvid}`;
  const cached = playurlCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return res.json({ dash: cached.dash, cached: true });
  }

  try {
    const cookie = cookieString(session);

    // First get cid from video info
    const infoResp = await fetch(`${BILIBILI_VIDEO_INFO}?bvid=${bvid}`, {
      headers: { Cookie: cookie, Referer: 'https://www.bilibili.com' },
    });
    const infoData = await infoResp.json();
    if (infoData.code !== 0) {
      return res.status(500).json({ error: infoData.message || '获取视频信息失败' });
    }

    const cid = infoData.data?.cid || infoData.data?.pages?.[0]?.cid;
    if (!cid) {
      return res.status(500).json({ error: '无法获取视频分P信息' });
    }

    // Request highest quality DASH stream
    const playResp = await fetch(
      `${BILIBILI_PLAYURL}?bvid=${bvid}&cid=${cid}&qn=127&fnval=4048&fourk=1`,
      { headers: { Cookie: cookie, Referer: 'https://www.bilibili.com' } }
    );
    const playData = await playResp.json();
    if (playData.code !== 0) {
      return res.status(500).json({ error: playData.message || '获取播放地址失败' });
    }

    const dash = playData.data?.dash;
    if (!dash) {
      return res.status(500).json({ error: '未获取到DASH流信息' });
    }

    // Cache for 5 minutes
    playurlCache.set(cacheKey, {
      dash,
      expires: Date.now() + 1000 * 60 * 5,
    });

    res.json({ dash });
  } catch (err: any) {
    res.status(500).json({ error: 'B站播放地址请求失败' });
  }
});

// 5. MPD manifest for dash.js (no JWT auth — player can't easily send auth headers)
router.get('/manifest/:roomId', async (req: Request, res: Response) => {
  const { roomId } = req.params;
  const cacheKey = Array.from(playurlCache.keys()).find(k => k.startsWith(`${roomId}:`));

  if (!cacheKey) {
    return res.status(404).json({ error: 'No cached stream for this room' });
  }

  const cached = playurlCache.get(cacheKey);
  if (!cached || cached.expires < Date.now()) {
    return res.status(410).json({ error: 'Stream expired, request new playurl' });
  }

  const mpd = buildMpdManifest(cached.dash);
  res.set('Content-Type', 'application/dash+xml');
  res.send(mpd);
});

function buildMpdManifest(dashData: any): string {
  const { duration, video, audio } = dashData;
  const sortedVideo = [...(video || [])].sort((a: any, b: any) => b.id - a.id);

  const codecMap: Record<number, string> = {
    7: 'avc1.640028',
    12: 'hev1.1.6.L150.90',
    13: 'av01.0.12M.08',
  };
  const audioCodecMap: Record<number, string> = {
    0: 'mp4a.40.2',
  };

  function esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  }

  const videoReps = sortedVideo.map((v: any) => {
    const codec = codecMap[v.codecid] || 'avc1.640028';
    const frameRate = v.frameRate || v.frame_rate || '30';
    return `      <Representation id="${v.id}" bandwidth="${v.bandwidth}" codecs="${codec}" width="${v.width}" height="${v.height}" frameRate="${frameRate}" mimeType="video/mp4">
        <BaseURL>${esc(v.baseUrl)}</BaseURL>
        ${v.backupUrl ? v.backupUrl.map((u: string) => `<BaseURL>${esc(u)}</BaseURL>`).join('\n        ') : ''}
      </Representation>`;
  }).join('\n');

  const audioReps = (audio || []).map((a: any, i: number) => {
    const codec = audioCodecMap[a.codecid] || 'mp4a.40.2';
    const audioFrameRate = a.frameRate || a.frame_rate || a.bandwidth;
    return `    <AdaptationSet mimeType="audio/mp4" contentType="audio" segmentAlignment="true" startWithSAP="1">
      <Representation id="${a.id || 800 + i}" bandwidth="${a.bandwidth}" codecs="${codec}" mimeType="audio/mp4">
        <BaseURL>${esc(a.baseUrl)}</BaseURL>
        ${a.backupUrl ? a.backupUrl.map((u: string) => `<BaseURL>${esc(u)}</BaseURL>`).join('\n        ') : ''}
      </Representation>
    </AdaptationSet>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="utf-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011"
     profiles="urn:mpeg:dash:profile:isoff-on-demand:2011"
     minBufferTime="PT1.500S"
     mediaPresentationDuration="PT${duration}S">
  <Period duration="PT${duration}S">
    <AdaptationSet mimeType="video/mp4" contentType="video" segmentAlignment="true" startWithSAP="1">
${videoReps}
    </AdaptationSet>
${audioReps}
  </Period>
</MPD>`;
}

// Helper: pre-fetch playurl for a room (called from socket handlers on video change)
export async function prefetchPlayurl(roomId: string, bvid: string) {
  const session = bilibiliSessions.get(roomId);
  if (!session || session.expiresAt < Date.now() || !bvid) return;
  const cacheKey = `${roomId}:${bvid}`;
  if (playurlCache.has(cacheKey)) return;
  try {
    const cookie = `SESSDATA=${session.sessdata}; bili_jct=${session.biliJct}; DedeUserID=${session.dedeUserId}`;
    const infoResp = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`, {
      headers: { Cookie: cookie, Referer: 'https://www.bilibili.com' },
    });
    const infoData = await infoResp.json();
    const cid = infoData.data?.cid || infoData.data?.pages?.[0]?.cid;
    if (!cid) return;
    const playResp = await fetch(
      `https://api.bilibili.com/x/player/playurl?bvid=${bvid}&cid=${cid}&qn=127&fnval=4048&fourk=1`,
      { headers: { Cookie: cookie, Referer: 'https://www.bilibili.com' } }
    );
    const playData = await playResp.json();
    if (playData.code === 0 && playData.data?.dash) {
      playurlCache.set(cacheKey, { dash: playData.data.dash, expires: Date.now() + 1000 * 60 * 5 });
      console.log(`prefetchPlayurl: cached DASH for ${bvid} in room ${roomId}`);
    }
  } catch (err) {
    console.error('prefetchPlayurl failed:', err);
  }
}

export default router;
