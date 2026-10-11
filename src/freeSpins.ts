import { useCallback, useEffect, useState } from 'react';
import { bonuses, FreeSpinGrant } from './api';

/**
 * Free spins waiting on one game (from staff or the daily wheel), soonest to expire first. A slot plays one by sending
 * the grant's id at the grant's stake; the house pays it and the winnings are ordinary balance.
 */
export function useFreeSpins(token: string, gameCode: string) {
  const [grants, setGrants] = useState<FreeSpinGrant[]>([]), [use, setUse] = useState(true);
  const load = useCallback(() => bonuses.freeSpins(token)
    .then(all => setGrants(all.filter(grant => grant.gameCode === gameCode && grant.status === 'ACTIVE' && grant.remainingSpins > 0)
      .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt))))
    .catch(() => setGrants([])), [token, gameCode]);
  useEffect(() => { void load(); }, [load]);
  const grant = grants[0] ?? null;
  /** After a free spin: the server says how many are left on that grant. */
  const spent = (id: string, left?: number | null) => {
    setGrants(current => current.map(item => item.id === id ? { ...item, remainingSpins: left ?? item.remainingSpins - 1 } : item).filter(item => item.remainingSpins > 0));
  };
  return { grant, remaining: grant?.remainingSpins ?? 0, active: use && !!grant, use, setUse, spent, reload: load };
}
