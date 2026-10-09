import React, { useCallback, useEffect, useState } from 'react';
import { Linking, Modal, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Tap } from './Tap';
import { c, feel } from './theme';
import { s } from './styles';
import { isPromoShowing, setOtherPopup, usePromoShowing } from './Popups';
import { enable, markOffered, permission, PushPreferences, PushState, savePreferences, sendTest, shouldOffer, status } from './notifications';

/**
 * The first-time ask: once per phone, after the welcome offer has gone, a card says what the notifications are for
 * before the system's own prompt appears. Asking cold is how apps lose the permission for good.
 */
export function PushPrompt({ token }: { token: string }) {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false);
  const waiting = usePromoShowing();
  useEffect(() => {
    if (waiting) return;
    let cancelled = false;
    // A few seconds into the lobby, once no other pop-up holds the screen: it waits for the welcome offer to close.
    let timer: ReturnType<typeof setTimeout>;
    const attempt = () => {
      if (cancelled) return;
      if (isPromoShowing()) { timer = setTimeout(attempt, 1500); return; }
      void shouldOffer().then(offer => { if (offer && !cancelled && !isPromoShowing()) { setOtherPopup(true); setOpen(true); } });
    };
    timer = setTimeout(attempt, 3500);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [waiting]);
  if (!open) return null;
  const close = () => { setOpen(false); setOtherPopup(false); };
  const later = () => { void markOffered(); close(); };
  const yes = async () => { setBusy(true); const result = await enable(token); setBusy(false); close(); feel(result.state === 'on' ? 'win' : 'tap'); };
  return <Modal transparent visible animationType="fade" onRequestClose={later} supportedOrientations={['portrait', 'landscape-left', 'landscape-right']}>
    <Pressable accessible={false} onPress={later} style={u.backdrop}>
      <Pressable onPress={() => undefined} style={u.card} accessibilityViewIsModal>
        <LinearGradient colors={['#3a1268', '#1a0838']} style={StyleSheet.absoluteFill} />
        <Text style={u.bell} accessibilityElementsHidden>🔔</Text>
        <Text style={u.title}>STAY IN THE LOOP</Text>
        <Text style={u.body}>Get a heads-up the moment it happens:</Text>
        {['Deposits and withdrawals, as they land', 'Free spins and bonuses waiting for you', 'News from the floor', 'A new sign-in to your account'].map(line =>
          <Text key={line} style={u.line}>✦  {line}</Text>)}
        <Tap haptic="heavy" accessibilityLabel="Turn on notifications" disabled={busy} onPress={() => void yes()} style={u.primaryWrap}>
          <LinearGradient colors={['#ffe58a', '#ffb01f', '#e0700a']} style={u.primary}><Text style={u.primaryText}>{busy ? 'ONE MOMENT…' : 'TURN ON'}</Text></LinearGradient>
        </Tap>
        <Tap haptic="select" accessibilityLabel="Not now" onPress={later} style={u.later}><Text style={u.laterText}>Not now</Text></Tap>
        <Text style={u.note}>You can change this any time in Account.</Text>
      </Pressable>
    </Pressable>
  </Modal>;
}

const CATEGORIES: { key: keyof PushPreferences; label: string; hint: string }[] = [
  { key: 'payments', label: 'Payments', hint: 'Deposits received, withdrawals approved and paid' },
  { key: 'bonuses', label: 'Bonuses and news', hint: 'Free spins, offers and announcements' },
  { key: 'security', label: 'Security', hint: 'A new sign-in to your account' },
];

