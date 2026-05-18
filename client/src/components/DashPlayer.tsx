import { useRef, useEffect, useCallback } from 'react';

interface Props {
  roomId: string;
  isPlaying: boolean;
  currentTime: number;
  syncToken: number;
}

export default function DashPlayer({ roomId, isPlaying, currentTime, syncToken }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const playerRef = useRef<any>(null);
  const prevSyncRef = useRef(-1);
  const manifestUrl = `/api/bilibili/manifest/${roomId}`;

  // Initialize dash.js player
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let player: any = null;

    const init = async () => {
      try {
        const dashjs = await import('dashjs');
        player = dashjs.MediaPlayer().create();
        player.initialize(video, manifestUrl, false);
        playerRef.current = player;

        // Keep highest quality
        player.updateSettings({
          streaming: {
            abr: { autoSwitchBitrate: { video: true, audio: true }, initialBitrate: { video: -1, audio: -1 } },
          },
        });
      } catch (err) {
        console.error('DashPlayer: failed to load dashjs', err);
      }
    };

    init();

    return () => {
      if (player) {
        player.reset();
        playerRef.current = null;
      }
    };
  }, [manifestUrl]);

  // Sync playback when syncToken changes
  useEffect(() => {
    if (prevSyncRef.current === syncToken) return;
    prevSyncRef.current = syncToken;

    const video = videoRef.current;
    if (!video) return;

    const target = Math.floor(currentTime);
    const diff = Math.abs(video.currentTime - target);

    // Only seek if drift > 1.5s to avoid micro-stuttering
    if (diff > 1.5) {
      video.currentTime = target;
    }

    if (isPlaying && video.paused) {
      video.play().catch(() => {});
    } else if (!isPlaying && !video.paused) {
      video.pause();
    }
  }, [syncToken, currentTime, isPlaying]);

  // Video ended → don't loop, let Room handle play-next
  const handleEnded = useCallback(() => {
    // Room's virtual clock will auto-advance
  }, []);

  return (
    <div className="player-wrapper">
      <video
        ref={videoRef}
        className="dash-video"
        onEnded={handleEnded}
        playsInline
        controls={false}
        crossOrigin="anonymous"
      />
      {!isPlaying && (
        <div className="player-pause-overlay">
          <span>⏸ 已暂停</span>
        </div>
      )}
    </div>
  );
}
