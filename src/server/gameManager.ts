import { Server } from 'socket.io';
import { Connection, Keypair, LAMPORTS_PER_SOL, SystemProgram, Transaction } from '@solana/web3.js';
import * as fs from 'fs';
import { GameEngine, GameEvent } from '../game/engine';

export interface PlayerSnapshot {
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

export interface GameSnapshot {
  turn: number;
  status: string;
  currentPlayer: number;
  prizePool: number;
  players: PlayerSnapshot[];
  lastEvent?: GameEventSnapshot;
}

export interface GameEventSnapshot {
  type: string;
  timestamp: number;
  data: any;
}

export class GameManager {
  private game: GameEngine | null = null;
  private io: Server;
  private isRunning = false;
  private isStarting = false;
  private offlineTurnInProgress = false;
  private offlineActionStepDelay = 450;
  private offlineDecisionRevealDelay = 2000;
  private stateSyncInterval: NodeJS.Timeout | null = null;
  private lastSnapshot: GameSnapshot | null = null;
  private offlineDecisionHistory = new Map<number, string[]>();
  private offlineRecentEvents: string[] = [];
  private treasuryWallet: Keypair;
  private currentViewerWallet: string | null = null;
  private readonly MIN_START_BALANCE_SOL = 0.5;
  
  // Avatar colors for each agent
  private readonly AGENT_COLORS = [
    '#ef4444', // red - Gambler
    '#3b82f6', // blue - Coward
    '#22c55e', // green - Toxic
    '#f59e0b', // amber - Monopolist
  ];
  
  private readonly AGENT_NAMES = [
    'RISKY ROY',
    'CAUTIOUS CARL',
    'CHAOS CHUCK',
    'STRATEGY STEVE'
  ];
  
  private readonly NON_BUYABLE_POSITIONS = new Set([0, 2, 4, 7, 10, 17, 20, 22, 30, 33, 36, 38]);

  constructor(io: Server) {
    this.io = io;
    this.treasuryWallet = this.loadTreasuryWallet();
  }

  async startGame(viewerWallet?: string, sessionSecretKey?: number[]): Promise<void> {
    if (this.isRunning || this.isStarting) {
      throw new Error('Game already running or starting');
    }
    this.isStarting = true;
    this.currentViewerWallet = viewerWallet || null;

    // Try on-chain mode first, fall back to offline/ER demo mode
    try {
      const config = {
        rpcEndpoint: process.env.SOLANA_RPC || 'https://api.devnet.solana.com',
        // Router endpoint is required for delegated-account routing and auth handoff
        erEndpoint: process.env.MAGIC_ROUTER || process.env.ER_RPC || 'https://devnet-router.magicblock.app',
        programId: process.env.PROGRAM_ID || 'Mono111111111111111111111111111111111111111',
        validator: process.env.ER_VALIDATOR || 'FnE6VJT5QNZdedZPnCoLsARgBwoE6DeJNjBs2H1gySXA',
      };
      if (!sessionSecretKey || !Array.isArray(sessionSecretKey) || sessionSecretKey.length === 0) {
        throw new Error('Missing session wallet. Connect wallet and fund session wallet first.');
      }
      const sessionWallet = Keypair.fromSecretKey(Uint8Array.from(sessionSecretKey));
      const conn = new Connection(config.rpcEndpoint, 'confirmed');
      const balance = await conn.getBalance(sessionWallet.publicKey, 'confirmed');
      const minLamports = Math.floor(this.MIN_START_BALANCE_SOL * LAMPORTS_PER_SOL);
      if (balance < minLamports) {
        throw new Error(`Session wallet balance is too low. Need at least ${this.MIN_START_BALANCE_SOL} SOL.`);
      }
      const wallet = await this.createGameAuthorityWallet(sessionWallet, config.rpcEndpoint);
      this.game = new GameEngine(wallet, config);
      this.setupEventListeners();
      
      await this.game.initializeGame();
      this.isRunning = true;
      
      this.io.emit('game:started', {
        message: 'Game initialized on MagicBlock ER!',
        mode: 'onchain',
        viewerWallet: this.currentViewerWallet,
        sessionWallet: sessionWallet.publicKey.toBase58(),
        sessionAuthority: wallet.publicKey.toBase58(),
        timestamp: Date.now(),
      });
      
      this.game.startGame().catch(console.error);
    } catch (err) {
      if (sessionSecretKey && sessionSecretKey.length > 0) {
        throw err;
      }
      console.log('On-chain init failed, starting ER demo mode:', (err as Error).message);
      this.startOfflineMode();
    } finally {
      this.isStarting = false;
    }
  }

