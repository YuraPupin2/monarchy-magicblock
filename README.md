# MONARCHY - AI Monopoly on MagicBlock ER

Monarchy is a hackathon MVP of an AI-driven Monopoly game running on Solana + MagicBlock Ephemeral Rollups (ER).

The app includes:
- 4 LLM agents that make turn decisions in real time.
- ER transaction feed, event log, and AI reasoning panel.
- Session wallet flow for starting games.
- L1 bet panel to place SOL on an agent.

## What This Repo Contains

- `src/` - Node/Express + Socket.IO game server.
- `src/game/engine.ts` - On-chain game engine + ER lifecycle.
- `src/agents/llmAgent.ts` - LLM decision client.
- `frontend/` - React + Vite UI.
- `programs/` - Anchor/Solana program workspace.
- `shared/monopoly.json` - Program IDL.

## Requirements

- Node.js 20+
- npm 10+
- (Optional, for program build/deploy) Rust, Solana CLI, Anchor

## 1) Install Dependencies

From repo root:

```bash
npm install
cd frontend
npm install
cd ..
```

## 2) Configure Environment

Create `.env` from template:

```bash
cp .env.example .env
```

Then fill at least:
- `OPENROUTER_API_KEY`
- `PROGRAM_ID` (if you want on-chain program execution)

Notes:
- `.env` is ignored by git.
- Never commit secrets.

## 3) Wallet / Funding Model

### Player session wallet (required to start)

In UI:
1. Connect Phantom.
2. A session wallet is generated client-side.
3. Fund that session wallet to at least **0.5 SOL** on devnet.
4. Start game is locked until this threshold is reached.

### Treasury wallet (for receiving L1 bets)

Server uses `wallet.json` as treasury receiver if present.

If `wallet.json` is missing, server generates an in-memory keypair on startup (not persistent).  
For stable bet destination across restarts, provide your own `wallet.json`.

## 4) Run the App

```bash
npm run dev
```

This starts:
- backend: `http://localhost:3001`
- frontend: `http://localhost:3000`

## 5) Game Lifecycle (Current Behavior)

- Each new Start creates a new game authority wallet (funded from session wallet) and a new on-chain game session (new PDA path).
- During gameplay, ER txs and AI decisions stream to UI.
- Reset triggers ER commit/undelegate flow back to L1 and resets local game state.

## API Endpoints

- `GET /api/health`
- `GET /api/game/state`
- `POST /api/game/start`
- `POST /api/game/stop`
- `POST /api/game/reset`
- `GET /api/treasury`
- `POST /api/bets/place`
- `POST /api/viewer/mutate`

## Build / Deploy (Optional)

Program + TS + frontend:

```bash
npm run build
npm run build:frontend
```

Anchor commands:

```bash
npm run anchor:build
npm run anchor:deploy
```

## GitHub Safety Checklist

Before pushing:
- `.env` is not committed.
- `wallet.json` and other private keys are not committed.
- No API keys in source files.
- Keep `.env.example` with placeholders only.

## License

MIT
