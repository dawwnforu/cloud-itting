import { useRef, useEffect } from 'react';
import { getPlayerUrl } from '../hooks/useBilibiliPlayer';

interface Props {
  bvid: string;
  isPlaying: boolean;
  currentTime: number;
  syncToken: number;
}

export default function BilibiliPlayer({ bvid, isPlaying, currentTime, syncToken }: Props) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const prevKeyRef = useRef('');

  const seekKey = `${bvid}-${syncToken}`;

  useEffect(() => {
    if (!bvid) return;
    if (seekKey === prevKeyRef.current) return;
    prevKeyRef.current = seekKey;

    const url = getPlayerUrl(bvid, isPlaying, Math.floor(currentTime));
    if (iframeRef.current) {
      iframeRef.current.src = url;
    }
  }, [seekKey, bvid, isPlaying, currentTime]);

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
        src={getPlayerUrl(bvid, false, 0)}
        allow="autoplay"
        allowFullScreen
        className="bilibili-iframe"
      />
      {!isPlaying && (
        <div className="player-pause-overlay">
          <span>⏸ 已暂停</span>
        </div>
      )}
    </div>
  );
}
