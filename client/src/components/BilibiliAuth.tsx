import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../utils/api';

interface Props {
  roomId: string;
  isHost: boolean;
}

export default function BilibiliAuth({ roomId, isHost }: Props) {
  const [showQr, setShowQr] = useState(false);
  const [qrUrl, setQrUrl] = useState('');
  const [status, setStatus] = useState<'pending' | 'scanned' | 'confirmed' | 'expired' | 'error'>('pending');
  const [bilibiliUser, setBilibiliUser] = useState('');
  const [authed, setAuthed] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const qrcodeKeyRef = useRef('');

  // Check existing session on mount
  useEffect(() => {
    if (!roomId) return;
    fetch(`/api/bilibili/session/${roomId}`)
      .then(r => r.json())
      .then(data => {
        if (data.authed) {
          setAuthed(true);
          setBilibiliUser(data.bilibiliUser);
        }
      })
      .catch(() => {});
  }, [roomId]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const handleStart = async () => {
    setShowQr(true);
    setStatus('pending');
    try {
      const res = await fetch('/api/bilibili/qrcode/generate', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      const data = await res.json();
      if (data.error) {
        setStatus('error');
        return;
      }
      qrcodeKeyRef.current = data.qrcode_key;
      setQrUrl(data.url);

      // Start polling
      pollRef.current = setInterval(async () => {
        try {
          const pollRes = await fetch(
            `/api/bilibili/qrcode/poll?qrcode_key=${qrcodeKeyRef.current}&roomId=${roomId}`,
            { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
          );
          const pollData = await pollRes.json();
          if (pollData.status === 'confirmed') {
            stopPolling();
            setStatus('confirmed');
            setAuthed(true);
            setBilibiliUser(pollData.bilibiliUser || 'B站用户');
            setTimeout(() => setShowQr(false), 1500);
          } else if (pollData.status === 'expired') {
            setStatus('expired');
          } else if (pollData.status === 'scanned') {
            setStatus('scanned');
          }
        } catch {
          // keep polling
        }
      }, 2000);
    } catch {
      setStatus('error');
    }
  };

  const handleClose = () => {
    stopPolling();
    setShowQr(false);
    setQrUrl('');
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  if (!isHost) {
    return authed ? (
      <span className="bilibili-badge">🔵 B站已连接</span>
    ) : null;
  }

  if (authed) {
    return (
      <span className="bilibili-badge authed" title="B站已登录">
        🔵 {bilibiliUser}
      </span>
    );
  }

  return (
    <>
      <button className="btn btn-sm btn-outline bilibili-login-btn" onClick={handleStart}>
        🔐 登录B站
      </button>

      {showQr && (
        <div className="modal-overlay" onClick={handleClose}>
          <div className="modal-card qr-modal" onClick={e => e.stopPropagation()}>
            <h3>B站扫码登录</h3>
            {qrUrl && status !== 'error' ? (
              <>
                <div className="qr-wrapper">
                  <img src={qrUrl} alt="B站登录二维码" />
                </div>
                <div className="qr-status">
                  {status === 'pending' && <p>📱 请使用B站客户端扫码</p>}
                  {status === 'scanned' && <p>✅ 已扫码，请在手机上确认</p>}
                  {status === 'confirmed' && <p className="success">🎉 登录成功！</p>}
                  {status === 'expired' && (
                    <div>
                      <p>⏰ 二维码已过期</p>
                      <button className="btn btn-sm btn-primary" onClick={handleStart}>
                        重新获取
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <p>加载失败，请重试</p>
            )}
            <button className="btn btn-sm btn-outline modal-close-btn" onClick={handleClose}>
              关闭
            </button>
          </div>
        </div>
      )}
    </>
  );
}
