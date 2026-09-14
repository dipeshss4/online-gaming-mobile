import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export const API_URL = (__DEV__ && Platform.OS === 'web' ? 'http://127.0.0.1:8082' : process.env.EXPO_PUBLIC_API_URL || (Platform.OS === 'android' ? 'http://10.0.2.2:8080' : 'http://localhost:8080')).replace(/\/$/, '');
export type Identity = { userId: string; email: string; role: string; permissions: string[] };
export type Auth = Identity & { accessToken: string };
export type Balance = { balance: number; currency: string; held?: number; status?: string };
export type Game = { theme?: string; featuredSymbol?: string; engineType?: string; code: string; name: string; description: string; minStake: number; maxStake: number; engine?: { layout: string; symbols: string[]; payline: number[]; rules: string[]; paytable: { label: string; multiplier: number }[] }; presentation?: { skin?: string; eyebrow?: string; tagline?: string; badge?: string; tileSubtitle?: string; glyph?: string; collection?: string } };
export type PlayResult = { requestId: string; betId: string; gameCode: string; symbols: string[]; stake: number; payout: number; balance: number; currency: string; outcome: string; multiplier: number };
export type Transaction = { id: string; type: string; amount: number; description: string; createdAt: string };
export type Bet = { betId: string; gameCode: string; stake: number; payout: number; status: string; settledAt: string };
export type Page<T> = { items: T[]; totalPages: number };
const KEY = 'online-gaming-session';
// Web previews deliberately use memory instead of browser persistent storage.
let memoryToken: string | null = null;
export const session = {
  read: () => Platform.OS === 'web' ? Promise.resolve(memoryToken) : SecureStore.getItemAsync(KEY),
  async save(token: string) { if (Platform.OS === 'web') memoryToken = token; else await SecureStore.setItemAsync(KEY, token); },
  async clear() { memoryToken = null; if (Platform.OS !== 'web') await SecureStore.deleteItemAsync(KEY); },
};
export class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
export async function request<T>(path: string, token?: string | null, body?: unknown): Promise<T> {
  if (!__DEV__ && !API_URL.startsWith('https://')) throw new Error('Release builds require an HTTPS API URL.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${API_URL}${path}`, {
      method: body === undefined ? 'GET' : 'POST', signal: controller.signal,
      headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) throw new ApiError(data?.message || `Request failed (${response.status})`, response.status);
    return data as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new Error('Cannot reach the server. Check your connection and mobile API URL.');
  } finally { clearTimeout(timer); }
}