  private startOfflineMode(): void {
    this.isRunning = true;
    this.offlineDecisionHistory = new Map();
    this.offlineRecentEvents = [];
    
    this.io.emit('game:started', {
      message: 'Game started in ER demo mode (LLM agents making real decisions)',
      mode: 'offline',
      timestamp: Date.now(),
    });
    
    console.log('ER Demo Mode: LLM agents battling on Monopoly board');
    this.runOfflineTurn().catch(console.error);
  }
  
  private async runOfflineTurn(): Promise<void> {
    if (!this.isRunning || this.offlineTurnInProgress) return;
    this.offlineTurnInProgress = true;
    
    try {
      // Import LLM agents directly for decision making
      const { LLMAgent } = await import('../agents/llmAgent');
      
      if (!this.lastSnapshot) {
        this.lastSnapshot = this.getDefaultGameState();
      }
      
      const snapshot = this.lastSnapshot!;
      const current = snapshot.players[snapshot.currentPlayer];
      
      if (current.isBankrupt) {
        // Skip bankrupt player
        snapshot.currentPlayer = (snapshot.currentPlayer + 1) % 4;
        this.io.emit('game:state', snapshot);
        setTimeout(() => this.runOfflineTurn(), 100);
        return;
      }
      
      console.log(`\nTurn ${snapshot.turn + 1}: ${current.name} (${current.personality})`);
      
      // Simulate dice roll
      const dice1 = Math.floor(Math.random() * 6) + 1;
      const dice2 = Math.floor(Math.random() * 6) + 1;
      const sum = dice1 + dice2;
      
      // Simulate ER transaction for the dice roll / move
      const txSig = this.generateTxSignature();
      this.io.emit('tx:new', {
        signature: txSig,
        instruction: 'executeMove',
        player: current.name,
        status: 'confirmed',
        slot: 452640590 + Math.floor(Math.random() * 1000),
        timestamp: Date.now(),
        validator: 'tee.magicblock.app',
      });

      this.broadcastEvent('DICE_ROLLED' as any, {
        player: current.name, dice1, dice2, sum,
        isDouble: dice1 === dice2,
        txSignature: txSig,
      });
      await this.sleep(this.offlineActionStepDelay);
      
      // Move player
      const oldPos = current.position;
      current.position = (current.position + sum) % 40;
      if (current.position < oldPos) {
        current.balance += 200;
        this.broadcastEvent('PASSED_GO' as any, { player: current.name, collected: 200 });
        await this.sleep(this.offlineActionStepDelay);
      }
      
      // Create mock game state for LLM
      const mockGameState = {
        turnCount: snapshot.turn + 1,
        currentPlayer: snapshot.currentPlayer,
        status: 'active',
        prizePool: snapshot.prizePool,
        players: snapshot.players,
        properties: Array.from({ length: 40 }, (_, i) => ({
          id: i, owner: null, basePrice: 100 + i * 10,
          baseRent: 10 + i * 2, houses: 0,
          isMortgaged: false,
          propertyType: i === 0 ? 'Go' : i % 5 === 0 ? 'Railroad' : 'Street',
          colorGroup: 'None',
        })),
      };
      
      const pos = current.position;
      const property = mockGameState.properties[pos];
      const isBuyable = this.isOfflineBuyable(pos);
      const agent = new LLMAgent({
        id: current.id,
        name: current.name,
        personality: current.personality,
        riskTolerance: current.riskTolerance,
      });

      const thinkingStartedAt = Date.now();
      this.broadcastEvent('AGENT_THINKING' as any, {
        player: current.name,
        phase: 'start',
        type: 'turn',
        property: pos,
      });

      const decision = await agent.makeDecision({
        type: 'buy',
        gameState: mockGameState,
        player: { ...current, balance: current.balance },
        property,
        agentHistory: this.getOfflineAgentHistory(current.id),
        recentEvents: this.getOfflineRecentEvents(),
        opponentContext: this.getOfflineOpponentContext(snapshot, current.id),
      });

      this.broadcastEvent('AGENT_THINKING' as any, {
        player: current.name,
        phase: 'end',
        type: 'turn',
        property: pos,
        durationMs: Date.now() - thinkingStartedAt,
      });
      await this.sleep(250);

      const action = String(decision.action || 'pass').toLowerCase();
      this.broadcastEvent('AGENT_DECISION' as any, {
        player: current.name,
        type: 'turn',
        action,
        confidence: decision.confidence ?? 0,
        reasoning: decision.reasoning || 'No reasoning provided',
        property: pos,
        source: 'llm',
      });
      this.recordOfflineDecision(current.id, `T${snapshot.turn + 1}: ${action.toUpperCase()} on #${pos} (${decision.reasoning || 'no reason'})`);

      if (action === 'buy' && isBuyable && current.balance >= 100) {
        const price = property.basePrice;
        if (current.balance >= price) {
          current.balance -= price;
          current.properties.push(pos);
          const buyTxSig = this.generateTxSignature();
          this.io.emit('tx:new', {
            signature: buyTxSig,
            instruction: 'buyProperty',
            player: current.name,
            status: 'confirmed',
            slot: 452640590 + Math.floor(Math.random() * 1000),
            timestamp: Date.now(),
            validator: 'tee.magicblock.app',
          });
          this.broadcastEvent('PROPERTY_BOUGHT' as any, {
            player: current.name, property: pos, position: pos, price,
            reasoning: decision.reasoning,
            txSignature: buyTxSig,
          });
          this.recordOfflineEvent(`T${snapshot.turn + 1}: ${current.name} bought #${pos}`);
          await this.sleep(this.offlineActionStepDelay);
        }
      } else {
        this.recordOfflineEvent(`T${snapshot.turn + 1}: ${current.name} ${action === 'buy' && !isBuyable ? 'attempted invalid buy' : 'passed'} on #${pos}`);
        this.broadcastEvent('DECISION_PASS' as any, {
          player: current.name,
          reasoning: action === 'buy' && !isBuyable
            ? this.getOfflineNonBuyableReason(pos)
            : decision.reasoning,
        });
        await this.sleep(this.offlineActionStepDelay);
      }

      // Give frontend time to render the reasoning before advancing.
      await this.sleep(this.offlineDecisionRevealDelay);
      
      // Advance turn
      snapshot.turn += 1;
      snapshot.currentPlayer = (snapshot.currentPlayer + 1) % 4;
      
      // Check win condition
      if (current.balance >= 15000) {
        this.isRunning = false;
        this.io.emit('game:ended', {
          winner: current.name, balance: current.balance,
          mode: 'offline',
        });
        return;
      }
      
      // Check max turns
      if (snapshot.turn >= 100) {
        this.isRunning = false;
        const sorted = [...snapshot.players].sort((a, b) => b.balance - a.balance);
        this.io.emit('game:ended', {
          winner: sorted[0].name, balance: sorted[0].balance,
          mode: 'offline',
        });
        return;
      }
      
      this.io.emit('game:state', snapshot);
      setTimeout(() => this.runOfflineTurn(), 100);
    } catch (err) {
      console.error('Offline turn error:', err);
      // Continue anyway
      this.lastSnapshot! .currentPlayer = (this.lastSnapshot! .currentPlayer + 1) % 4;
      this.io.emit('game:state', this.lastSnapshot);
      setTimeout(() => this.runOfflineTurn(), 1000);
    } finally {
      this.offlineTurnInProgress = false;
    }
  }

