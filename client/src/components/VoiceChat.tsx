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

  const setupVoice = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;

      const peer = new Peer({
        host: '0.peerjs.com',
        port: 443,
        secure: true,
        debug: 1,
      });

      peer.on('open', (peerId) => {
        setIsConnected(true);
        // Tell server our peer ID
        socket.emit('set-peer-id', { peerId });
        // Request peer list
        socket.emit('get-peers');
      });

      // Answer incoming calls
      peer.on('call', (call) => {
        call.answer(stream);
        call.on('stream', () => {
          setConnectedPeers((prev) => [...prev, call.peer]);
        });
        connectionsRef.current.set(call.peer, call);
      });

      peer.on('error', (err) => {
        setError('语音连接失败: ' + err.message);
      });

      peerRef.current = peer;
    } catch (err: any) {
      setError('无法访问麦克风: ' + err.message);
    }
  }, [socket]);

  // Handle WebRTC signaling relay
  useEffect(() => {
    const unsubs: (() => void)[] = [];

    // Listen for incoming voice signals
    unsubs.push(
      on('voice-signal', (data: { from: string; signal: any }) => {
        if (peerRef.current && !connectionsRef.current.has(data.from)) {
          const call = peerRef.current.call(data.from, localStreamRef.current!);
          call.on('stream', () => {
            setConnectedPeers((prev) => [...prev, data.from]);
          });
          connectionsRef.current.set(data.from, call);
        }
      })
    );

    // Get peers list
    unsubs.push(
      on('peers-list', (peers: string[]) => {
        const p = peerRef.current;
        const stream = localStreamRef.current;
        if (!p || !stream) return;
        const myId = p.id;

        peers.forEach((peerId) => {
          if (peerId !== myId && !connectionsRef.current.has(peerId)) {
            const call = p.call(peerId, stream);
            call.on('stream', () => {
              setConnectedPeers((prev) => [...prev, peerId]);
            });
            connectionsRef.current.set(peerId, call);

            // We also need signaling relay for this
            // Socket.IO doesn't do direct peer-to-peer; we use the voice-signal event
          }
        });
      })
    );

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [on]);

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
