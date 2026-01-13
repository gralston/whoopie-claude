import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { setupSocketHandlers } from './socket-handlers.js';
import { GameManager } from './game/game-manager.js';

const PORT = process.env.PORT || 3005;

// CORS configuration - comma-separated list in production, defaults to localhost for dev
const CORS_ORIGINS = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(s => s.trim())
  : ['http://localhost:3006', 'http://localhost:5173'];

console.log('CORS_ORIGINS:', CORS_ORIGINS);

const app = express();
app.use(cors({
  origin: CORS_ORIGINS,
  methods: ['GET', 'POST'],
  credentials: true,
}));
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: CORS_ORIGINS,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Initialize game manager
const gameManager = new GameManager();

// REST endpoints
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', games: gameManager.getGameCount() });
});

app.get('/api/games', (_req, res) => {
  res.json(gameManager.getPublicGames());
});

// Setup Socket.io handlers
setupSocketHandlers(io, gameManager);

httpServer.listen(PORT, () => {
  console.log(`🃏 Whoopie server running on port ${PORT}`);
});
