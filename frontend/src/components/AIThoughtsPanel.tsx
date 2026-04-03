import { GameEvent } from '../hooks/useGame';
import { Brain, Sparkles } from 'lucide-react';

interface AIThoughtsPanelProps {
  events: GameEvent[];
}

const AGENT_NAMES = ['RISKY ROY', 'CAUTIOUS CARL', 'CHAOS CHUCK', 'STRATEGY STEVE'];

function formatPlayer(player: unknown): string {
  if (typeof player === 'number') return AGENT_NAMES[player] ?? `Agent ${player + 1}`;
  if (typeof player === 'string') return player;
  return 'Agent';
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function AIThoughtsPanel({ events }: AIThoughtsPanelProps) {
  const activeThinking = events.find((e) => e.type === 'AGENT_THINKING' && e.data?.phase === 'start');
  const thoughts = events
    .filter((e) => e.type === 'AGENT_DECISION' && (e.data?.source === 'llm' || e.data?.source === undefined))
    .slice(0, 24);

  return (
    <div className="glass rounded-xl p-4 h-[360px] w-full flex flex-col">
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
        <Brain className="w-4 h-4 text-cyan-400" />
        AI Thoughts
      </h3>

      {activeThinking && (
        <div className="mb-2 rounded-md border border-violet-500/40 bg-violet-500/10 px-2 py-1 text-[11px] text-violet-300">
          {formatPlayer(activeThinking.data?.player)} is thinking...
        </div>
      )}

      <div className="flex-1 overflow-y-auto space-y-2 pr-2">
        {thoughts.length === 0 ? (
          <div className="text-center text-gray-600 py-8 text-xs">
            No agent reasoning yet.
          </div>
        ) : (
          thoughts.map((event, index) => {
            const d = event.data || {};
            const confidence = Math.round((d.confidence ?? 0) * 100);
            const playerName = formatPlayer(d.player);
            return (
              <div
                key={`${event.timestamp}-${index}`}
                className="rounded-lg border border-cyan-900/40 bg-cyan-500/5 p-2"
              >
                <div className="flex items-center justify-between text-[10px] text-gray-500 mb-1">
                  <span>{formatTime(event.timestamp)}</span>
                  <span className="text-cyan-400 flex items-center gap-1">
                    <Sparkles className="w-3 h-3" />
                    {String(d.action || 'pass').toUpperCase()} {confidence}%
                  </span>
                </div>
                <div className="text-xs text-cyan-300 font-semibold mb-1">{playerName}</div>
                <div className="text-xs text-gray-300 leading-relaxed">"{d.reasoning || 'No reasoning provided'}"</div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
