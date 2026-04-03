import { Play, Square, RefreshCw } from 'lucide-react';

interface ControlsProps {
  gameStatus: string;
  onStart: () => void;
  onStop: () => void;
  onReset: () => void;
}

export function Controls({ gameStatus, onStart, onStop, onReset }: ControlsProps) {
  const isRunning = gameStatus === 'active';
  const isWaiting = gameStatus === 'waiting';

  return (
    <div className="glass rounded-xl p-4 space-y-3">
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
        Game Controls
      </h3>
      
      <div className="space-y-2">
        {!isRunning ? (
          <button
            onClick={onStart}
            className="w-full btn-primary flex items-center justify-center gap-2"
          >
            <Play className="w-4 h-4" />
            {isWaiting ? 'Start Game' : 'Resume Game'}
          </button>
        ) : (
          <button
            onClick={onStop}
            className="w-full bg-red-500 hover:bg-red-600 text-white py-3 px-6 rounded-lg font-semibold transition-all flex items-center justify-center gap-2"
          >
            <Square className="w-4 h-4" />
            Stop Game
          </button>
        )}
        
        <button
          onClick={onReset}
          className="w-full btn-secondary flex items-center justify-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Reset
        </button>
      </div>
      
      <div className="text-xs text-gray-500 text-center">
        Status: <span className={isRunning ? 'text-green-400' : 'text-gray-400'}>
          {gameStatus.toUpperCase()}
        </span>
      </div>
    </div>
  );
}
