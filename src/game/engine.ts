import { Connection, PublicKey, Keypair, SystemProgram, Transaction } from '@solana/web3.js';
import { Program, AnchorProvider, Wallet } from '@coral-xyz/anchor';
import { ConnectionMagicRouter, MAGIC_CONTEXT_ID, MAGIC_PROGRAM_ID, GetCommitmentSignature } from '@magicblock-labs/ephemeral-rollups-sdk';
import IDL from '../../shared/monopoly.json';
import { LLMAgent, AgentConfig, DecisionContext } from '../agents/llmAgent';
import { EventEmitter } from 'events';

export interface GameConfig {
  rpcEndpoint: string;
  erEndpoint: string;
  programId: string;
  validator: string;
}

export interface GameState {
  turnCount: number;
  currentPlayer: number;
  status: 'active' | 'ended' | 'won';
  prizePool: number;
  players: Player[];
  properties: Property[];
}

export interface Player {
  id: number;
  position: number;
  balance: number;
  personality: string;
  riskTolerance: number;
  isBankrupt: boolean;
  jailedTurns: number;
}

export interface Property {
  id: number;
  owner: number; // 255 = no owner
  basePrice: number;
  baseRent: number;
  houses: number;
  isMortgaged: boolean;
  propertyType: string;
  colorGroup: string;
}

export interface DiceRoll {
  dice1: number;
  dice2: number;
  sum: number;
  isDouble: boolean;
}

export enum GameEvent {
  GAME_STARTED  = 'GAME_STARTED',
  DICE_ROLLED   = 'DICE_ROLLED',
  PLAYER_MOVED  = 'PLAYER_MOVED',
  PROPERTY_BOUGHT = 'PROPERTY_BOUGHT',
  AGENT_THINKING = 'AGENT_THINKING',
  AGENT_DECISION = 'AGENT_DECISION',
  RENT_PAID     = 'RENT_PAID',
  HOUSES_BUILT  = 'HOUSES_BUILT',
  PLAYER_BANKRUPT = 'PLAYER_BANKRUPT',
  GAME_ENDED    = 'GAME_ENDED',
  TURN_ENDED    = 'TURN_ENDED',
  ER_TX         = 'ER_TX',
}

const DELEGATION_PROGRAM_ID = new PublicKey('DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh');

export class GameEngine extends EventEmitter {
  private baseConnection: Connection;   // Solana devnet
  private erConnection: Connection;     // MagicBlock ER
  private baseProgram: any;             // Program on base layer
  private erProgram: any;               // Program on ER
  private gameStatePDA: PublicKey;
  private agents: Map<number, LLMAgent>;
  private decisionHistory: Map<number, string[]>;
  private recentTableEvents: string[] = [];
  private isRunning = false;
  private isExecutingTurn = false;
  private isDelegated = false;
  private turnDelay = 0;
  private actionStepDelay = 450;
  private decisionRevealDelay = 2000;

  private readonly AGENT_CONFIGS: AgentConfig[] = [
    { id: 0, name: 'Agent_1', personality: 'Gambler',    riskTolerance: 90 },
    { id: 1, name: 'Agent_2', personality: 'Coward',     riskTolerance: 20 },
    { id: 2, name: 'Agent_3', personality: 'Toxic',      riskTolerance: 50 },
    { id: 3, name: 'Agent_4', personality: 'Monopolist', riskTolerance: 60 },
  ];

  constructor(private wallet: Keypair, private config: GameConfig) {
    super();

    // Two connections: base layer and ER
    this.baseConnection = new Connection(config.rpcEndpoint, 'confirmed');
    this.erConnection   = new ConnectionMagicRouter(config.erEndpoint, 'confirmed');

    const programId = new PublicKey(config.programId);

    // Provider on base layer for init + delegation
    const baseProvider = new AnchorProvider(
      this.baseConnection,
      new Wallet(wallet),
      { commitment: 'confirmed' }
    );

    // Provider on ER for game instructions
    const erProvider = new AnchorProvider(
      this.erConnection,
      new Wallet(wallet),
      { commitment: 'confirmed', skipPreflight: true }
    );

    this.baseProgram = new Program(IDL as any, baseProvider);
    this.erProgram   = new Program(IDL as any, erProvider);

    // Game PDA (required for on-chain delegate_account CPI flow)
    this.gameStatePDA = PublicKey.findProgramAddressSync(
      [Buffer.from('game_state'), wallet.publicKey.toBytes()],
      programId
    )[0];

    // Init agents
    this.agents = new Map();
    this.decisionHistory = new Map();
    for (const cfg of this.AGENT_CONFIGS) {
      this.agents.set(cfg.id, new LLMAgent(cfg));
      this.decisionHistory.set(cfg.id, []);
    }

    console.log('GameEngine ready');
    console.log('  Base RPC:', config.rpcEndpoint);
    console.log('  ER   RPC:', config.erEndpoint);
    console.log('  Program: ', config.programId);
    console.log('  GameState: ', this.gameStatePDA.toBase58());
  }

