import { FormEvent, useEffect, useMemo, useState } from 'react';
import { LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';

const AGENTS = [
  { id: 0, name: 'RISKY ROY' },
  { id: 1, name: 'CAUTIOUS CARL' },
  { id: 2, name: 'CHAOS CHUCK' },
  { id: 3, name: 'STRATEGY STEVE' },
];

export function BetPanel() {
  const { connection } = useConnection();
  const { publicKey, connected, sendTransaction } = useWallet();
  const [agentId, setAgentId] = useState(0);
  const [amount, setAmount] = useState('0.1');
  const [treasury, setTreasury] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>('');

  const serverUrl = useMemo(() => {
    const host = window.location.hostname || 'localhost';
    return `http://${host}:3001`;
  }, []);

  useEffect(() => {
    fetch(`${serverUrl}/api/treasury`)
      .then((r) => r.json())
      .then((d) => setTreasury(String(d?.address || '')))
      .catch(() => setTreasury(''));
  }, [serverUrl]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!connected || !publicKey) {
      setStatus('Connect wallet first');
      return;
    }
    if (!treasury) {
      setStatus('Treasury address missing');
      return;
    }

    const sol = Number(amount);
    if (!Number.isFinite(sol) || sol <= 0) {
      setStatus('Invalid SOL amount');
      return;
    }

    try {
      setBusy(true);
      setStatus('Sending L1 bet transaction...');
      const lamports = Math.round(sol * LAMPORTS_PER_SOL);
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: new PublicKey(treasury),
          lamports,
        })
      );
      const sig = await sendTransaction(tx, connection);
      await connection.confirmTransaction(sig, 'confirmed');

      await fetch(`${serverUrl}/api/bets/place`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bettor: publicKey.toBase58(),
          agentId,
          amountSol: sol,
          signature: sig,
        }),
      });

      setStatus(`Bet placed: ${sol} SOL on ${AGENTS[agentId].name}`);
    } catch (err) {
      setStatus(`Bet failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="glass rounded-xl p-4">
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">L1 Bet</h3>
      <form onSubmit={onSubmit} className="space-y-2">
        <select
          value={agentId}
          onChange={(e) => setAgentId(Number(e.target.value))}
          className="w-full bg-monopoly-card border border-violet-900/40 rounded px-2 py-2 text-xs"
        >
          {AGENTS.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="SOL amount"
          className="w-full bg-monopoly-card border border-violet-900/40 rounded px-2 py-2 text-xs"
        />
        <button
          type="submit"
          disabled={busy || !connected}
          className="w-full btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy ? 'Placing...' : 'Place L1 Bet'}
        </button>
      </form>
      {status && <div className="text-[11px] text-gray-400 mt-2">{status}</div>}
    </div>
  );
}
