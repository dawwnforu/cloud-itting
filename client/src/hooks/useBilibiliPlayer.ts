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
