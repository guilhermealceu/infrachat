import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { syncDirectory } from './sync';
import type { SyncProgressData } from './store';

const initialProgress: SyncProgressData = {
  status: 'idle',
  message: '',
  processedFiles: 0,
  totalFiles: 0,
};

type SyncContextValue = {
  progress: SyncProgressData;
  isSyncing: boolean;
  elapsedSeconds: number;
  startSync: () => Promise<void>;
};

const SyncContext = createContext<SyncContextValue | null>(null);

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const [progress, setProgress] = useState<SyncProgressData>(initialProgress);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const isSyncing = progress.status === 'scanning' || progress.status === 'processing';

  useEffect(() => {
    if (!startedAt || !isSyncing) return;
    const timer = window.setInterval(() => setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000)), 1_000);
    return () => window.clearInterval(timer);
  }, [startedAt, isSyncing]);

  const value = useMemo<SyncContextValue>(() => ({
    progress,
    isSyncing,
    elapsedSeconds,
    startSync: async () => {
      if (isSyncing) return;
      setStartedAt(Date.now());
      setElapsedSeconds(0);
      setProgress({ ...initialProgress, status: 'scanning', message: 'Selecione a pasta raiz para iniciar a varredura...' });
      try {
        await syncDirectory(setProgress);
      } finally {
        setStartedAt(null);
      }
    },
  }), [progress, isSyncing, elapsedSeconds]);

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync() {
  const value = useContext(SyncContext);
  if (!value) throw new Error('useSync deve ser usado dentro de SyncProvider');
  return value;
}
