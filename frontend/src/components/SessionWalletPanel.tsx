import { Copy, Download, RefreshCw, Wallet } from 'lucide-react';
import { MIN_GAME_BALANCE_SOL } from '../hooks/useSessionWallet';

interface SessionWalletPanelProps {
  address: string | null;
  balanceSol: number;
  loadingBalance: boolean;
  onRefresh: () => void;
  onCopy: () => void;
  onDownload: () => void;
}

export function SessionWalletPanel({
  address,
  balanceSol,
  loadingBalance,
  onRefresh,
  onCopy,
  onDownload,
}: SessionWalletPanelProps) {
  const ready = balanceSol >= MIN_GAME_BALANCE_SOL;
  return (
    <div className="glass rounded-xl p-4 space-y-3">
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
        <Wallet className="w-4 h-4 text-violet-400" />
        Session Wallet
      </h3>

      <div className="text-xs text-gray-500">
        Top up this address to at least <span className="text-amber-400">{MIN_GAME_BALANCE_SOL} SOL</span> to start a
        new game.
      </div>

      <div className="bg-monopoly-card/70 border border-violet-900/40 rounded p-2 text-[11px] break-all text-gray-300">
        {address ?? 'Connect wallet to generate session address'}
      </div>

      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-500">Balance</span>
        <span className={ready ? 'text-green-400 font-mono' : 'text-orange-400 font-mono'}>
          {loadingBalance ? 'Loading...' : `${balanceSol.toFixed(4)} SOL`}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <button onClick={onRefresh} className="btn-secondary !py-2 !px-2 flex items-center justify-center" title="Refresh">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
        <button onClick={onCopy} className="btn-secondary !py-2 !px-2 flex items-center justify-center" title="Copy address">
          <Copy className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onDownload}
          className="btn-secondary !py-2 !px-2 flex items-center justify-center"
          title="Download keypair"
        >
          <Download className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="text-[11px] text-gray-500">{ready ? 'Ready to start game' : 'Game start is locked until funded.'}</div>
    </div>
  );
}
