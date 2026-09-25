import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export const BACKEND_URL = (process.env.EXPO_PUBLIC_API_URL || 'https://loot777x.com').replace(/\/$/, '');
export const API_URL = __DEV__ && Platform.OS === 'web' ? 'http://127.0.0.1:8082' : BACKEND_URL;
/**
 * The store this build belongs to (EXPO_PUBLIC_STORE_CODE, fixed at build time). The server uses it in place of a
 * web site's subdomain: sign-ups join this store, only its players can sign in, and it serves this store's branding.
 * Empty builds the platform's own app, which signs players up to the sign-up store.
 */
export const STORE_CODE = (process.env.EXPO_PUBLIC_STORE_CODE || '').trim();
const STORE_HEADER: Record<string, string> = STORE_CODE ? { 'X-Store-Code': STORE_CODE } : {};
export type Identity = { userId: string; email: string; role: string; permissions: string[] };
export type Auth = Identity & { accessToken: string };
export type Balance = { balance: number; currency: string; held?: number; status?: string };
export type Game = { theme?: string; featuredSymbol?: string; engineType?: string; code: string; name: string; description: string; minStake: number; maxStake: number; engine?: { layout: string; symbols: string[]; payline: number[]; rules: string[]; paytable: { label: string; multiplier: number }[] }; presentation?: { skin?: string; eyebrow?: string; tagline?: string; badge?: string; tileSubtitle?: string; glyph?: string; collection?: string };
  /** Admin → Games → Gameplay & sound. Older servers leave it out. */
  settings?: { sound?: { enabled: boolean; music: boolean; effects: boolean; musicVolume: number; effectsVolume: number } } };
export type PlayResult = { requestId: string; betId: string; gameCode: string; symbols: string[]; stake: number; payout: number; balance: number; currency: string; outcome: string; multiplier: number };
export type Transaction = { id: string; type: string; amount: number; description: string; createdAt: string };
export type Bet = { betId: string; gameCode: string; stake: number; payout: number; status: string; settledAt: string };
export type Page<T> = { items: T[]; totalPages: number };
/** One round of the player's own history: a reel, grid or roulette bet, or a crash flight. */
export type HistoryItem = { id: string; kind: 'ROUND' | 'CRASH'; gameCode: string; gameName: string; stake: number; payout: number;
  multiplier: number; result: 'WIN' | 'EVEN' | 'LOSS' | 'OPEN'; outcome: string | null; symbols: string[]; notes: string[];
  freeSpin: boolean; balanceAfter: number | null; playedAt: string };
export type HistoryTotal = { code: string | null; name: string; rounds: number; staked: number; returned: number; wins: number; biggestReturn: number; bestMultiplier: number };
/** {@code games} and {@code summary} come with the first page only; {@code nextBefore} is null on the last page. */
export type HistoryPage = { items: HistoryItem[]; nextBefore: string | null; games: HistoryTotal[] | null; summary: HistoryTotal | null };
/** Play limits and breaks, as served by /api/protection. Amounts are in the wallet's currency. */
export type LimitKind = 'DEPOSIT_DAY' | 'DEPOSIT_WEEK' | 'DEPOSIT_MONTH' | 'LOSS_DAY' | 'LOSS_WEEK' | 'LOSS_MONTH';
export type PlayerLimit = { kind: LimitKind; amount: number | null; used: number | null; remaining: number | null; pendingAmount: number | null; pendingRemoval: boolean; pendingEffectiveAt: string | null };
export type PlayerBreak = { kind: 'COOL_OFF' | 'SELF_EXCLUSION'; endsAt: string | null; permanent: boolean; startedAt: string };
export type Protection = { limits: PlayerLimit[]; activeBreak: PlayerBreak | null; coolingHours: number };
/** The floor: what everyone has been playing, the day's best returns, and the newest rounds. */
export type LiveTotals = { rounds: number; staked: number; biggestMultiplier: number; players: number; minutes: number };
export type LiveWin = { player: string | null; gameName: string; stake: number; payout: number; multiplier: number; settledAt: string };
export type LiveRound = { betId: string; player: string | null; playerRef: string; gameCode: string; gameName: string; stake: number; payout: number; multiplier: number; settledAt: string };
export type LiveSnapshot = { rounds: LiveRound[]; scoreboard: LiveWin[]; totals: LiveTotals; you: string; scoreboardAt: string };
export const floor = {
  read: (token: string) => request<LiveSnapshot>('/api/live', token),
};
export const protection = {
  read: (token: string) => request<Protection>('/api/protection', token),
  /** null removes the limit. Tightening applies at once; loosening or removing waits out the cooling period. */
  setLimit: (token: string, kind: LimitKind, amount: number | null) =>
    request<Protection>(`/api/protection/limits/${kind}`, token, { amount }, 'PUT'),
  takeBreak: (token: string, kind: PlayerBreak['kind'], duration: string) =>
    request<Protection>('/api/protection/break', token, { kind, duration }),
};
/** Cashier. {@code payoutAccountRequired}: the player sets up a payout account with the processor first. */
export type PaymentMethod = { providerCode: string; displayName: string; deposits: boolean; withdrawals: boolean;
  currency: string; minAmount: number; maxAmount: number; sandbox: boolean; payoutAccountRequired: boolean };
