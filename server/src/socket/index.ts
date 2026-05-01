import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { getDb, saveDb } from '../db';

interface RoomState {
  isPlaying: boolean;
  currentTime: number;
  videoUrl: string;
  videoBvid: string;
  videoTitle: string;
}

// Store room states in memory
const roomStates = new Map<string, RoomState>();

export function setupSocket(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket: Socket) => {
    let currentRoom: string | null = null;
    let currentUser: { userId: number; username: string } | null = null;

    socket.on('join-room', (data: { roomId: string; userId: number; username: string }) => {
      const { roomId, userId, username } = data;
      currentRoom = roomId;
      currentUser = { userId, username };

      socket.join(roomId);

      // Send current room state to the new joiner
      const state = roomStates.get(roomId);
      if (state) {
        socket.emit('room-state', state);
      }

      // Notify others
      socket.to(roomId).emit('user-joined', { userId, username });

      // Send user list
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

    // Store user info for later retrieval
    socket.on('set-user-info', (data: { userId: number; username: string }) => {
      socket.data.userInfo = data;
    });

    // Video sync events (host → all)
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

    socket.on('sync-video', (data: { videoUrl: string; videoBvid: string; videoTitle: string }) => {
      if (!currentRoom) return;
      roomStates.set(currentRoom, {
        isPlaying: false,
        currentTime: 0,
        videoUrl: data.videoUrl,
        videoBvid: data.videoBvid,
        videoTitle: data.videoTitle,
      });
      // Also update in DB
      const db = getDb();
      db.run('UPDATE rooms SET video_url = ?, video_bvid = ?, video_title = ? WHERE id = ?', [
        data.videoUrl, data.videoBvid, data.videoTitle, currentRoom,
      ]);
      saveDb();
      socket.to(currentRoom).emit('sync-video', data);
    });

    socket.on('sync-request', () => {
      if (!currentRoom) return;
      const state = roomStates.get(currentRoom);
      if (state) {
        socket.emit('room-state', state);
      }
    });

    // WebRTC voice signaling (relay)
    socket.on('voice-signal', (data: { to: string; signal: any }) => {
      io.to(data.to).emit('voice-signal', {
        from: socket.id,
        signal: data.signal,
      });
    });

    // Get connected peers for WebRTC mesh
    socket.on('get-peers', () => {
      if (!currentRoom) return;
      const sockets = io.sockets.adapter.rooms.get(currentRoom);
      const peers: string[] = [];
      if (sockets) {
        sockets.forEach((sid) => {
          if (sid !== socket.id) {
            peers.push(sid);
          }
        });
      }
      socket.emit('peers-list', peers);
    });

    // Record playback history
    socket.on('record-history', () => {
      if (!currentRoom || !currentUser) return;
      const state = roomStates.get(currentRoom);
      const db = getDb();
      db.run(
        'INSERT INTO playback_history (user_id, room_id, video_url, video_title) VALUES (?, ?, ?, ?)',
        [currentUser.userId, currentRoom, state?.videoUrl || '', state?.videoTitle || '']
      );
      saveDb();
      // Give the new history entry a chance to exist before broadcasting
      setTimeout(() => {
        socket.to(currentRoom!).emit('user-joined', { userId: currentUser!.userId, username: currentUser!.username });
      }, 100);
    });

    socket.on('leave-room', () => {
      if (currentRoom && currentUser) {
        socket.to(currentRoom).emit('user-left', { userId: currentUser.userId, username: currentUser.username });
        socket.leave(currentRoom);

        // Update user list
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
