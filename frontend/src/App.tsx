import { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { Crown, Zap, Coins, Users } from 'lucide-react';
import { GameBoard } from './components/GameBoard';
import { AgentCard } from './components/AgentCard';
import { EventLog } from './components/EventLog';
import { AIThoughtsPanel } from './components/AIThoughtsPanel';
import { Controls } from './components/Controls';
import { TxPanel } from './components/TxPanel';
import { BetPanel } from './components/BetPanel';
import { useGame } from './hooks/useGame';
import { useSessionWallet, MIN_GAME_BALANCE_SOL } from './hooks/useSessionWallet';
import { SessionWalletPanel } from './components/SessionWalletPanel';

function App() {
  const { gameState, events, transactions, isConnected, startGame, stopGame, resetGame } = useGame();
  const { connected, publicKey } = useWallet();
  const session = useSessionWallet();
  const [selectedAgent, setSelectedAgent] = useState<number | null>(null);

  const handleStart = () => {
    if (!connected || !publicKey) {
      alert('Connect wallet first');
      return;
    }
    if (!session.secretKey || !session.canStart) {
      alert(`Fund session wallet to at least ${MIN_GAME_BALANCE_SOL} SOL before starting.`);
      return;
    }
    startGame(publicKey.toBase58(), session.secretKey);
  };

  return (
    <div className="min-h-screen bg-grid bg-monopoly-bg">
      <header className="border-b border-violet-900/50 bg-monopoly-card/80 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Crown className="w-8 h-8 text-violet-500" />
            <div>
              <h1 className="text-2xl font-bold gradient-text">MONARCHY</h1>
              <p className="text-xs text-gray-400">AI Monopoly on MagicBlock ER</p>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
              {isConnected ? 'Connected' : 'Offline'}
            </div>
            <div className="flex items-center gap-4 text-sm">
              <span className="flex items-center gap-1 text-violet-400">
                <Zap className="w-4 h-4" />
                Sub-10ms
              </span>
              <span className="flex items-center gap-1 text-green-400">
                <Coins className="w-4 h-4" />
                Gasless
              </span>
              <span className="flex items-center gap-1 text-amber-400">
                <Users className="w-4 h-4" />4 AI Agents
              </span>
            </div>
            <WalletMultiButton className="!bg-violet-700 !rounded-lg !h-9 !text-xs" />
          </div>
        </div>
      </header>

      <main className="w-full max-w-[1980px] mx-auto px-4 lg:px-6 py-6">
        <div className="grid gap-5 xl:grid-cols-[300px_minmax(940px,1fr)_430px] items-start">
          <aside className="space-y-4 max-h-[calc(100vh-120px)] overflow-y-auto overflow-x-hidden px-2">
            <Controls gameStatus={gameState.status} onStart={handleStart} onStop={stopGame} onReset={resetGame} />
            <SessionWalletPanel
              address={session.sessionPublicKey}
              balanceSol={session.balanceSol}
              loadingBalance={session.loadingBalance}
              onRefresh={session.refreshBalance}
              onCopy={session.copyAddress}
              onDownload={session.downloadKeypair}
            />
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">AI Agents</h3>
              {gameState.players.map((player) => (
                <AgentCard
                  key={player.id}
                  player={player}
                  isActive={gameState.currentPlayer === player.id}
                  isSelected={selectedAgent === player.id}
                  onClick={() => setSelectedAgent(player.id)}
                />
              ))}
            </div>
          </aside>

          <section className="min-w-0">
            <GameBoard players={gameState.players} currentPlayer={gameState.currentPlayer} turn={gameState.turn} />
          </section>

          <aside className="space-y-4 max-h-[calc(100vh-120px)] overflow-y-auto overflow-x-hidden px-1">
            <div className="glass rounded-xl p-4">
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Game Stats</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Turn</span>
                  <span className="font-mono text-violet-400">{gameState.turn}/100</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Prize Pool</span>
                  <span className="font-mono text-amber-400">{gameState.prizePool} SOL</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Active Players</span>
                  <span className="font-mono text-green-400">{gameState.players.filter((p) => !p.isBankrupt).length}/4</span>
                </div>
              </div>
            </div>

            <EventLog events={events} />
            <AIThoughtsPanel events={events} />
            <TxPanel transactions={transactions} embedded />
            <BetPanel />
          </aside>
        </div>
      </main>

      <footer className="mt-4 border-t border-violet-900/30 bg-monopoly-bg/90 backdrop-blur py-3">
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between text-xs text-gray-500">
          <div>
            Powered by <span className="text-violet-400">MagicBlock Ephemeral Rollups</span>
          </div>
          <div className="flex items-center gap-4">
            <span>ER Validator: tee.magicblock.app</span>
            <span>|</span>
            <span>Magic Router: Sub-50ms</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
