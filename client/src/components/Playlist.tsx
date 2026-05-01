import { useState } from 'react';
import { extractBvid, fetchVideoInfo } from '../hooks/useBilibiliPlayer';

interface PlaylistItem {
  videoUrl: string;
  videoBvid: string;
  videoTitle: string;
  duration: number;
}

interface Props {
  socket: ReturnType<typeof import('../hooks/useSocket').useSocket>;
  playlist: PlaylistItem[];
  shuffle: boolean;
  currentIndex: number;
}

export default function Playlist({ socket, playlist, shuffle, currentIndex }: Props) {
  const { emit } = socket;
  const [url, setUrl] = useState('');
  const [adding, setAdding] = useState(false);

  const handleAdd = async () => {
    const bvid = extractBvid(url.trim());
    if (!bvid || adding) return;
    setAdding(true);

    const info = await fetchVideoInfo(bvid);
    emit('add-to-playlist', {
      item: {
        videoUrl: url.trim(),
        videoBvid: bvid,
        videoTitle: info?.title || '',
        duration: info?.duration || 0,
      },
    });
    setUrl('');
    setAdding(false);
  };

  const handleRemove = (index: number) => {
    emit('remove-from-playlist', { index });
  };

  const handlePlayFromList = (index: number) => {
    emit('play-from-list', { index });
  };

  const handleNext = () => {
    emit('play-next');
  };

  const handleToggleShuffle = () => {
    emit('set-shuffle', { shuffle: !shuffle });
  };

  const formatDur = (s: number) => {
    if (!s) return '';
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div className="playlist">
      <div className="playlist-header">
        <span>📋 播放列表</span>
        <span className="playlist-count">{playlist.length}首</span>
        <button
          className={`btn btn-sm ${shuffle ? 'btn-primary' : 'btn-outline'}`}
          onClick={handleToggleShuffle}
          title={shuffle ? '随机播放中' : '顺序播放'}
        >
          {shuffle ? '🔀 随机' : '➡ 顺序'}
        </button>
      </div>

      <div className="playlist-items">
        {playlist.length === 0 ? (
          <div className="playlist-empty">粘贴B站链接添加视频</div>
        ) : (
          playlist.map((item, idx) => (
            <div
              key={idx}
              className={`playlist-item ${idx === currentIndex ? 'current' : ''}`}
              onClick={() => handlePlayFromList(idx)}
            >
              <span className="playlist-index">{idx + 1}</span>
              <span className="playlist-title">{item.videoTitle || item.videoBvid}</span>
              {item.duration > 0 && <span className="playlist-dur">{formatDur(item.duration)}</span>}
              <button
                className="btn btn-sm btn-icon playlist-remove"
                onClick={(e) => { e.stopPropagation(); handleRemove(idx); }}
                title="移除"
              >
                ✕
              </button>
            </div>
          ))
        )}
      </div>

      <div className="playlist-controls">
        <input
          type="text"
          className="input"
          placeholder="粘贴B站视频链接..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
        />
        <button className="btn btn-sm btn-primary" onClick={handleAdd} disabled={adding}>
          {adding ? '...' : '添加'}
        </button>
        <button
          className="btn btn-sm btn-outline"
          onClick={handleNext}
          disabled={playlist.length === 0}
        >
          ⏭ 下一首
        </button>
      </div>
    </div>
  );
}
