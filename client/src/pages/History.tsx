import { useState, useEffect } from 'react';
import { api } from '../utils/api';

interface HistoryItem {
  id: number;
  roomId: string;
  videoUrl: string;
  videoTitle: string;
  watchedAt: string;
  roomName: string;
}

export default function History() {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getHistory()
      .then((data) => setHistory(data.history))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading">加载中...</div>;

  return (
    <div className="history-page">
      <h2>播放历史</h2>
      {history.length === 0 && (
        <p className="empty">暂无播放记录，去创建或加入一个房间吧</p>
      )}
      <div className="history-list">
        {history.map((item) => (
          <div key={item.id} className="card history-card">
            <div className="history-info">
              <h4>{item.videoTitle || item.roomName || '未知视频'}</h4>
              <p>房间: {item.roomName || item.roomId}</p>
              <p className="history-time">{new Date(item.watchedAt).toLocaleString('zh-CN')}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