  async initializeGame(): Promise<void> {
    console.log('[ER] Initializing game on Solana base layer...');

    const existing = await this.baseConnection.getAccountInfo(this.gameStatePDA);
    if (!existing) {
      const initTx = await (this.baseProgram.methods as any)
        .initializeGame()
        .accountsStrict({
          gameState:     this.gameStatePDA,
          authority:     this.wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([this.wallet])
        .rpc();
      console.log('[ER] Game initialized, base tx:', initTx);
    } else {
      console.log('[ER] Existing game account found, reusing:', this.gameStatePDA.toBase58());
    }

    // 2. Delegate to MagicBlock ER
    await this.delegateToER();

    // 3. If previous session already ended, reset game state before starting loop.
    try {
      const state = await this.fetchGameState();
      if (state.status !== 'active' || state.turnCount >= 100) {
        const program = this.isDelegated ? this.erProgram : this.baseProgram;
        const resetTx = await (program.methods as any)
          .resetGame()
          .accountsStrict({
            gameState: this.gameStatePDA,
            authority: this.wallet.publicKey,
          })
          .signers([this.wallet])
          .rpc();
        console.log('[ER] Game reset tx:', resetTx);
      }
    } catch (e) {
      console.warn('[ER] Reset check warning:', (e as Error).message.slice(0, 140));
    }

    this.emit(GameEvent.GAME_STARTED, {
      gameStatePDA: this.gameStatePDA.toBase58(),
      erEndpoint:   this.config.erEndpoint,
      mode:         this.isDelegated ? 'onchain' : 'base-layer',
    });
  }

  private async delegateToER(): Promise<void> {
    console.log('[ER] Delegating game state to tee.magicblock.app via on-chain CPI...');

    try {
      const sdk = await import('@magicblock-labs/ephemeral-rollups-sdk');
      const programId = new PublicKey(this.config.programId);
      const validator = new PublicKey(this.config.validator);

      const buffer = sdk.delegateBufferPdaFromDelegatedAccountAndOwnerProgram(this.gameStatePDA, programId);
      const delegationRecord = sdk.delegationRecordPdaFromDelegatedAccount(this.gameStatePDA);
      const delegationMetadata = sdk.delegationMetadataPdaFromDelegatedAccount(this.gameStatePDA);

      const sig = await (this.baseProgram.methods as any)
        .delegateGame(validator)
        .accountsStrict({
          payer: this.wallet.publicKey,
          gameState: this.gameStatePDA,
          ownerProgram: programId,
          buffer,
          delegationRecord,
          delegationMetadata,
          delegationProgram: DELEGATION_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([this.wallet])
        .rpc();

      this.isDelegated = true;
      console.log('[ER] Delegated via on-chain CPI! tx:', sig);
      console.log('[ER] Game state is now live on tee.magicblock.app');
    } catch (err) {
      const msg = (err as Error).message || '';
      if (msg.includes('AccountOwnedByWrongProgram')) {
        // Already delegated in a previous session; continue on ER path.
        console.warn('[ER] Account already delegated, continuing on ER');
        this.isDelegated = true;
      } else {
        console.warn('[ER] Delegation failed, staying on base layer:', msg.slice(0, 220));
        this.isDelegated = false;
      }
    }
  }

  async startGame(): Promise<void> {
    this.isRunning = true;
    while (this.isRunning) {
      try {
        await this.executeTurn();
        const state = await this.fetchGameState();
        if (state.status !== 'active') {
          await this.finalizeGame();
          break;
        }
        await this.sleep(this.turnDelay);
      } catch (err) {
        console.error('Turn error:', (err as Error).message);

        // If game is already ended, still run finalize lifecycle.
        try {
          const state = await this.fetchGameState();
          if (state.status !== 'active') {
            await this.finalizeGame();
            break;
          }
        } catch (_) {
          // ignore secondary fetch errors here
        }

        await this.sleep(3000);
      }
    }
  }

  async resetGameState(): Promise<void> {
    // Force reset the on-chain game account so next start always begins from turn 0.
    const tryReset = async (program: any): Promise<string> => {
      return await (program.methods as any)
        .resetGame()
        .accountsStrict({
          gameState: this.gameStatePDA,
          authority: this.wallet.publicKey,
        })
        .signers([this.wallet])
        .rpc();
    };

    let lastError: unknown = null;

    // Prefer ER path when delegated; fallback to base.
    if (this.isDelegated) {
      try {
        const sig = await tryReset(this.erProgram);
        this.decisionHistory.clear();
        this.recentTableEvents = [];
        for (const cfg of this.AGENT_CONFIGS) {
          this.decisionHistory.set(cfg.id, []);
        }
        console.log('[ER] Forced reset tx:', sig);
        return;
      } catch (err) {
        lastError = err;
      }
    }

    try {
      const sig = await tryReset(this.baseProgram);
      this.decisionHistory.clear();
      this.recentTableEvents = [];
      for (const cfg of this.AGENT_CONFIGS) {
        this.decisionHistory.set(cfg.id, []);
      }
      console.log('[BASE] Forced reset tx:', sig);
      return;
    } catch (err) {
      lastError = err;
    }

    throw new Error(`Failed to reset on-chain state: ${(lastError as Error)?.message || 'unknown error'}`);
  }

  async executeTurn(): Promise<void> {
    if (this.isExecutingTurn) {
      return;
    }
    this.isExecutingTurn = true;
    try {
    const gameState = await this.fetchGameState();
    const pidx = gameState.currentPlayer;
    const player = gameState.players[pidx];

    if (player.isBankrupt) {
      return;
    }

    const agent = this.agents.get(player.id);
    if (!agent) throw new Error('Agent not found: ' + player.id);

    console.log(`\n=== Turn ${gameState.turnCount} | ${player.personality} (${player.id}) ===`);

    // Roll dice
    const dice = this.rollDice();
    console.log(`Dice: ${dice.dice1}+${dice.dice2}=${dice.sum}`);
    this.emit(GameEvent.DICE_ROLLED, { player: player.id, ...dice });
    await this.sleep(this.actionStepDelay);

    const moveTx = await this.executeMove(dice);
    console.log(`[${this.isDelegated ? 'ER' : 'BASE'}] execute_move tx:`, moveTx);

    let slot = 0;
    try {
      slot = await (this.isDelegated ? this.baseConnection : this.baseConnection).getSlot();
    } catch {
      slot = 0;
    }

    this.emit(GameEvent.ER_TX, {
      signature:   moveTx,
      instruction: 'executeMove',
      player:      player.id,
      status:      'confirmed',
      slot,
      timestamp:   Date.now(),
      validator:   this.isDelegated ? this.config.validator : 'api.devnet.solana.com',
    });
    await this.sleep(this.actionStepDelay);

    // Fetch updated state from ER
    const newState = await this.fetchGameState();
    const newPlayer = newState.players[player.id];
    const prop = newState.properties[newPlayer.position];

    const thinkingStartedAt = Date.now();
    this.emit(GameEvent.AGENT_THINKING, {
      player: player.id,
      phase: 'start',
      type: 'turn',
      property: newPlayer.position,
    });

    const decision = await agent.makeDecision({
      type: 'buy',
      gameState: newState,
      player: newPlayer,
      property: prop,
      agentHistory: this.getAgentHistory(player.id),
      recentEvents: this.getRecentTableEvents(),
      opponentContext: this.getOpponentContext(newState, player.id),
    });

    this.emit(GameEvent.AGENT_THINKING, {
      player: player.id,
      phase: 'end',
      type: 'turn',
      property: newPlayer.position,
      durationMs: Date.now() - thinkingStartedAt,
    });
    await this.sleep(250);

    const action = String(decision.action || 'pass').toLowerCase();
    this.emit(GameEvent.AGENT_DECISION, {
      player: player.id,
      type: 'turn',
      action,
      confidence: decision.confidence ?? 0,
      reasoning: decision.reasoning || 'No reasoning provided',
      source: 'llm',
      property: newPlayer.position,
    });
    this.recordAgentDecision(player.id, `T${gameState.turnCount}: ${action.toUpperCase()} on #${newPlayer.position} (${decision.reasoning || 'no reason'})`);

    if (prop.owner === 255 && this.canBuy(prop) && action === 'buy') {
      const buyTx = await this.buyProperty();
      console.log('[ER] buy_property tx:', buyTx);
      this.emit(GameEvent.PROPERTY_BOUGHT, {
        player: player.id,
        property: newPlayer.position,
        price: prop.basePrice,
        reasoning: decision.reasoning,
        confidence: decision.confidence,
        txSignature: buyTx,
      });
      this.recordTableEvent(`T${gameState.turnCount}: P${player.id} bought #${newPlayer.position}`);
      this.emit(GameEvent.ER_TX, {
        signature:   buyTx,
        instruction: 'buyProperty',
        player:      player.id,
        status:      'confirmed',
        slot:        await this.baseConnection.getSlot(),
        timestamp:   Date.now(),
        validator:   this.config.validator,
      });
      await this.sleep(this.actionStepDelay);
    } else if (prop.owner !== 255 && prop.owner !== player.id) {
      const rentTx = await this.payRent();
      this.emit(GameEvent.RENT_PAID, { from: player.id, to: prop.owner });
      this.recordTableEvent(`T${gameState.turnCount}: P${player.id} paid rent to P${prop.owner} on #${newPlayer.position}`);
      this.emit(GameEvent.ER_TX, {
        signature:   rentTx,
        instruction: 'payRent',
        player:      player.id,
        status:      'confirmed',
        slot:        await this.baseConnection.getSlot(),
        timestamp:   Date.now(),
        validator:   this.config.validator,
      });
      await this.sleep(this.actionStepDelay);
    } else if (action === 'buy' && (!this.canBuy(prop) || prop.owner !== 255)) {
      // LLM requested buy on non-buyable tile or owned tile.
      this.emit(GameEvent.AGENT_DECISION, {
        player: player.id,
        type: 'turn',
        action: 'pass',
        confidence: 1,
        reasoning: prop.owner !== 255 ? 'Cannot buy: property already owned' : this.whyNotBuyable(prop),
        source: 'rule',
        property: newPlayer.position,
      });
      this.recordTableEvent(`T${gameState.turnCount}: P${player.id} attempted invalid BUY on #${newPlayer.position}`);
      await this.sleep(this.actionStepDelay);
    } else {
      this.recordTableEvent(`T${gameState.turnCount}: P${player.id} passed on #${newPlayer.position}`);
      await this.sleep(this.actionStepDelay);
    }

    // Give UI time to show the LLM reasoning before turn closes.
    await this.sleep(this.decisionRevealDelay);

    this.emit(GameEvent.TURN_ENDED, { turn: gameState.turnCount, player: player.id });
    } finally {
      this.isExecutingTurn = false;
    }
  }

  private rollDice(): DiceRoll {
    const dice1 = Math.floor(Math.random() * 6) + 1;
    const dice2 = Math.floor(Math.random() * 6) + 1;
    return { dice1, dice2, sum: dice1 + dice2, isDouble: dice1 === dice2 };
  }

  private async executeMove(dice: DiceRoll): Promise<string> {
    const program = this.isDelegated ? this.erProgram : this.baseProgram;
    return await (program.methods as any)
      .executeMove(dice.dice1, dice.dice2)
      .accountsStrict({
        gameState: this.gameStatePDA,
        authority: this.wallet.publicKey,
      })
      .signers([this.wallet])
      .rpc();
  }

  private async buyProperty(): Promise<string> {
    const program = this.isDelegated ? this.erProgram : this.baseProgram;
    return await (program.methods as any)
      .buyProperty()
      .accountsStrict({
        gameState: this.gameStatePDA,
        authority: this.wallet.publicKey,
      })
      .signers([this.wallet])
      .rpc();
  }

  private async payRent(): Promise<string> {
    const program = this.isDelegated ? this.erProgram : this.baseProgram;
    return await (program.methods as any)
      .payRent()
      .accountsStrict({
        gameState: this.gameStatePDA,
        authority: this.wallet.publicKey,
      })
      .signers([this.wallet])
      .rpc();
  }

  private canBuy(prop: Property): boolean {
    const t = (prop.propertyType || '').toLowerCase();
    return t === 'street' || t === 'railroad' || t === 'utility';
  }

  private whyNotBuyable(prop: Property): string {
    if (prop.owner !== 255) return 'Property already owned';

    const t = (prop.propertyType || '').toLowerCase();
    switch (t) {
      case 'go':
        return 'GO tile is not purchasable';
      case 'chance':
        return 'Chance tile is not purchasable';
      case 'community':
      case 'communitychest':
        return 'Community Chest tile is not purchasable';
      case 'tax':
      case 'incometax':
      case 'luxurytax':
        return 'Tax tile is not purchasable';
      case 'jail':
      case 'gotojail':
      case 'freeparking':
        return `${prop.propertyType} tile is not purchasable`;
      default:
        return `Tile type "${prop.propertyType}" is not purchasable`;
    }
  }

  async fetchGameState(): Promise<GameState> {
    // Fetch from ER for live state (falls back to base if not delegated)
    const conn = this.isDelegated ? this.erProgram : this.baseProgram;
    const account = await (conn.account as any)['gameState'].fetch(this.gameStatePDA);

    return {
      turnCount:     account.turnCount,
      currentPlayer: account.currentPlayer,
      status:        this.mapStatus(account.status),
      prizePool:     account.prizePool.toNumber?.() ?? Number(account.prizePool),
      players: account.players.map((p: any) => ({
        id:           p.id,
        position:     p.position,
        balance:      p.balance.toNumber?.() ?? Number(p.balance),
        personality:  Object.keys(p.personality)[0],
        riskTolerance: p.riskTolerance,
        isBankrupt:   p.isBankrupt,
        jailedTurns:  p.jailedTurns,
      })),
      properties: account.properties.map((p: any) => ({
        id:           p.id,
        owner:        p.owner, // 255 = no owner
        basePrice:    p.basePrice.toNumber?.() ?? Number(p.basePrice),
        baseRent:     p.baseRent.toNumber?.() ?? Number(p.baseRent),
        houses:       p.houses,
        isMortgaged:  p.isMortgaged,
        propertyType: Object.keys(p.propertyType ?? {})[0] ?? String(p.propertyType ?? 'Unknown'),
        colorGroup:   Object.keys(p.colorGroup)[0],
      })),
    };
  }

  private mapStatus(status: any): 'active' | 'won' | 'ended' {
    if (status.active !== undefined) return 'active';
    if (status.won    !== undefined) return 'won';
    return 'ended';
  }

private async finalizeGame(): Promise<void> {
    await this.commitAndUndelegateToL1();

    const state = await this.fetchGameState();
    const winner = state.players.reduce((a, b) => a.balance > b.balance ? a : b);
    console.log(`\nGame over! Winner: ${winner.personality} with ${winner.balance}`);

    this.emit(GameEvent.GAME_ENDED, {
      winner:  winner.id,
      balance: winner.balance,
      players: state.players,
    });
  }

  async commitAndUndelegateToL1(): Promise<void> {
    if (!this.isDelegated) return;
    try {
      console.log('[ER] Initiating commit back to L1 via Anchor...');
      const sig = await (this.erProgram.methods as any)
        .commitGame()
        .accountsStrict({
          payer: this.wallet.publicKey,
          gameState: this.gameStatePDA,
          magicProgram: MAGIC_PROGRAM_ID,
          magicContext: MAGIC_CONTEXT_ID,
        })
        .signers([this.wallet])
        .rpc();

      const commitmentSignature = await GetCommitmentSignature(sig, this.erConnection as any);
      await this.baseConnection.getTransaction(commitmentSignature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0,
      });

      this.isDelegated = false;
      console.log(`[ER] Commit+undelegate confirmed on L1:`, commitmentSignature);

      this.emit(GameEvent.ER_TX, {
        signature: commitmentSignature,
        instruction: 'commitGame',
        player: -1,
        status: 'confirmed',
        slot: await this.baseConnection.getSlot(),
        timestamp: Date.now(),
        validator: 'api.devnet.solana.com',
      });
    } catch (e) {
      console.warn('[ER] Commit+undelegate warning:', (e as Error).message.slice(0, 180));
    }
  }

  stop(): void { this.isRunning = false; }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private recordAgentDecision(playerId: number, message: string): void {
    const history = this.decisionHistory.get(playerId) || [];
    history.push(message);
    this.decisionHistory.set(playerId, history.slice(-8));
  }

  private recordTableEvent(message: string): void {
    this.recentTableEvents.push(message);
    this.recentTableEvents = this.recentTableEvents.slice(-16);
  }

  private getAgentHistory(playerId: number): string[] {
    return [...(this.decisionHistory.get(playerId) || [])];
  }

  private getRecentTableEvents(): string[] {
    return [...this.recentTableEvents];
  }

  private getOpponentContext(state: GameState, playerId: number): string[] {
    const byOwner = new Map<number, number>();
    for (const prop of state.properties) {
      if (prop.owner !== 255) {
        byOwner.set(prop.owner, (byOwner.get(prop.owner) || 0) + 1);
      }
    }

    return state.players
      .filter((p) => p.id !== playerId && !p.isBankrupt)
      .map((p) => `P${p.id}: balance ${p.balance}, pos ${p.position}, properties ${byOwner.get(p.id) || 0}`);
  }
}

