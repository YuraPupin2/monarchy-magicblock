import { Player } from '../hooks/useGame';
import { Coins, AlertCircle, Brain, Target, Flame } from 'lucide-react';

interface AgentCardProps {
  player: Player;
  isActive: boolean;
  isSelected: boolean;
  onClick: () => void;
}

const PERSONALITY_ICONS: Record<string, React.ReactNode> = {
  'Gambler': <Flame className="w-4 h-4" />,
  'Coward': <AlertCircle className="w-4 h-4" />,
  'Toxic': <Brain className="w-4 h-4" />,
  'Monopolist': <Target className="w-4 h-4" />,
};

const PERSONALITY_COLORS = {
  'Gambler': 'from-red-500 to-orange-500',
  'Coward': 'from-blue-500 to-cyan-500',
  'Toxic': 'from-green-500 to-emerald-500',
  'Monopolist': 'from-amber-500 to-yellow-500',
};

export function AgentCard({ player, isActive, isSelected, onClick }: AgentCardProps) {
  const isBankrupt = player.isBankrupt;
  
  return (
    <div
      onClick={onClick}
      className={`
        relative w-full max-w-full overflow-hidden glass rounded-xl p-4 cursor-pointer
        transition-all duration-300 card-hover
        ${isActive ? 'border-violet-400 bg-violet-500/5' : ''}
        ${isSelected ? 'border-violet-500/70' : ''}
        ${isBankrupt ? 'opacity-50 grayscale' : ''}
        border border-violet-900/30 ${isActive ? '' : 'hover:border-violet-900/60'}
      `}
    >
      {/* Active indicator */}
      {isActive && (
        <div className="absolute top-3 right-3 w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse" />
      )}
      
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          {/* Avatar */}
          <div 
            className={`
              w-12 h-12 rounded-full flex items-center justify-center
              border-2 border-white/20 shadow-lg
              ${isBankrupt ? 'bg-gray-700' : `bg-gradient-to-br ${PERSONALITY_COLORS[player.personality as keyof typeof PERSONALITY_COLORS] || 'from-violet-500 to-purple-500'}`}
            `}
          >
            {player.name.charAt(0)}
          </div>
          <div>
            <h4 className="font-bold text-sm">{player.name}</h4>
            <div className="flex items-center gap-1 text-xs text-gray-400">
              {PERSONALITY_ICONS[player.personality] || <Brain className="w-3 h-3" />}
              <span>{player.personality}</span>
            </div>
          </div>
        </div>
        
        {isBankrupt && (
          <span className="badge badge-bankrupt">BANKRUPT</span>
        )}
      </div>
      
      {/* Stats */}
      <div className="space-y-2">
        {/* Balance */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <Coins className="w-3 h-3" />
            Balance
          </div>
          <span className={`font-mono text-sm font-bold ${player.balance > 2000 ? 'text-green-400' : player.balance < 500 ? 'text-red-400' : 'text-amber-400'}`}>
            {player.balance} SOL
          </span>
        </div>
        
        {/* Position & Properties */}
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-500">Position: <span className="text-gray-300 font-mono">{player.position}</span></span>
          <span className="text-gray-500">Properties: <span className="text-gray-300 font-mono">{player.properties.length}</span></span>
        </div>
      </div>
      
      {/* Property mini-list if any */}
      {player.properties.length > 0 && (
        <div className="mt-3 pt-3 border-t border-white/5">
          <div className="flex flex-wrap gap-1">
            {player.properties.slice(0, 5).map(propId => (
              <span 
                key={propId}
                className="text-[10px] px-2 py-0.5 rounded bg-violet-500/20 text-violet-400"
              >
                #{propId}
              </span>
            ))}
            {player.properties.length > 5 && (
              <span className="text-[10px] text-gray-500">+{player.properties.length - 5}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