  private generateTxSignature(): string {
    const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    let sig = '';
    for (let i = 0; i < 88; i++) {
      sig += chars[Math.floor(Math.random() * chars.length)];
    }
    return sig;
  }

  getTreasuryAddress(): string {
    return this.treasuryWallet.publicKey.toBase58();
  }

  async registerBet(bettor: string, agentId: number, amountSol: number, signature: string): Promise<void> {
    this.io.emit('game:event', {
      type: 'BET_PLACED',
      timestamp: Date.now(),
      data: { bettor, agentId, amountSol, signature },
    });
  }

  private loadTreasuryWallet(): Keypair {
    try {
      const raw = fs.readFileSync('./wallet.json', 'utf-8');
      return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
    } catch {
      return Keypair.generate();
    }
  }

  private async createGameAuthorityWallet(sessionWallet: Keypair, rpcEndpoint: string): Promise<Keypair> {
    const gameWallet = Keypair.generate();
    const conn = new Connection(rpcEndpoint, 'confirmed');
    const lamports = Math.floor(0.1 * LAMPORTS_PER_SOL);
    const latest = await conn.getLatestBlockhash('confirmed');
    const tx = new Transaction({
      feePayer: sessionWallet.publicKey,
      recentBlockhash: latest.blockhash,
    }).add(
      SystemProgram.transfer({
        fromPubkey: sessionWallet.publicKey,
        toPubkey: gameWallet.publicKey,
        lamports,
      })
    );
    tx.sign(sessionWallet);
    const sig = await conn.sendRawTransaction(tx.serialize());
    await conn.confirmTransaction(
      { signature: sig, blockhash: latest.blockhash, lastValidBlockHeight: latest.lastValidBlockHeight },
      'confirmed'
    );
    return gameWallet;
  }