/** REQUESTED (money held) → SUBMITTED → PAID. Rejected, cancelled and failed all release the hold. */
export type WithdrawalStatus = 'REQUESTED' | 'SUBMITTED' | 'PAID' | 'REJECTED' | 'CANCELLED' | 'FAILED';
export type Withdrawal = { id: string; providerCode: string; amount: number; currency: string; status: WithdrawalStatus;
  failureReason: string | null; reviewNote: string | null; createdAt: string; completedAt: string | null };
export type PayoutAccount = { providerCode: string; status: 'NONE' | 'ONBOARDING' | 'READY' | 'RESTRICTED';
  detail: string | null; sandbox: boolean; updatedAt: string | null };
export const payments = {
  methods: (token: string) => request<{ methods: PaymentMethod[]; demoCredits: boolean }>('/api/payments/methods', token),
  withdrawals: (token: string) => request<Withdrawal[]>('/api/payments/withdrawals', token),
  /** The same requestId must be reused on a retry: the server treats it as the same request, never a second one. */
  withdraw: (token: string, providerCode: string, amount: number, requestId: string) =>
    request<Withdrawal>('/api/payments/withdrawals', token, { providerCode, amount, requestId }),
  cancelWithdrawal: (token: string, id: string) =>
    request<Withdrawal>(`/api/payments/withdrawals/${encodeURIComponent(id)}/cancel`, token, {}),
  payoutAccount: (token: string, providerCode: string) =>
    request<PayoutAccount>(`/api/payments/payout-accounts/${encodeURIComponent(providerCode)}`, token),
  /** Single-use links to the processor's own pages; they expire within minutes. */
  startPayoutSetup: (token: string, providerCode: string) =>
    request<{ url: string }>(`/api/payments/payout-accounts/${encodeURIComponent(providerCode)}/onboarding`, token, {}),
  payoutDashboard: (token: string, providerCode: string) =>
    request<{ url: string }>(`/api/payments/payout-accounts/${encodeURIComponent(providerCode)}/dashboard`, token, {}),
};
// Never reuse a local-server token when switching to the shared AWS demo.
const KEY = 'online-gaming-session-' + BACKEND_URL.replace(/[^a-zA-Z0-9._-]/g, '_');
// Web previews deliberately use memory instead of browser persistent storage.
let memoryToken: string | null = null;
export const session = {
  async read() {
    const saved = Platform.OS === 'web' ? memoryToken : await SecureStore.getItemAsync(KEY);
    live = saved;
    return saved;
  },
  async save(token: string) {
    live = token;
    if (Platform.OS === 'web') memoryToken = token; else await SecureStore.setItemAsync(KEY, token);
  },
  async clear() { live = null; memoryToken = null; if (Platform.OS !== 'web') await SecureStore.deleteItemAsync(KEY); },
};
export class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }

