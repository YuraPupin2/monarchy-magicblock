import { useState, useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

export interface Player {
  id: number;
  name: string;
  personality: string;
  riskTolerance: number;
  balance: number;
  position: number;
  isBankrupt: boolean;
  properties: number[];
  color: string;
}

export interface GameState {
  turn: number;
  status: string;
  currentPlayer: number;
  prizePool: number;
  players: Player[];
}

export interface TxEntry {
  signature: string;
  instruction: string;
  player: string;
  status: 'pending' | 'confirmed';
  slot: number;
  timestamp: number;
  validator: string;
}

export interface GameEvent {
  type: string;
  timestamp: number;
  data: any;
}

const DEFAULT_STATE: GameState = {
  turn: 0,
  status: 'waiting',
  currentPlayer: 0,
  prizePool: 0,
  players: [
    { id: 0, name: 'RISKY ROY', personality: 'Gambler', riskTolerance: 90, balance: 1500, position: 0, isBankrupt: false, properties: [], color: '#ef4444' },
    { id: 1, name: 'CAUTIOUS CARL', personality: 'Coward', riskTolerance: 20, balance: 1500, position: 0, isBankrupt: false, properties: [], color: '#3b82f6' },
    { id: 2, name: 'CHAOS CHUCK', personality: 'Toxic', riskTolerance: 50, balance: 1500, position: 0, isBankrupt: false, properties: [], color: '#22c55e' },
    { id: 3, name: 'STRATEGY STEVE', personality: 'Monopolist', riskTolerance: 60, balance: 1500, position: 0, isBankrupt: false, properties: [], color: '#f59e0b' },
  ],
};

export function useGame() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [gameState, setGameState] = useState<GameState>(DEFAULT_STATE);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [transactions, setTransactions] = useState<TxEntry[]>([]);
  const eventsRef = useRef<GameEvent[]>([]);
  const getServerUrl = () => {
    const host = window.location.hostname || 'localhost';
    return `http://${host}:3001`;
  };

  useEffect(() => {
    const serverUrl = getServerUrl();

    const socketInstance = io(serverUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
    });

    socketInstance.on('connect', () => {
      console.log('Connected to game server');
      setIsConnected(true);
    });

    socketInstance.on('disconnect', () => {
      console.log('Disconnected from game server');
      setIsConnected(false);
    });

    socketInstance.on('connect_error', (error) => {
      console.error('Socket connection error:', error.message);
      setIsConnected(false);
    });

    socketInstance.on('game:state', (state: GameState) => {
      setGameState(state);
    });

    socketInstance.on('game:started', (data) => {
      addEvent({
        type: 'GAME_STARTED',
        timestamp: Date.now(),
        data,
      });
    });

    socketInstance.on('game:stopped', (data) => {
      addEvent({
        type: 'GAME_STOPPED',
        timestamp: Date.now(),
        data,
      });
    });

    socketInstance.on('game:reset', (data) => {
      setGameState(DEFAULT_STATE);
      setTransactions([]);
      eventsRef.current = [];
      setEvents([]);
      addEvent({
        type: 'GAME_RESET',
        timestamp: Date.now(),
        data,
      });
    });

    socketInstance.on('game:event', (event: GameEvent) => {
      addEvent(event);
    });

    socketInstance.on('tx:new', (tx: TxEntry) => {
      setTransactions(prev => [...prev.slice(-49), tx]);
    });

    socketInstance.on('viewer:mutation', (data) => {
      addEvent({
        type: 'MUTATION',
        timestamp: Date.now(),
        data,
      });
    });

    socketInstance.on('game:error', (data) => {
      addEvent({
        type: 'GAME_ERROR',
        timestamp: Date.now(),
        data,
      });
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, []);

  const addEvent = useCallback((event: GameEvent) => {
    eventsRef.current = [event, ...eventsRef.current].slice(0, 50);
    setEvents([...eventsRef.current]);
  }, []);

  const startGame = useCallback((wallet?: string, sessionSecretKey?: number[]) => {
    socket?.emit('game:start', { wallet, sessionSecretKey });
  }, [socket]);

  const stopGame = useCallback(() => {
    socket?.emit('game:stop');
  }, [socket]);

  const resetGame = useCallback(async () => {
    // Optimistic local reset so UI updates even if socket ack is delayed.
    setGameState(DEFAULT_STATE);
    setTransactions([]);
    eventsRef.current = [];
    setEvents([]);

    try {
      await fetch(`${getServerUrl()}/api/game/reset`, { method: 'POST' });
    } catch (error) {
      console.error('HTTP reset failed:', error);
    }

    socket?.emit('game:reset');
  }, [socket]);

  const mutateAgent = useCallback((targetAgent: number, mutationType: string, viewerWallet: string) => {
    return fetch(`${getServerUrl()}/api/viewer/mutate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetAgent, mutationType, viewerWallet }),
    });
  }, []);

  return {
    gameState,
    events,
    transactions,
    isConnected,
    startGame,
    stopGame,
    resetGame,
    mutateAgent,
  };
}
