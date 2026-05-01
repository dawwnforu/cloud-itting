import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useSocket } from '../hooks/useSocket';
import { api } from '../utils/api';
import { formatTime, extractBvid } from '../hooks/useBilibiliPlayer';
import BilibiliPlayer from '../components/BilibiliPlayer';
import VoiceChat from '../components/VoiceChat';
import UserList from '../components/UserList';
import Playlist from '../components/Playlist';

interface RoomData {
  id: string;
  name: string;
  hostId: number;
  videoUrl: string;
  videoBvid: string;
  videoTitle: string;
  isActive: boolean;
  hostName: string;
}

interface UserInfo {
  userId: number;
  username: string;
}

export default function Room() {
  const { roomId } = useParams<{ roomId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const socket = useSocket();
  const { emit, on } = socket;

  const [room, setRoom] = useState<RoomData | null>(null);
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [syncToken, setSyncToken] = useState(0);
  const [playlist, setPlaylist] = useState<{ videoUrl: string; videoBvid: string; videoTitle: string }[]>([]);
  const [shuffle, setShuffle] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(-1);

  const isHost = room ? user?.id === room.hostId : false;
  const syncingRef = useRef(false);
  const clockRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load room info
  useEffect(() => {
    if (!roomId) return;
    api.getRoom(roomId)
      .then((data) => {
        if (!data.room.isActive) {
          setError('房间已关闭');
          return;
        }
        setRoom(data.room);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [roomId]);

  // Join socket room on mount
  useEffect(() => {
    if (!room || !user) return;

    emit('set-user-info', { userId: user.id, username: user.username });
    emit('join-room', { roomId: room.id, userId: user.id, username: user.username });
    emit('record-history');

    return () => {
      emit('leave-room');
    };
  }, [room, user, emit]);

  // Virtual clock: ticks every second when playing
  useEffect(() => {
    if (isPlaying) {
      clockRef.current = setInterval(() => {
        setCurrentTime((t) => t + 1);
      }, 1000);
    } else {
      if (clockRef.current) clearInterval(clockRef.current);
    }
    return () => {
      if (clockRef.current) clearInterval(clockRef.current);
    };
  }, [isPlaying]);

  // Periodic drift correction: resync every 30s while playing
  useEffect(() => {
    if (isPlaying) {
      syncIntervalRef.current = setInterval(() => {
        setSyncToken((t) => t + 1);
      }, 30000);
    } else {
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
    }
    return () => {
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
    };
  }, [isPlaying]);

  // Listen for socket sync events
  useEffect(() => {
    const unsubs: (() => void)[] = [];

    unsubs.push(
      on('room-state', (state: { isPlaying: boolean; currentTime: number; videoUrl: string; videoBvid: string; videoTitle: string; playlist?: any[]; shuffle?: boolean; currentIndex?: number }) => {
        syncingRef.current = true;
        setCurrentTime(state.currentTime);
        setIsPlaying(state.isPlaying);
        if (room && state.videoBvid !== room.videoBvid) {
          setRoom((prev) => prev ? { ...prev, videoUrl: state.videoUrl, videoBvid: state.videoBvid, videoTitle: state.videoTitle } : prev);
        }
        if (state.playlist) setPlaylist(state.playlist);
        if (state.shuffle !== undefined) setShuffle(state.shuffle);
        if (state.currentIndex !== undefined) setCurrentIndex(state.currentIndex);
        setSyncToken((t) => t + 1);
        setTimeout(() => { syncingRef.current = false; }, 500);
      })
    );

    unsubs.push(
      on('sync-play', (data: { currentTime: number }) => {
        syncingRef.current = true;
        setCurrentTime(data.currentTime);
        setIsPlaying(true);
        setSyncToken((t) => t + 1);
        setTimeout(() => { syncingRef.current = false; }, 500);
      })
    );

    unsubs.push(
      on('sync-pause', (data: { currentTime: number }) => {
        syncingRef.current = true;
        setCurrentTime(data.currentTime);
        setIsPlaying(false);
        setSyncToken((t) => t + 1);
        setTimeout(() => { syncingRef.current = false; }, 500);
      })
    );

    unsubs.push(
      on('sync-seek', (data: { currentTime: number }) => {
        syncingRef.current = true;
        setCurrentTime(data.currentTime);
        setSyncToken((t) => t + 1);
        setTimeout(() => { syncingRef.current = false; }, 500);
      })
    );

    unsubs.push(
      on('sync-video', (data: { videoUrl: string; videoBvid: string; videoTitle: string; playlistIndex?: number }) => {
        setRoom((prev) => prev ? { ...prev, videoUrl: data.videoUrl, videoBvid: data.videoBvid, videoTitle: data.videoTitle } : prev);
        setCurrentTime(0);
        setIsPlaying(false);
        setSyncToken((t) => t + 1);
        if (data.playlistIndex !== undefined) setCurrentIndex(data.playlistIndex);
      })
    );

    unsubs.push(
      on('user-list', (userList: UserInfo[]) => {
        setUsers(userList);
      }));

    unsubs.push(
      on('playlist-update', (data: { playlist: typeof playlist; shuffle: boolean; currentIndex: number }) => {
        setPlaylist(data.playlist);
        setShuffle(data.shuffle);
        setCurrentIndex(data.currentIndex);
      })
    );

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [on, room]);

  // Everyone can control playback
  const handlePlay = useCallback(() => {
    if (syncingRef.current) return;
    const now = currentTime;
    setIsPlaying(true);
    setSyncToken((t) => t + 1);
    emit('sync-play', { currentTime: now });
  }, [currentTime, emit]);

  const handlePause = useCallback(() => {
    if (syncingRef.current) return;
    const now = currentTime;
    setIsPlaying(false);
    setSyncToken((t) => t + 1);
    emit('sync-pause', { currentTime: now });
  }, [currentTime, emit]);

  const handleSeek = useCallback((newTime: number) => {
    if (syncingRef.current) return;
    setCurrentTime(newTime);
    setSyncToken((t) => t + 1);
    emit('sync-seek', { currentTime: newTime });
  }, [emit]);

  // Keyboard controls
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          if (isPlaying) handlePause(); else handlePlay();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          handleSeek(Math.max(0, currentTime - (e.shiftKey ? 10 : 5)));
          break;
        case 'ArrowRight':
          e.preventDefault();
          handleSeek(currentTime + (e.shiftKey ? 10 : 5));
          break;
        case 'KeyN':
          if (!e.ctrlKey && !e.metaKey) {
            emit('play-next');
          }
          break;
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isPlaying, currentTime, handlePlay, handlePause, handleSeek, emit]);

  const handleResync = useCallback(() => {
    emit('sync-request');
  }, [emit]);

  const [copied, setCopied] = useState(false);

  const copyRoomCode = async () => {
    if (!room) return;
    try {
      await navigator.clipboard.writeText(room.id);
    } catch {
      // Fallback for non-HTTPS / older browsers
      const el = document.createElement('textarea');
      el.value = room.id;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) return <div className="loading">加载房间中...</div>;
  if (error) return (
    <div className="error-page">
      <p>{error}</p>
      <button onClick={() => navigate('/')} className="btn btn-primary">返回首页</button>
    </div>
  );
  if (!room) return null;

  return (
    <div className="room-page">
      <div className="room-main">
        <div className="room-topbar">
          <div className="room-info">
            <h3>{room.name}</h3>
            <span className="room-code" onClick={copyRoomCode} title="点击复制房间码">
              {copied ? '✅ 已复制' : `房间码: ${room.id} 📋`}
            </span>
            <span className="room-host-label">房主: {room.hostName}</span>
          </div>
          <VoiceChat socket={socket} roomId={room.id} />
        </div>

        <BilibiliPlayer
          bvid={room.videoBvid}
          isPlaying={isPlaying}
          currentTime={currentTime}
          syncToken={syncToken}
        />

        {/* Playback controls — everyone can use */}
        <div className="playback-controls">
          <div className="control-bar">
            <button
              className="btn btn-icon"
              onClick={isPlaying ? handlePause : handlePlay}
              title={isPlaying ? '暂停' : '播放'}
            >
              {isPlaying ? '⏸' : '▶'}
            </button>
            <span className="time-display">{formatTime(currentTime)}</span>
            <input
              type="range"
              className="seek-bar"
              min={0}
              max={Math.max(currentTime + 120, 600)}
              value={currentTime}
              onChange={(e) => handleSeek(Number(e.target.value))}
            />
            {isHost && <span className="host-badge-ctrl">🎮 房主</span>}
          </div>

          {/* Tools bar */}
          <div className="player-tools">
            <button className="btn btn-sm btn-outline" onClick={() => {
              const el = document.querySelector('.player-wrapper');
              if (el) {
                if (document.fullscreenElement) {
                  document.exitFullscreen();
                } else {
                  el.requestFullscreen();
                }
              }
            }}>
              ⛶ 全屏
            </button>
            <button className="btn btn-sm btn-outline" onClick={handleResync}>
              🔄 同步
            </button>
          </div>

          <div className="sync-status">
            <span className={`sync-dot ${isPlaying ? 'synced' : ''}`} />
            <span>{isPlaying ? '▶ 播放中' : '⏸ 已暂停'}</span>
          </div>
        </div>
      </div>

      <div className="room-sidebar">
        <UserList users={users} hostId={room.hostId} />
        <Playlist
          socket={socket}
          playlist={playlist}
          shuffle={shuffle}
          currentIndex={currentIndex}
        />
      </div>
    </div>
  );
}