/**
 * Keeping the session alive. The access token lasts 15 minutes; the refresh token is an HttpOnly cookie the
 * native HTTP stack stores for us. Without this, everything that polls — the floor above all — quietly started
 * failing a quarter of an hour into a session while the rest of the screen still showed what it had.
 *
 * The live token is held here rather than in React state, so a renewal reaches calls already in flight with the
 * old one. One renewal is shared: half a dozen screens hitting 401 at once must not become six refreshes, which
 * would rotate the cookie out from under each other and end the session.
 */
/**
 * Sign-in sets the refresh cookie and renewal sends it back; on iOS and Android the HTTP stack keeps it for us.
 * Not on web: a browser refuses a credentialed request whose reply says `Access-Control-Allow-Origin: *`, which
 * is what the dev proxy and the layout harness both send — asking for cookies there breaks every call instead.
 */
const WITH_COOKIES = Platform.OS === 'web' ? {} : { credentials: 'include' as const };
let live: string | null = null;
let renewing: Promise<string | null> | null = null;
let announce: ((token: string) => void) | null = null;
/** The app registers this so its own copy of the token follows a renewal. */
export function onRenewed(listener: ((token: string) => void) | null) { announce = listener; }

async function renew(): Promise<string | null> {
  const response = await fetch(`${API_URL}/api/auth/refresh`, {
    method: 'POST', ...WITH_COOKIES,
    headers: { Accept: 'application/json', 'X-Session-Refresh': '1', ...STORE_HEADER },
  });
  if (!response.ok) return null;
  const data = await response.json().catch(() => null) as { accessToken?: string } | null;
  if (!data?.accessToken) return null;
  await session.save(data.accessToken);
  announce?.(data.accessToken);
  return data.accessToken;
}

function renewOnce(): Promise<string | null> {
  if (!renewing) renewing = renew().catch(() => null).finally(() => { renewing = null; });
  return renewing;
}

export async function request<T>(path: string, token?: string | null, body?: unknown, method?: 'POST' | 'PUT'): Promise<T> {
  try {
    return await send<T>(path, token, body, method);
  } catch (error) {
    // Only an authenticated call can be renewed, and the renewal call itself must never recurse.
    if (!(error instanceof ApiError) || error.status !== 401 || !token || path.startsWith('/api/auth/')) throw error;
    const renewed = await renewOnce();
    if (!renewed) { await session.clear(); live = null; throw error; }
    return await send<T>(path, renewed, body, method);
  }
}

async function send<T>(path: string, token?: string | null, body?: unknown, method?: 'POST' | 'PUT'): Promise<T> {
  if (!__DEV__ && !API_URL.startsWith('https://')) throw new Error('Release builds require an HTTPS API URL.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    // A renewal can land while this call is being made, so the freshest token wins over the caller's copy.
    const bearer = token ? live ?? token : null;
    const response = await fetch(`${API_URL}${path}`, {
      method: body === undefined ? 'GET' : method ?? 'POST', signal: controller.signal,
      ...WITH_COOKIES,
      headers: { Accept: 'application/json', ...STORE_HEADER, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
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
/** Announcements from the platform or the player's store (Admin → Players → Messages). */
export type InboxMessage = { id: string; title: string; body: string; createdAt: string; read: boolean };
export type Inbox = { messages: InboxMessage[]; unread: number };
export const inbox = {
  read: (token: string) => request<Inbox>('/api/inbox', token),
  markRead: (token: string, id: string) => request<void>(`/api/inbox/${encodeURIComponent(id)}/read`, token, {}),
  markAllRead: (token: string) => request<void>('/api/inbox/read-all', token, {}),
};
