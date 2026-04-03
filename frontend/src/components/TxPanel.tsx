import { useEffect, useRef, useState } from 'react';
import { CheckCircle, ExternalLink, Zap } from 'lucide-react';

export interface TxEntry {
  signature: string;
  instruction: string;
  player: string;
  status: 'pending' | 'confirmed';
  slot: number;
  timestamp: number;
  validator: string;
}

interface TxPanelProps {
  transactions: TxEntry[];
  embedded?: boolean;
}

const INSTRUCTION_LABELS: Record<string, string> = {
  executeMove: 'execute_move',
  buyProperty: 'buy_property',
  buildHouses: 'build_houses',
  payRent: 'pay_rent',
  mutateTraits: 'mutate_traits',
  commitGame: 'commit_game',
  commitAndUndelegate: 'commit_undelegate',
};

const INSTRUCTION_COLORS: Record<string, string> = {
  executeMove: 'text-blue-400',
  buyProperty: 'text-green-400',
  buildHouses: 'text-purple-400',
  payRent: 'text-amber-400',
  mutateTraits: 'text-pink-400',
  commitGame: 'text-violet-400',
  commitAndUndelegate: 'text-cyan-400',
};

function shortSig(sig: string): string {
  return sig.slice(0, 8) + '...' + sig.slice(-6);
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function TxPanel({ transactions, embedded = false }: TxPanelProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [newTx, setNewTx] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevLen = useRef(0);

  useEffect(() => {
    if (transactions.length > prevLen.current) {
      setNewTx(true);
      setTimeout(() => setNewTx(false), 800);
      prevLen.current = transactions.length;
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [transactions.length]);

  return (
    <div
      className={`
        ${embedded ? 'w-full' : 'fixed bottom-12 right-4 z-40 w-72'}
        rounded-xl border border-violet-900/60
        shadow-2xl shadow-violet-900/30
        transition-all duration-300
        ${newTx ? 'ring-2 ring-violet-500/60' : ''}
      `}
      style={{ background: 'rgba(10,10,26,0.95)', backdropFilter: 'blur(12px)' }}
    >
      <div
        className="flex items-center justify-between px-4 py-2 cursor-pointer border-b border-violet-900/40"
        onClick={() => setIsOpen((o) => !o)}
      >
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          <Zap className="w-3 h-3 text-violet-400" />
          <span className="text-xs font-bold text-violet-300 uppercase tracking-wider">ER Transactions</span>
          {transactions.length > 0 && (
            <span className="text-[10px] bg-violet-500/20 text-violet-400 px-1.5 py-0.5 rounded-full font-mono">
              {transactions.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-500">tee.magicblock.app</span>
          <span className="text-gray-500 text-xs">{isOpen ? '▼' : '▶'}</span>
        </div>
      </div>

      {isOpen && (
        <div className="max-h-52 overflow-y-auto px-3 py-2 space-y-1.5">
          {transactions.length === 0 ? (
            <div className="text-center text-gray-600 text-xs py-4">Waiting for transactions...</div>
          ) : (
            [...transactions].reverse().map((tx, i) => (
              <div
                key={tx.signature}
                className={`
                  flex flex-col gap-0.5 p-2 rounded-lg
                  border border-violet-900/30
                  ${i === 0 ? 'bg-violet-500/10 border-violet-500/40' : 'bg-white/[0.02]'}
                  transition-all duration-300
                `}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle className="w-3 h-3 text-green-400 shrink-0" />
                    <span className={`text-[11px] font-mono font-bold ${INSTRUCTION_COLORS[tx.instruction] || 'text-gray-400'}`}>
                      {INSTRUCTION_LABELS[tx.instruction] || tx.instruction}
                    </span>
                  </div>
                  <span className="text-[10px] text-gray-600 font-mono">{formatTime(tx.timestamp)}</span>
                </div>

                <div className="flex items-center justify-between pl-4">
                  <span className="text-[10px] text-gray-500">{tx.player}</span>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] font-mono text-violet-400/70">{shortSig(tx.signature)}</span>
                    <a
                      href={`https://explorer.solana.com/tx/${tx.signature}?cluster=devnet`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-gray-600 hover:text-violet-400 transition-colors"
                    >
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  </div>
                </div>

                <div className="flex items-center justify-between pl-4">
                  <span className="text-[10px] text-gray-600 font-mono">slot #{tx.slot.toLocaleString()}</span>
                  <span className="text-[10px] text-green-400">confirmed</span>
                </div>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>
      )}

      {isOpen && (
        <div className="px-3 py-1.5 border-t border-violet-900/30 flex items-center justify-between">
          <span className="text-[10px] text-gray-600">MagicBlock Ephemeral Rollup</span>
          <span className="text-[10px] text-violet-500/60 font-mono">sub-10ms</span>
        </div>
      )}
    </div>
  );
}
