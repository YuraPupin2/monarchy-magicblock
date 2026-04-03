import { useCallback, useEffect, useMemo, useState } from 'react';
import { Keypair, PublicKey } from '@solana/web3.js';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';

const STORAGE_KEY = 'monarchy_session_secret_key';
export const MIN_GAME_BALANCE_SOL = 0.5;

export function useSessionWallet() {
  const { connection } = useConnection();
  const { connected } = useWallet();
  const [secretKey, setSecretKey] = useState<number[] | null>(null);
  const [balanceSol, setBalanceSol] = useState(0);
  const [loadingBalance, setLoadingBalance] = useState(false);

  const sessionPublicKey = useMemo(() => {
    if (!secretKey) return null;
    try {
      return Keypair.fromSecretKey(Uint8Array.from(secretKey)).publicKey.toBase58();
    } catch {
      return null;
    }
  }, [secretKey]);

  const refreshBalance = useCallback(async () => {
    if (!sessionPublicKey) {
      setBalanceSol(0);
      return;
    }
    try {
      setLoadingBalance(true);
      const lamports = await connection.getBalance(new PublicKey(sessionPublicKey), 'confirmed');
      setBalanceSol(lamports / 1_000_000_000);
    } finally {
      setLoadingBalance(false);
    }
  }, [connection, sessionPublicKey]);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as number[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setSecretKey(parsed);
          return;
        }
      } catch {
        // ignore parse errors and regenerate below
      }
    }

    if (!connected) return;
    const kp = Keypair.generate();
    const next = Array.from(kp.secretKey);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setSecretKey(next);
  }, [connected]);

  useEffect(() => {
    refreshBalance().catch(() => {});
  }, [refreshBalance]);

  const downloadKeypair = useCallback(() => {
    if (!secretKey || !sessionPublicKey) return;
    const blob = new Blob([JSON.stringify(secretKey)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `monarchy-session-${sessionPublicKey.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [secretKey, sessionPublicKey]);

  const copyAddress = useCallback(async () => {
    if (!sessionPublicKey) return;
    await navigator.clipboard.writeText(sessionPublicKey);
  }, [sessionPublicKey]);

  const canStart = connected && !!secretKey && balanceSol >= MIN_GAME_BALANCE_SOL;

  return {
    secretKey,
    sessionPublicKey,
    balanceSol,
    loadingBalance,
    canStart,
    refreshBalance,
    downloadKeypair,
    copyAddress,
  };
}
