import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { request } from './api';

/**
 * Live push notifications. The server already queues them as things happen and sends them through Expo's push
 * service within a few seconds (deposits and withdrawals, free spins, a new sign-in, the admin's announcements to
 * players; see the server's push package). This side: asks the player (once, after a word of why), registers this
 * phone's Expo push token with the account, shows notifications that arrive while the app is open, routes a tap to
 * the wallet or the inbox, lets the player pick categories and send a test, and unregisters the phone on log out.
 *
 * Delivery needs the store's push credentials in EAS (FCM for Android, APNs for iOS); without them the token
 * request fails, which is reported as such rather than crashing anything.
 */
export type PushPreferences = { payments: boolean; bonuses: boolean; security: boolean; staff: boolean };
export type PushStatus = { devices: { id: string; channel: 'WEB' | 'EXPO'; device: string; thisSession: boolean }[]; preferences: PushPreferences; staffAlerts: boolean };
export type PushState = 'unsupported' | 'undetermined' | 'denied' | 'on' | 'error';

const TOKEN_KEY = 'push-token', ASKED_KEY = 'push-asked';
const supported = Platform.OS === 'android' || Platform.OS === 'ios';

// Alerts that arrive while the app is open still show as a banner, with their sound.
if (supported) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
}

const store = {
  get: async (key: string) => { try { return await SecureStore.getItemAsync(key); } catch { return null; } },
  set: async (key: string, value: string) => { try { await SecureStore.setItemAsync(key, value); } catch { /* this run only */ } },
  remove: async (key: string) => { try { await SecureStore.deleteItemAsync(key); } catch { /* nothing kept */ } },
};

/** Android shows nothing without a channel, and asks permission only once one exists (Android 13+). */
async function channels() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Wins, bonuses and payments', importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 200, 120, 200], lightColor: '#ffd23f',
  });
}

export async function permission(): Promise<PushState> {
  if (!supported) return 'unsupported';
  try {
    // Android 13+ reports a permission never asked as denied-but-can-ask; only a real refusal is "denied".
    const { status, canAskAgain } = await Notifications.getPermissionsAsync();
    return status === 'granted' ? 'on' : status === 'denied' && !canAskAgain ? 'denied' : 'undetermined';
  } catch { return 'error'; }
}

/** Whether to offer the first-time prompt: the player has not been asked on this phone yet. */
export async function shouldOffer() {
  return supported && (await permission()) === 'undetermined' && !(await store.get(ASKED_KEY));
}
export const markOffered = () => store.set(ASKED_KEY, '1');

/**
 * Asks the system (when the player said yes to our prompt), gets this phone's Expo push token and registers it with
 * the account. Returns the state the player ends in, and the reason when the token could not be had.
 */
export async function enable(token: string): Promise<{ state: PushState; reason?: string }> {
  if (!supported) return { state: 'unsupported' };
  await markOffered();
  try {
    await channels();
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowBadge: true, allowSound: true } })).status;
    if (status !== 'granted') return { state: (await permission()) === 'denied' ? 'denied' : 'undetermined' };
    await register(token);
    return { state: 'on' };
  } catch (e) {
    return { state: 'error', reason: e instanceof Error ? e.message : String(e) };
  }
}

/** Registers (or refreshes) this phone's token with the account; quietly, when permission is already granted. */
export async function register(token: string) {
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  const expoToken = (await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined)).data;
  const device = `${Constants.deviceName || (Platform.OS === 'ios' ? 'iPhone' : 'Android phone')} · app`;
  await request('/api/push/subscriptions', token, { expoToken, device: device.slice(0, 80) });
  await store.set(TOKEN_KEY, expoToken);
}

/** On sign-in: when the player already allowed notifications, keep this phone registered to the account. */
export async function refresh(token: string) {
  if ((await permission()) !== 'on') return;
  try { await channels(); await register(token); } catch { /* the next sign-in tries again */ }
}

/** On log out: this phone stops getting the account's notifications. */
export async function unregister(token: string) {
  const expoToken = await store.get(TOKEN_KEY);
  if (!expoToken) return;
  try { await request('/api/push/subscriptions/remove', token, { endpoint: expoToken }); } catch { /* the server drops it when the session ends */ }
  await store.remove(TOKEN_KEY);
}

export const status = (token: string) => request<PushStatus>('/api/push/status', token);
export const savePreferences = (token: string, preferences: PushPreferences) => request<PushPreferences>('/api/push/preferences', token, preferences, 'PUT');
export const sendTest = (token: string) => request<{ delivered: number }>('/api/push/test', token, {});

/** Where a notification's tap leads, from the url the server put in it. */
export type Destination = 'wallet' | 'inbox' | 'home';
export const destinationOf = (url?: unknown): Destination =>
  typeof url !== 'string' ? 'home' : url.includes('wallet=open') ? 'wallet' : url.includes('inbox=open') ? 'inbox' : 'home';

/** Calls {@code go} for every notification the player taps, including the one that opened the app. */
export function onTap(go: (destination: Destination) => void) {
  if (!supported) return () => undefined;
  let seen: string | null = null;
  const handle = (response: Notifications.NotificationResponse | null) => {
    if (!response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const id = response.notification.request.identifier;
    if (id === seen) return;
    seen = id;
    go(destinationOf(response.notification.request.content.data?.url));
  };
  void Notifications.getLastNotificationResponseAsync().then(handle).catch(() => undefined);
  const subscription = Notifications.addNotificationResponseReceivedListener(handle);
  return () => subscription.remove();
}

/** The inbox opens itself when a notification about a message is tapped. */
let inboxOpener: (() => void) | null = null;
export const onOpenInbox = (open: (() => void) | null) => { inboxOpener = open; };
export const openInbox = () => inboxOpener?.();
