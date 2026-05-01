// B站 iframe URL 构造工具
// B站 player.bilibili.com 支持以下 URL 参数:
//   bvid=xxx  - BV号
//   page=1    - 分P
//   autoplay=1/0 - 自动播放
//   t=123     - 起始时间(秒)
//   high_quality=1 - 高清

export function getPlayerUrl(bvid: string, autoplay: boolean, time: number): string {
  const params = new URLSearchParams({
    bvid,
    page: '1',
    high_quality: '1',
    autoplay: autoplay ? '1' : '0',
  });
  if (time > 0) {
    params.set('t', String(Math.floor(time)));
  }
  return `https://player.bilibili.com/player.html?${params.toString()}`;
}

// Extract BV号 from various B站 URL formats
export function extractBvid(url: string): string | null {
  const directMatch = url.match(/BV[a-zA-Z0-9]{10}/);
  if (directMatch) return directMatch[0];
  return null;
}

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