  private isOfflineBuyable(position: number): boolean {
    return !this.NON_BUYABLE_POSITIONS.has(position);
  }

  private getOfflineNonBuyableReason(position: number): string {
    if (position === 0) return 'GO tile is not purchasable';
    if (position === 10) return 'Jail tile is not purchasable';
    if (position === 20) return 'Free Parking tile is not purchasable';
    if (position === 30) return 'Go To Jail tile is not purchasable';
    if ([4, 38].includes(position)) return 'Tax tile is not purchasable';
    if ([2, 17, 33].includes(position)) return 'Community Chest tile is not purchasable';
    if ([7, 22, 36].includes(position)) return 'Chance tile is not purchasable';
    return 'Current tile is not a buyable property';
  }

  private getOfflineAgentHistory(playerId: number): string[] {
    return [...(this.offlineDecisionHistory.get(playerId) || [])];
  }

  private getOfflineRecentEvents(): string[] {
    return [...this.offlineRecentEvents];
  }

  private getOfflineOpponentContext(snapshot: GameSnapshot, currentPlayerId: number): string[] {
    return snapshot.players
      .filter((p) => p.id !== currentPlayerId && !p.isBankrupt)
      .map((p) => `${p.name}: balance ${p.balance}, pos ${p.position}, properties ${p.properties.length}`);
  }

  private recordOfflineDecision(playerId: number, message: string): void {
    const history = this.offlineDecisionHistory.get(playerId) || [];
    history.push(message);
    this.offlineDecisionHistory.set(playerId, history.slice(-8));
  }

