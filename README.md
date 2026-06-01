# Cloud Sitting (云同坐)

A real-time co-watching app for Bilibili videos. Create private rooms with a 6-digit code, synchronize video playback across viewers, and talk via WebRTC voice chat. No downloads needed.

## Features

- **Room-based co-watching** — join with a 6-digit room code
- **Video sync** — play, pause, and seek syncs across all viewers
- **WebRTC voice chat** — talk with others in the room in real time
- **Bilibili integration** — paste a Bilibili video URL to start watching
- **User accounts** — register, login, and view watch history
- **Playlist queue** — queue up multiple videos
- **Docker support** — easy deployment with Docker

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React, TypeScript, Vite |
| Backend | Express, TypeScript |
| Real-time | Socket.io, WebRTC (peer) |
| Database | PostgreSQL |
| Auth | bcryptjs + JWT |
| Video | DPlayer, dash.js |

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL

### Install

```bash
npm install
```

### Development

```bash
npm run dev
```

### Docker

```bash
docker build -t cloud-sitting .
docker run -p 3000:3000 cloud-sitting
```

## Project Structure

```
cloud-sitting/
├── client/          # React frontend (Vite)
│   └── src/
│       ├── components/   # UI components
│       ├── pages/        # Route pages
│       ├── hooks/        # Custom hooks (auth, socket, player)
│       └── utils/        # API client
├── server/          # Express backend
│   └── src/
│       ├── routes/       # REST API routes
│       ├── socket/       # WebSocket handlers
│       ├── middleware/   # Auth middleware
│       └── db/           # Database layer
├── Dockerfile
└── package.json
```
