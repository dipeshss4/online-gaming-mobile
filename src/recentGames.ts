import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { recentApi } from './api';

/** The games the player played last, newest first, from their rounds on any device (the server keeps them). */
/** {@code refresh} changing (the lobby reloading after a game) loads the list again. */
export function useRecentGames(token: string | null, refresh?: unknown) {
  const [codes, setCodes] = useState<string[]>([]);
  useEffect(() => {
    if (!token) return;
    let active = true;
    const load = () => recentApi.read(token).then(list => { if (active && Array.isArray(list)) setCodes(list.map(item => item.code)); }).catch(() => undefined);
    void load();
    const listener = AppState.addEventListener('change', state => { if (state === 'active') void load(); });
    return () => { active = false; listener.remove(); };
  }, [token, refresh]);
  return codes;
}
