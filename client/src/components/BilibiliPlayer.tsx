import { useRef, useEffect } from 'react';
import { getPlayerUrl } from '../hooks/useBilibiliPlayer';

interface Props {
  bvid: string;
  isPlaying: boolean;
  currentTime: number;
  syncToken: number;
  quality: number;
}

export default function BilibiliPlayer({ bvid, isPlaying, currentTime, syncToken, quality }: Props) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const prevKeyRef = useRef('');

  const seekKey = `${bvid}-${syncToken}-${quality}`;

  useEffect(() => {
    if (!bvid) return;
    if (seekKey === prevKeyRef.current) return;
    prevKeyRef.current = seekKey;

    const url = getPlayerUrl(bvid, isPlaying, Math.floor(currentTime), quality);
    if (iframeRef.current) {
      iframeRef.current.src = url;
    }
  }, [seekKey, bvid, isPlaying, currentTime, quality]);

  if (!bvid) {
    return (
      <div className="player-placeholder">
        <p>等待选择视频...</p>
      </div>
    );
  }

  return (
    <div className="player-wrapper">
      <iframe
        ref={iframeRef}
        src={getPlayerUrl(bvid, false, 0, quality)}
        allow="autoplay"
        allowFullScreen
        className="bilibili-iframe"
      />
      {/* Overlay prevents accidental clicks from redirecting to B站 */}
      <div className="iframe-overlay" />
      {!isPlaying && (
        <div className="player-pause-overlay">
          <span>⏸ 已暂停</span>
        </div>
      )}
    </div>
  );
}
