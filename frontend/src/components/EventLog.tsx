import { GameEvent } from '../hooks/useGame';
import {
  Dice5,
  Home,
  Wallet,
  Building2,
  Skull,
  Crown,
  ArrowRight,
  Zap,
  TrendingUp,
} from 'lucide-react';

interface EventLogProps {
  events: GameEvent[];
}

const AGENT_NAMES = ['RISKY ROY', 'CAUTIOUS CARL', 'CHAOS CHUCK', 'STRATEGY STEVE'];

function formatPlayer(player: unknown): string {
  if (typeof player === 'number') return AGENT_NAMES[player] ?? `Agent ${player + 1}`;
  if (typeof player === 'string') return player;
  return 'Agent';
}

const EVENT_ICONS: Record<string, React.ReactNode> = {
  DICE_ROLLED: <Dice5 className="w-4 h-4" />,
  PLAYER_MOVED: <ArrowRight className="w-4 h-4" />,
  PROPERTY_BOUGHT: <Home className="w-4 h-4" />,
  RENT_PAID: <Wallet className="w-4 h-4" />,
  HOUSES_BUILT: <Building2 className="w-4 h-4" />,
  PLAYER_BANKRUPT: <Skull className="w-4 h-4" />,
  GAME_ENDED: <Crown className="w-4 h-4" />,
  GAME_STARTED: <Zap className="w-4 h-4" />,
  GAME_STOPPED: <Zap className="w-4 h-4" />,
  GAME_RESET: <Zap className="w-4 h-4" />,
  MUTATION: <Zap className="w-4 h-4" />,
  PASSED_GO: <TrendingUp className="w-4 h-4" />,
  AGENT_THINKING: <Zap className="w-4 h-4" />,
  DECISION_PASS: <ArrowRight className="w-4 h-4" />,
  AGENT_DECISION: <Zap className="w-4 h-4" />,
  GAME_ERROR: <Skull className="w-4 h-4" />,
  BET_PLACED: <Wallet className="w-4 h-4" />,
};

const EVENT_COLORS: Record<string, string> = {
  DICE_ROLLED: 'text-blue-400',
  PLAYER_MOVED: 'text-gray-400',
  PROPERTY_BOUGHT: 'text-green-400',
  RENT_PAID: 'text-amber-400',
  HOUSES_BUILT: 'text-purple-400',
  PLAYER_BANKRUPT: 'text-red-400',
  GAME_ENDED: 'text-yellow-400',
  GAME_STARTED: 'text-violet-400',
  GAME_STOPPED: 'text-orange-400',
  GAME_RESET: 'text-violet-300',
  MUTATION: 'text-pink-400',
  PASSED_GO: 'text-green-300',
  AGENT_THINKING: 'text-violet-300',
  DECISION_PASS: 'text-gray-500',
  AGENT_DECISION: 'text-cyan-400',
  GAME_ERROR: 'text-red-400',
  BET_PLACED: 'text-emerald-400',
};

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatEvent(event: GameEvent): string {
  const d = event.data || {};
  const p = formatPlayer(d.player);
  switch (event.type) {
    case 'DICE_ROLLED':
      return `${p} rolled ${d.dice1}+${d.dice2}=${d.sum}${d.isDouble ? ' (double)' : ''}`;
    case 'PROPERTY_BOUGHT':
      return `${p} bought property #${d.property ?? d.position ?? '?'} for ${d.price ?? '?'} SOL${d.reasoning ? ` | "${d.reasoning}"` : ''}`;
    case 'RENT_PAID':
      return `${formatPlayer(d.from)} paid rent to ${formatPlayer(d.to)}`;
    case 'HOUSES_BUILT':
      return `${p} built ${d.count} house(s) on #${d.property}`;
    case 'PLAYER_BANKRUPT':
      return `${p} went BANKRUPT`;
    case 'GAME_ENDED':
      return `Game over! Winner: ${d.winner} (${d.balance} SOL)`;
    case 'GAME_STARTED':
      return `Game started! Mode: ${d.mode === 'onchain' ? 'On-chain ER' : 'AI Demo'}`;
    case 'GAME_RESET':
      return d.message ?? 'Game reset';
    case 'PASSED_GO':
      return `${p} passed GO! +${d.collected} SOL`;
    case 'AGENT_THINKING':
      if (d.phase === 'start') return `${p} is thinking about tile #${d.property}`;
      return `${p} finished thinking in ${d.durationMs ?? '?'} ms`;
    case 'DECISION_PASS':
      return `${p} passed: "${d.reasoning?.slice(0, 60) ?? ''}"`;
    case 'AGENT_DECISION':
      return `${p} decided ${String(d.action || 'pass').toUpperCase()}: "${d.reasoning ?? ''}"`;
    case 'GAME_ERROR':
      return `Server error: ${d.message ?? 'Unknown error'}`;
    case 'MUTATION':
      return `Viewer mutated Agent ${d.targetAgent} -> ${d.mutationType}`;
    case 'BET_PLACED':
      return `L1 bet: ${d.bettor?.slice(0, 6)}... placed ${d.amountSol} SOL on Agent ${d.agentId + 1}`;
    default:
      return String(event.type || 'unknown').replace(/_/g, ' ').toLowerCase();
  }
}

export function EventLog({ events }: EventLogProps) {
  return (
    <div className="glass rounded-xl p-4 h-[320px] flex flex-col">
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
        Event Log
      </h3>

      <div className="flex-1 overflow-y-auto space-y-2 pr-2">
        {events.length === 0 ? (
          <div className="text-center text-gray-600 py-8">No events yet. Start the game!</div>
        ) : (
          events.map((event, index) => (
            <div key={`${event.timestamp}-${index}`} className="flex items-start gap-3 text-xs animate-slide-in">
              <span className="text-gray-600 font-mono shrink-0">{formatTime(event.timestamp)}</span>

              <div className={`flex items-center gap-2 ${EVENT_COLORS[event.type] || 'text-gray-400'}`}>
                {EVENT_ICONS[event.type] || <Zap className="w-4 h-4" />}
                <span className="text-gray-300">{formatEvent(event)}</span>
              </div>
            </div>
          ))
        )}
      </div>

      {events.length > 0 && (
        <div className="mt-2 pt-2 border-t border-violet-900/30 text-center">
          <span className="text-[10px] text-gray-600">{events.length} events</span>
        </div>
      )}
    </div>
  );
}
