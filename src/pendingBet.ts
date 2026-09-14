import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
export type PendingBet = { gameCode: string; requestId: string; stake: number; selections?: { selection: string; stake: number }[] };
const key = (user: string) => `pending-bet-${user}`;
export async function readPending(user: string): Promise<PendingBet | null> {
  const value = Platform.OS === 'web' ? localStorage.getItem(key(user)) : await SecureStore.getItemAsync(key(user));
  return value ? JSON.parse(value) : null;
}
export async function savePending(user: string, bet: PendingBet) {
  if (Platform.OS === 'web') localStorage.setItem(key(user), JSON.stringify(bet));
  else await SecureStore.setItemAsync(key(user), JSON.stringify(bet));
}
export async function clearPending(user: string) {
  if (Platform.OS === 'web') localStorage.removeItem(key(user));
  else await SecureStore.deleteItemAsync(key(user));
}
