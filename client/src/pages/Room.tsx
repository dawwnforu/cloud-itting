import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useSocket } from '../hooks/useSocket';
import { api } from '../utils/api';
import { formatTime } from '../hooks/useBilibiliPlayer';
import BilibiliPlayer from '../components/BilibiliPlayer';
import VoiceChat from '../components/VoiceChat';
import UserList from '../components/UserList';

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
  const [duration, setDuration] = useState(0);

  const isHost = room ? user?.id === room.hostId : false;
  const syncingRef = useRef(false);
  const clockRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  // Listen for socket sync events
  useEffect(() => {
    const unsubs: (() => void)[] = [];

    // New joiner gets current state
    unsubs.push(
      on('room-state', (state: { isPlaying: boolean; currentTime: number; videoUrl: string; videoBvid: string; videoTitle: string }) => {
        syncingRef.current = true;
        setCurrentTime(state.currentTime);
        setIsPlaying(state.isPlaying);
        if (room && state.videoBvid !== room.videoBvid) {
          setRoom((prev) => prev ? { ...prev, videoUrl: state.videoUrl, videoBvid: state.videoBvid, videoTitle: state.videoTitle } : prev);
        }
        setTimeout(() => { syncingRef.current = false; }, 500);
      })
    );

    unsubs.push(
      on('sync-play', (data: { currentTime: number }) => {
        syncingRef.current = true;
        setCurrentTime(data.currentTime);
        setIsPlaying(true);
        setTimeout(() => { syncingRef.current = false; }, 500);
      })
    );

    unsubs.push(
      on('sync-pause', (data: { currentTime: number }) => {
        syncingRef.current = true;
        setCurrentTime(data.currentTime);
        setIsPlaying(false);
        setTimeout(() => { syncingRef.current = false; }, 500);
      })
    );

    unsubs.push(
      on('sync-seek', (data: { currentTime: number }) => {
        syncingRef.current = true;
        setCurrentTime(data.currentTime);
        setTimeout(() => { syncingRef.current = false; }, 500);
      })
    );

    unsubs.push(
      on('sync-video', (data: { videoUrl: string; videoBvid: string; videoTitle: string }) => {
        setRoom((prev) => prev ? { ...prev, videoUrl: data.videoUrl, videoBvid: data.videoBvid, videoTitle: data.videoTitle } : prev);
        setCurrentTime(0);
        setIsPlaying(false);
      })
    );

    unsubs.push(
      on('user-list', (userList: UserInfo[]) => {
        setUsers(userList);
      })
    );

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [on, room]);

  // === HOST CONTROLS ===
  const handleHostPlay = useCallback(() => {
    if (!isHost || syncingRef.current) return;
    const now = currentTime;
    setIsPlaying(true);
    emit('sync-play', { currentTime: now });
  }, [isHost, currentTime, emit]);

  const handleHostPause = useCallback(() => {
    if (!isHost || syncingRef.current) return;
    const now = currentTime;
    setIsPlaying(false);
    emit('sync-pause', { currentTime: now });
  }, [isHost, currentTime, emit]);

  const handleHostSeek = useCallback((newTime: number) => {
    if (!isHost || syncingRef.current) return;
    setCurrentTime(newTime);
    emit('sync-seek', { currentTime: newTime });
  }, [isHost, emit]);

  const copyRoomCode = () => {
    if (room) {
      navigator.clipboard.writeText(room.id);
    }
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
              房间码: {room.id} 📋
            </span>
            <span className="room-host-label">房主: {room.hostName}</span>
          </div>
          <VoiceChat socket={socket} roomId={room.id} />
        </div>

        <BilibiliPlayer
          bvid={room.videoBvid}
          isPlaying={isPlaying}
          currentTime={currentTime}
        />

        {/* Custom playback controls */}
        <div className="playback-controls">
          <div className="control-bar">
            {isHost ? (
              <>
                <button
                  className="btn btn-icon"
                  onClick={isPlaying ? handleHostPause : handleHostPlay}
                  title={isPlaying ? '暂停' : '播放'}
                >
                  {isPlaying ? '⏸' : '▶'}
                </button>
                <span className="time-display">
                  {formatTime(currentTime)}
                  {duration > 0 && ` / ${formatTime(duration)}`}
                </span>
                <input
                  type="range"
                  className="seek-bar"
                  min={0}
                  max={duration > 0 ? duration : 999}
                  value={currentTime}
                  onChange={(e) => handleHostSeek(Number(e.target.value))}
                />
                <span className="host-badge-ctrl">🎮 房主控制中</span>
              </>
            ) : (
              <>
                <span className="time-display">
                  {formatTime(currentTime)}
                </span>
                <div className="sync-status">
                  <span className={`sync-dot ${isPlaying ? 'synced' : ''}`} />
                  <span>{isPlaying ? '▶ 同步播放中' : '⏸ 已暂停'}</span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="room-sidebar">
        <UserList users={users} hostId={room.hostId} />
      </div>
    </div>
  );
}
