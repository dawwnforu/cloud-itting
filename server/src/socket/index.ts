import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { getPool } from '../db';

interface PlaylistItem {
  videoUrl: string;
  videoBvid: string;
  videoTitle: string;
}

interface RoomState {
  isPlaying: boolean;
  currentTime: number;
  videoUrl: string;
  videoBvid: string;
  videoTitle: string;
  playlist: PlaylistItem[];
  shuffle: boolean;
  currentIndex: number;
}

const roomStates = new Map<string, RoomState>();

function defaultRoomState(): RoomState {
  return {
    isPlaying: false,
    currentTime: 0,
    videoUrl: '',
    videoBvid: '',
    videoTitle: '',
    playlist: [],
    shuffle: false,
    currentIndex: -1,
  };
}

export function setupSocket(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  const peerMap = new Map<string, string>();

  io.on('connection', (socket: Socket) => {
    let currentRoom: string | null = null;
    let currentUser: { userId: number; username: string } | null = null;

    socket.on('set-peer-id', (data: { peerId: string }) => {
      peerMap.set(socket.id, data.peerId);
    });

    socket.on('join-room', (data: { roomId: string; userId: number; username: string }) => {
      const { roomId, userId, username } = data;
      currentRoom = roomId;
      currentUser = { userId, username };

      socket.join(roomId);

      // Initialize room state if needed
      if (!roomStates.has(roomId)) {
        roomStates.set(roomId, defaultRoomState());
      }
      const state = roomStates.get(roomId)!;
      socket.emit('room-state', state);

      socket.to(roomId).emit('user-joined', { userId, username });

      const sockets = io.sockets.adapter.rooms.get(roomId);
      const users: { userId: number; username: string }[] = [];
      if (sockets) {
        sockets.forEach((sid) => {
          const s = io.sockets.sockets.get(sid);
          if (s && s.data.userInfo) {
            users.push(s.data.userInfo);
          }
        });
      }
      io.to(roomId).emit('user-list', users);
    });

    socket.on('set-user-info', (data: { userId: number; username: string }) => {
      socket.data.userInfo = data;
    });

    socket.on('sync-play', (data: { currentTime: number }) => {
      if (!currentRoom) return;
      const state = roomStates.get(currentRoom);
      if (state) {
        state.isPlaying = true;
        state.currentTime = data.currentTime;
      }
      socket.to(currentRoom).emit('sync-play', data);
    });

    socket.on('sync-pause', (data: { currentTime: number }) => {
      if (!currentRoom) return;
      const state = roomStates.get(currentRoom);
      if (state) {
        state.isPlaying = false;
        state.currentTime = data.currentTime;
      }
      socket.to(currentRoom).emit('sync-pause', data);
    });

    socket.on('sync-seek', (data: { currentTime: number }) => {
      if (!currentRoom) return;
      const state = roomStates.get(currentRoom);
      if (state) {
        state.currentTime = data.currentTime;
      }
      socket.to(currentRoom).emit('sync-seek', data);
    });

    socket.on('sync-video', async (data: { videoUrl: string; videoBvid: string; videoTitle: string; playlistIndex?: number }) => {
      if (!currentRoom) return;
      const existing = roomStates.get(currentRoom);
      roomStates.set(currentRoom, {
        isPlaying: false,
        currentTime: 0,
        videoUrl: data.videoUrl,
        videoBvid: data.videoBvid,
        videoTitle: data.videoTitle,
        playlist: existing?.playlist || [],
        shuffle: existing?.shuffle || false,
        currentIndex: data.playlistIndex ?? existing?.currentIndex ?? -1,
      });

      const pool = getPool();
      await pool.query(
        'UPDATE rooms SET video_url = $1, video_bvid = $2, video_title = $3 WHERE id = $4',
        [data.videoUrl, data.videoBvid, data.videoTitle, currentRoom]
      );
      socket.to(currentRoom).emit('sync-video', data);
    });

    // === Playlist events ===

    socket.on('add-to-playlist', async (data: { item: PlaylistItem }) => {
      if (!currentRoom) return;
      const state = roomStates.get(currentRoom);
      if (!state) return;
      state.playlist.push(data.item);

      // If this is the first item and nothing is playing, auto-select it
      if (state.playlist.length === 1 && !state.videoBvid) {
        state.currentIndex = 0;
        state.videoUrl = data.item.videoUrl;
        state.videoBvid = data.item.videoBvid;
        state.videoTitle = data.item.videoTitle;
      }

      await persistPlaylist(currentRoom, state);
      io.to(currentRoom).emit('playlist-update', { playlist: state.playlist, shuffle: state.shuffle, currentIndex: state.currentIndex });

      // If first item was auto-selected, also sync video
      if (state.playlist.length === 1 && state.videoBvid === data.item.videoBvid) {
        io.to(currentRoom).emit('sync-video', { videoUrl: state.videoUrl, videoBvid: state.videoBvid, videoTitle: state.videoTitle, playlistIndex: 0 });
      }
    });

    socket.on('remove-from-playlist', async (data: { index: number }) => {
      if (!currentRoom) return;
      const state = roomStates.get(currentRoom);
      if (!state) return;
      state.playlist.splice(data.index, 1);

      // Adjust currentIndex
      if (data.index === state.currentIndex) {
        state.currentIndex = -1;
      } else if (data.index < state.currentIndex) {
        state.currentIndex--;
      }

      await persistPlaylist(currentRoom, state);
      io.to(currentRoom).emit('playlist-update', { playlist: state.playlist, shuffle: state.shuffle, currentIndex: state.currentIndex });
    });

    socket.on('play-from-list', async (data: { index: number }) => {
      if (!currentRoom) return;
      const state = roomStates.get(currentRoom);
      if (!state) return;
      if (data.index < 0 || data.index >= state.playlist.length) return;

      const item = state.playlist[data.index];
      state.currentIndex = data.index;
      state.videoUrl = item.videoUrl;
      state.videoBvid = item.videoBvid;
      state.videoTitle = item.videoTitle;
      state.isPlaying = false;
      state.currentTime = 0;

      await persistPlaylist(currentRoom, state);
      io.to(currentRoom).emit('sync-video', { videoUrl: item.videoUrl, videoBvid: item.videoBvid, videoTitle: item.videoTitle, playlistIndex: data.index });
    });

    socket.on('play-next', async () => {
      if (!currentRoom) return;
      const state = roomStates.get(currentRoom);
      if (!state) return;
      if (state.playlist.length === 0) return;

      let nextIndex: number;
      if (state.shuffle) {
        // Random excluding current
        let idx: number;
        do {
          idx = Math.floor(Math.random() * state.playlist.length);
        } while (idx === state.currentIndex && state.playlist.length > 1);
        nextIndex = idx;
      } else {
        nextIndex = (state.currentIndex + 1) % state.playlist.length;
      }

      const item = state.playlist[nextIndex];
      state.currentIndex = nextIndex;
      state.videoUrl = item.videoUrl;
      state.videoBvid = item.videoBvid;
      state.videoTitle = item.videoTitle;
      state.isPlaying = false;
      state.currentTime = 0;

      await persistPlaylist(currentRoom, state);
      io.to(currentRoom).emit('sync-video', { videoUrl: item.videoUrl, videoBvid: item.videoBvid, videoTitle: item.videoTitle, playlistIndex: nextIndex });
    });

    socket.on('set-shuffle', async (data: { shuffle: boolean }) => {
      if (!currentRoom) return;
      const state = roomStates.get(currentRoom);
      if (!state) return;
      state.shuffle = data.shuffle;

      await persistPlaylist(currentRoom, state);
      io.to(currentRoom).emit('playlist-update', { playlist: state.playlist, shuffle: state.shuffle, currentIndex: state.currentIndex });
    });

    socket.on('sync-request', () => {
      if (!currentRoom) return;
      const state = roomStates.get(currentRoom);
      if (state) {
        io.to(currentRoom).emit('room-state', state);
      }
    });

    socket.on('voice-signal', (data: { to: string; signal: any }) => {
      for (const [sid, pid] of peerMap.entries()) {
        if (pid === data.to) {
          io.to(sid).emit('voice-signal', {
            from: peerMap.get(socket.id) || socket.id,
            signal: data.signal,
          });
          break;
        }
      }
    });

    socket.on('get-peers', () => {
      if (!currentRoom) return;
      const sockets = io.sockets.adapter.rooms.get(currentRoom);
      const peers: string[] = [];
      if (sockets) {
        sockets.forEach((sid) => {
          if (sid !== socket.id) {
            const peerId = peerMap.get(sid);
            if (peerId) peers.push(peerId);
          }
        });
      }
      socket.emit('peers-list', peers);
    });

    socket.on('record-history', async () => {
      if (!currentRoom || !currentUser) return;
      const state = roomStates.get(currentRoom);
      const pool = getPool();
      await pool.query(
        'INSERT INTO playback_history (user_id, room_id, video_url, video_title) VALUES ($1, $2, $3, $4)',
        [currentUser.userId, currentRoom, state?.videoUrl || '', state?.videoTitle || '']
      );
      setTimeout(() => {
        socket.to(currentRoom!).emit('user-joined', { userId: currentUser!.userId, username: currentUser!.username });
      }, 100);
    });

    socket.on('leave-room', () => {
      if (currentRoom && currentUser) {
        socket.to(currentRoom).emit('user-left', { userId: currentUser.userId, username: currentUser.username });
        socket.leave(currentRoom);

        const sockets = io.sockets.adapter.rooms.get(currentRoom);
        const users: { userId: number; username: string }[] = [];
        if (sockets) {
          sockets.forEach((sid) => {
            const s = io.sockets.sockets.get(sid);
            if (s && s.data.userInfo) {
              users.push(s.data.userInfo);
            }
          });
        }
        io.to(currentRoom).emit('user-list', users);
      }
      currentRoom = null;
    });

    socket.on('disconnect', () => {
      peerMap.delete(socket.id);
      if (currentRoom && currentUser) {
        socket.to(currentRoom).emit('user-left', { userId: currentUser.userId, username: currentUser.username });
        socket.leave(currentRoom);

        const sockets = io.sockets.adapter.rooms.get(currentRoom);
        const users: { userId: number; username: string }[] = [];
        if (sockets) {
          sockets.forEach((sid) => {
            const s = io.sockets.sockets.get(sid);
            if (s && s.data.userInfo) {
              users.push(s.data.userInfo);
            }
          });
        }
        io.to(currentRoom).emit('user-list', users);
      }
    });
  });

  return io;
}

async function persistPlaylist(roomId: string, state: RoomState) {
  const pool = getPool();
  await pool.query(
    'UPDATE rooms SET playlist = $1 WHERE id = $2',
    [JSON.stringify(state.playlist), roomId]
  );
}