/** Account → Notifications: whether this phone gets them, what about, and a test. */
export function NotificationSettings({ token }: { token: string }) {
  const [state, setState] = useState<PushState>('undetermined'), [prefs, setPrefs] = useState<PushPreferences | null>(null);
  const [staff, setStaff] = useState(false), [note, setNote] = useState(''), [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    // ON means the server has this phone: permission alone is not enough if the token never reached it.
    const allowed = await permission();
    try {
      const current = await status(token); setPrefs(current.preferences); setStaff(current.staffAlerts);
      const registered = current.devices.some(device => device.channel === 'EXPO' && device.thisSession);
      setState(allowed === 'on' && !registered ? 'undetermined' : allowed);
    } catch { setState(allowed); /* an older server has no push settings */ }
  }, [token]);
  useEffect(() => { void load(); }, [load]);
  if (state === 'unsupported') return null;

  async function turnOn() {
    setBusy(true); setNote('');
    const result = await enable(token);
    setState(result.state); setBusy(false); void load();
    if (result.state === 'on') setNote('This phone will get notifications.');
    else if (result.state === 'denied') setNote('Notifications are blocked for this app. Turn them on in the phone’s settings.');
    else if (result.state === 'error') setNote('This phone could not be registered for notifications right now.');
  }
  async function toggle(key: keyof PushPreferences, value: boolean) {
    if (!prefs) return;
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    try { setPrefs(await savePreferences(token, next)); } catch { setPrefs(prefs); setNote('Could not save that. Try again.'); }
  }
  async function test() {
    setBusy(true); setNote('');
    try { const { delivered } = await sendTest(token); setNote(delivered > 0 ? 'Sent. It should arrive in a moment.' : 'Nothing was delivered: this phone is not registered yet.'); }
    catch { setNote('Could not send a test right now.'); }
    setBusy(false);
  }

  return <View style={[s.card, u.settings]} accessibilityLabel="Notification settings">
    <View style={u.head}>
      <Text style={s.gameName}>Notifications</Text>
      <Text style={[u.state, state === 'on' ? { color: c.win } : { color: c.muted }]}>{state === 'on' ? 'ON' : state === 'denied' ? 'BLOCKED' : 'OFF'}</Text>
    </View>
    {state !== 'on' && <>
      <Text style={s.small}>Get a heads-up the moment a deposit lands, a withdrawal is paid or free spins are waiting.</Text>
      {state === 'denied'
        ? <Tap haptic="select" onPress={() => void Linking.openSettings()} style={s.secondary}><Text style={s.accent}>Open the phone’s settings</Text></Tap>
        : <Tap haptic="heavy" accessibilityLabel="Turn on notifications" disabled={busy} onPress={() => void turnOn()} style={s.secondary}><Text style={s.accent}>{busy ? 'One moment…' : '🔔  Turn on notifications'}</Text></Tap>}
    </>}
    {prefs && CATEGORIES.concat(staff ? [{ key: 'staff', label: 'Staff alerts', hint: 'Withdrawals waiting for review' }] : []).map(category =>
      <View key={category.key} style={u.row}>
        <View style={{ flex: 1 }}><Text style={[s.muted, { color: '#f1f4f9' }]}>{category.label}</Text><Text style={s.small}>{category.hint}</Text></View>
        <Switch accessibilityLabel={`${category.label} notifications`} value={prefs[category.key]} onValueChange={value => void toggle(category.key, value)}
          trackColor={{ true: c.pink, false: '#3a2a5a' }} thumbColor={prefs[category.key] ? '#ffe58a' : '#cfc4e6'} />
      </View>)}
    {state === 'on' && <Tap haptic="select" accessibilityLabel="Send a test notification" disabled={busy} onPress={() => void test()} style={s.secondary}><Text style={s.accent}>{busy ? 'Sending…' : 'Send a test notification'}</Text></Tap>}
    {!!note && <Text style={s.small} accessibilityLiveRegion="polite">{note}</Text>}
  </View>;
}

const u = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#000000bb', alignItems: 'center', justifyContent: 'center', padding: 16 },
  card: { width: '100%', maxWidth: 420, borderRadius: 22, borderWidth: 2, borderColor: '#ffd23f', padding: 20, gap: 6, overflow: 'hidden', alignItems: 'stretch' },
  bell: { fontSize: 38, textAlign: 'center' },
  title: { color: '#ffe58a', fontWeight: '900', fontSize: 20, letterSpacing: 3, textAlign: 'center' },
  body: { color: '#f3e8ff', fontSize: 14, textAlign: 'center', marginBottom: 4 },
  line: { color: '#e8dcff', fontSize: 14 },
  primaryWrap: { marginTop: 10 },
  primary: { minHeight: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#3b1600', fontWeight: '900', fontSize: 16, letterSpacing: 2 },
  later: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  laterText: { color: '#cdbbf0', fontWeight: '700', fontSize: 14 },
  note: { color: '#a998c8', fontSize: 11, textAlign: 'center' },
  settings: { gap: 10 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  state: { fontWeight: '900', letterSpacing: 2, fontSize: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
});
