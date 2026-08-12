import { useCallback, useState } from 'react';
import { generateId } from '../utils/id.js';

const STORAGE_KEY = 'sigma-wallet:local-player';

export function useLocalPlayerId() {
  const [player, setPlayer] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {
      // ignore
    }
    return null;
  });

  const setDisplayName = useCallback((displayName) => {
    const next = { id: generateId('player'), displayName };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setPlayer(next);
  }, []);

  return { player, setDisplayName };
}
