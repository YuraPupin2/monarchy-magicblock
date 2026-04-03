import * as dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { GameManager } from './gameManager';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// Game manager instance
const gameManager = new GameManager(io);

// REST API Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.get('/api/game/state', async (req, res) => {
  try {
    const state = await gameManager.getGameState();
    res.json(state);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.post('/api/game/start', async (req, res) => {
  try {
    await gameManager.startGame(req.body?.wallet, req.body?.sessionSecretKey);
    res.json({ status: 'started' });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.post('/api/game/stop', async (req, res) => {
  try {
    await gameManager.stopGame();
    res.json({ status: 'stopped' });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.post('/api/game/reset', async (req, res) => {
  try {
    await gameManager.resetGame();
    res.json({ status: 'reset' });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.post('/api/viewer/mutate', async (req, res) => {
  try {
    const { targetAgent, mutationType, viewerWallet } = req.body;
    const result = await gameManager.mutateAgent(targetAgent, mutationType, viewerWallet);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.get('/api/treasury', (req, res) => {
  res.json({ address: gameManager.getTreasuryAddress() });
});

app.post('/api/bets/place', async (req, res) => {
  try {
    const { bettor, agentId, amountSol, signature } = req.body;
    await gameManager.registerBet(bettor, Number(agentId), Number(amountSol), signature);
    res.json({ status: 'ok' });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// WebSocket Events
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);
  
  // Send current game state to new client
  gameManager.getGameState().then(state => {
    socket.emit('game:state', state);
  });
  
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
  
  socket.on('game:start', async (payload?: { wallet?: string; sessionSecretKey?: number[] }) => {
    try {
      await gameManager.startGame(payload?.wallet, payload?.sessionSecretKey);
    } catch (error) {
      socket.emit('game:error', { message: (error as Error).message });
    }
  });
  
  socket.on('game:stop', async () => {
    try {
      await gameManager.stopGame();
    } catch (error) {
      socket.emit('game:error', { message: (error as Error).message });
    }
  });

  socket.on('game:reset', async () => {
    try {
      await gameManager.resetGame();
    } catch (error) {
      socket.emit('game:error', { message: (error as Error).message });
    }
  });
});

// Start server
const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║           MONARCHY AI - Game Server                      ║
║                                                          ║
║  HTTP API:  http://localhost:${PORT}                     ║
║  WebSocket: ws://localhost:${PORT}                       ║
║                                                          ║
║  Endpoints:                                              ║
║  GET  /api/health      - Health check                    ║
║  GET  /api/game/state  - Current game state              ║
║  POST /api/game/start  - Start game                      ║
║  POST /api/game/stop   - Stop game                       ║
║  POST /api/viewer/mutate - Mutate agent traits          ║
╚══════════════════════════════════════════════════════════╝
  `);
});

export { io };
