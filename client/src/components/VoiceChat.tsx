import { useState, useEffect, useRef, useCallback } from 'react';
import Peer, { MediaConnection } from 'peerjs';
import { useAuth } from '../hooks/useAuth';

interface Props {
  socket: ReturnType<typeof import('../hooks/useSocket').useSocket>;
  roomId: string;
}

export default function VoiceChat({ socket, roomId }: Props) {
  const { user } = useAuth();
  const [isMuted, setIsMuted] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [connectedPeers, setConnectedPeers] = useState<string[]>([]);
  const peerRef = useRef<Peer | null>(null);
  const connectionsRef = useRef<Map<string, MediaConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState('');

  const { on } = socket;

  const connectToPeer = useCallback((peerId: string, stream: MediaStream, peer: Peer) => {
    if (connectionsRef.current.has(peerId)) return;

    const call = peer.call(peerId, stream);
    call.on('stream', () => {
      setConnectedPeers((prev) => [...prev, peerId]);
    });
    call.on('close', () => {
      connectionsRef.current.delete(peerId);
      setConnectedPeers((prev) => prev.filter((p) => p !== peerId));
    });
    call.on('error', () => {
      connectionsRef.current.delete(peerId);
    });
    connectionsRef.current.set(peerId, call);
  }, []);

  const setupVoice = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;

      const peer = new Peer({
        host: '0.peerjs.com',
        port: 443,
        secure: true,
        debug: 0,
      });

      peer.on('open', (peerId) => {
        setIsConnected(true);
        socket.emit('set-peer-id', { peerId });
        socket.emit('get-peers');
      });

      // Answer incoming calls
      peer.on('call', (call) => {
        call.answer(stream);
        call.on('stream', () => {
          setConnectedPeers((prev) => {
            if (prev.includes(call.peer)) return prev;
            return [...prev, call.peer];
          });
        });
        call.on('close', () => {
          connectionsRef.current.delete(call.peer);
          setConnectedPeers((prev) => prev.filter((p) => p !== call.peer));
        });
        connectionsRef.current.set(call.peer, call);
      });

      peer.on('error', (err) => {
        console.error('PeerJS error:', err);
        setError('语音连接失败');
      });

      peerRef.current = peer;
    } catch (err: any) {
      setError('无法访问麦克风: ' + err.message);
    }
  }, [socket]);

  // When peers list arrives, connect to new peers
  useEffect(() => {
    const unsub = on('peers-list', (peers: string[]) => {
      const peer = peerRef.current;
      const stream = localStreamRef.current;
      if (!peer || !stream) return;
      const myId = peer.id;

      peers.forEach((peerId) => {
        if (peerId !== myId) {
          connectToPeer(peerId, stream, peer);
        }
      });
    });

    // Re-request peers periodically (new joiners)
    const interval = setInterval(() => {
      if (peerRef.current?.id) {
        socket.emit('get-peers');
      }
    }, 5000);

    return () => {
      unsub();
      clearInterval(interval);
    };
  }, [on, socket, connectToPeer]);

  useEffect(() => {
    setupVoice();

    return () => {
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      peerRef.current?.destroy();
    };
  }, [setupVoice]);

  const toggleMute = () => {
    if (localStreamRef.current) {
      const enabled = !isMuted;
      localStreamRef.current.getAudioTracks().forEach((t) => (t.enabled = !enabled));
      setIsMuted(enabled);
    }
  };

  return (
    <div className="voice-chat">
      <div className="voice-header">
        <span className={`voice-dot ${isConnected ? 'connected' : ''}`} />
        <span>语音</span>
        <span className="voice-count">{connectedPeers.length}人</span>
      </div>
      {error && <div className="error-msg small">{error}</div>}
      <button
        className={`btn btn-sm ${isMuted ? 'btn-danger' : 'btn-outline'}`}
        onClick={toggleMute}
        disabled={!isConnected}
      >
        {isMuted ? '🔇 已静音' : '🎤 开麦'}
      </button>
    </div>
  );
}
