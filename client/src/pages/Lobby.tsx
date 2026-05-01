import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { api } from '../utils/api';
import { extractBvid } from '../hooks/useBilibiliPlayer';

export default function Lobby() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [showCreate, setShowCreate] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    const bvid = extractBvid(videoUrl);
    if (!bvid) {
      setError('无法解析 B站链接，请提供包含 BV 号的完整链接');
      return;
    }

    setLoading(true);
    try {
      const data = await api.createRoom({
        name: roomName,
        videoUrl,
        videoBvid: bvid,
        videoTitle: roomName,
      });
      navigate(`/room/${data.room.id}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = (e: FormEvent) => {
    e.preventDefault();
    if (joinCode.trim()) {
      navigate(`/room/${joinCode.trim().toUpperCase()}`);
    }
  };

  return (
    <div className="lobby">
      <div className="lobby-header">
        <h2>☁ 云同坐</h2>
        <p className="lobby-subtitle">和朋友一起看 B站 视频</p>
      </div>

      <div className="lobby-cards">
        <div className="card lobby-card">
          <h3>加入房间</h3>
          <p className="card-desc">输入朋友分享的6位房间码</p>
          <form onSubmit={handleJoin} className="join-form">
            <input
              type="text"
              placeholder="输入房间码"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              maxLength={6}
              className="code-input"
            />
            <button type="submit" className="btn btn-primary btn-full">加入</button>
          </form>
        </div>

        <div className="card lobby-card">
          <h3>创建房间</h3>
          <p className="card-desc">选一个 B站视频，生成房间码发给朋友</p>
          {!showCreate ? (
            <button className="btn btn-secondary btn-full" onClick={() => setShowCreate(true)}>
              创建房间
            </button>
          ) : (
            <form onSubmit={handleCreate}>
              {error && <div className="error-msg">{error}</div>}
              <input
                type="text"
                placeholder="房间名称"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                required
                autoFocus
              />
              <input
                type="text"
                placeholder="B站视频链接（含 BV 号）"
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                required
              />
              <div className="form-btns">
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? '创建中...' : '创建'}
                </button>
                <button type="button" className="btn btn-outline" onClick={() => { setShowCreate(false); setError(''); }}>
                  取消
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