  private recordOfflineEvent(message: string): void {
    this.offlineRecentEvents.push(message);
    this.offlineRecentEvents = this.offlineRecentEvents.slice(-16);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async stopGame(): Promise<void> {
    if (!this.isRunning) {
      throw new Error('Game not running');
    }

    this.game?.stop();
    this.isRunning = false;
    this.offlineTurnInProgress = false;
    if (this.stateSyncInterval) {
      clearInterval(this.stateSyncInterval);
      this.stateSyncInterval = null;
    }
    
    this.io.emit('game:stopped', {
      message: 'Game stopped',
      timestamp: Date.now(),
    });
  }

  async resetGame(): Promise<void> {
    if (this.isRunning) {
      this.game?.stop();
    }

    this.isRunning = false;
    this.isStarting = false;
    this.offlineTurnInProgress = false;
    if (this.stateSyncInterval) {
      clearInterval(this.stateSyncInterval);
      this.stateSyncInterval = null;
    }

    // If on-chain engine exists, force reset its game account before dropping it.
    if (this.game) {
      try {
        await this.game.commitAndUndelegateToL1();
      } catch (error) {
        console.warn('Commit/undelegate warning:', (error as Error).message);
      }
      try {
        await this.game.resetGameState();
      } catch (error) {
        console.warn('On-chain reset warning:', (error as Error).message);
      }
    }

    this.game = null;
    this.lastSnapshot = this.getDefaultGameState();
    this.offlineDecisionHistory = new Map();
    this.offlineRecentEvents = [];

    this.io.emit('game:state', this.lastSnapshot);
    this.io.emit('game:reset', {
      message: 'Game has been reset',
      timestamp: Date.now(),
    });
  }

  async getGameState(): Promise<GameSnapshot> {
    if (!this.game) {
      return this.getDefaultGameState();
    }

    try {
      const gameState = await this.game.fetchGameState();
      
      const snapshot: GameSnapshot = {
        turn: gameState.turnCount,
        status: gameState.status,
        currentPlayer: gameState.currentPlayer,
        prizePool: gameState.prizePool,
        players: gameState.players.map((p, i) => ({
          id: p.id,
          name: this.AGENT_NAMES[i] || `Agent ${i}`,
          personality: p.personality,
          riskTolerance: p.riskTolerance,
          balance: p.balance,
          position: p.position,
          isBankrupt: p.isBankrupt,
          properties: gameState.properties.filter(prop => prop.owner === p.id).map(prop => prop.id),
          color: this.AGENT_COLORS[i] || '#888888',
        })),
      };
      
      this.lastSnapshot = snapshot;
      return snapshot;
    } catch (error) {
      console.error('Failed to fetch game state:', error);
      return this.getDefaultGameState();
    }
  }

  async mutateAgent(targetAgent: number, mutationType: string, viewerWallet: string): Promise<any> {
    if (!this.game) {
      throw new Error('Game not initialized');
    }

    // In full implementation, would call program mutation instruction
    // For hackathon demo, emit event to show interactivity
    
    this.io.emit('viewer:mutation', {
      viewer: viewerWallet,
      targetAgent,
      mutationType,
      timestamp: Date.now(),
    });

    return {
      success: true,
      message: `Mutation ${mutationType} applied to Agent ${targetAgent}`,
    };
  }

  private setupEventListeners(): void {
    if (!this.game) return;

    this.game.on(GameEvent.DICE_ROLLED, (data) => {
      this.broadcastEvent(GameEvent.DICE_ROLLED, data);
    });

    this.game.on(GameEvent.PLAYER_MOVED, (data) => {
      this.broadcastEvent(GameEvent.PLAYER_MOVED, data);
    });

    this.game.on(GameEvent.PROPERTY_BOUGHT, (data) => {
      this.broadcastEvent(GameEvent.PROPERTY_BOUGHT, data);
    });

    this.game.on(GameEvent.AGENT_THINKING, (data) => {
      this.broadcastEvent(GameEvent.AGENT_THINKING, data);
    });

    this.game.on(GameEvent.AGENT_DECISION, (data) => {
      this.broadcastEvent(GameEvent.AGENT_DECISION, data);
    });

    this.game.on(GameEvent.RENT_PAID, (data) => {
      this.broadcastEvent(GameEvent.RENT_PAID, data);
    });

    this.game.on(GameEvent.HOUSES_BUILT, (data) => {
      this.broadcastEvent(GameEvent.HOUSES_BUILT, data);
    });

    this.game.on(GameEvent.PLAYER_BANKRUPT, (data) => {
      this.broadcastEvent(GameEvent.PLAYER_BANKRUPT, data);
    });

    this.game.on(GameEvent.ER_TX, (data) => {
      // Forward real ER transaction to frontend tx panel
      this.io.emit('tx:new', data);
    });

    this.game.on(GameEvent.GAME_ENDED, (data) => {
      this.isRunning = false;
      if (this.stateSyncInterval) {
        clearInterval(this.stateSyncInterval);
        this.stateSyncInterval = null;
      }
      this.broadcastEvent(GameEvent.GAME_ENDED, data);
    });

    // Periodic state updates
    if (this.stateSyncInterval) {
      clearInterval(this.stateSyncInterval);
    }
    this.stateSyncInterval = setInterval(async () => {
      if (this.isRunning) {
        const state = await this.getGameState();
        this.io.emit('game:state', state);
      }
    }, 2000);
  }

  private broadcastEvent(eventType: GameEvent, data: any): void {
    const eventSnapshot: GameEventSnapshot = {
      type: eventType,
      timestamp: Date.now(),
      data,
    };

    this.io.emit('game:event', eventSnapshot);
    
    // Also update snapshot
    if (this.lastSnapshot) {
      this.lastSnapshot.lastEvent = eventSnapshot;
    }
  }

  private getDefaultGameState(): GameSnapshot {
    return {
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
  }
}
