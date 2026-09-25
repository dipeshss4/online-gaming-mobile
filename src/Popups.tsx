import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, AppState, Easing, Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { API_URL, Game, Inbox, inbox as inboxApi } from './api';
import { Tap } from './Tap';
import { c, feel, grad, useReducedMotion } from './theme';
import { sound, useSoundOn } from './sound';

const serif = Platform.OS === 'android' ? 'serif' : 'Georgia';

/** Admin → Site content → Welcome pop-up. An empty `amount` hides the big number; `gameLine` fills in `{game}`. */
export type Promo = { enabled: boolean; imageId: string; title: string; intro: string; amount: string; amountLabel: string;
  body: string; gameCode: string; gameLine: string; button: string };

// One pop-up at a time: a phone will not stack two modal screens, so a new message waits for the welcome offer.
let promoShowing = false;
const promoListeners = new Set<(showing: boolean) => void>();
function setPromoShowing(showing: boolean) { promoShowing = showing; promoListeners.forEach(listener => listener(showing)); }
function usePromoShowing() {
  const [showing, setShowing] = useState(promoShowing);
  useEffect(() => { promoListeners.add(setShowing); return () => { promoListeners.delete(setShowing); }; }, []);
  return showing;
}

// Once per sign-in: an app launch counts as one, and a changed offer shows again.
const shownThisRun = new Set<string>();
const promoKey = (email: string, promo: Promo) => `${email}:${JSON.stringify(promo)}`;

/** The lobby's welcome pop-up, as on the website: stars, falling coins, the offer, and a button into a game. */
export function PromoPopup({ promo, email, games, onPlay }: { promo?: Promo; email: string; games: Game[]; onPlay: (game: Game) => void }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!promo?.enabled || !email) return;
    const key = promoKey(email, promo);
    if (shownThisRun.has(key)) return;
    shownThisRun.add(key);
    // A moment after the lobby appears, so it lands on a screen rather than a blank one.
    setPromoShowing(true);
    let fired = false;
    const timer = setTimeout(() => { fired = true; setOpen(true); sound.welcome(); feel('win'); }, 600);
    return () => { clearTimeout(timer); if (!fired) setPromoShowing(false); };
  }, [promo, email]);
  // Leaving the lobby with the offer still open must not hold back the inbox forever.
  useEffect(() => () => setPromoShowing(false), []);
  if (!promo || !open) return null;
  const game = games.find(candidate => candidate.code === promo.gameCode);
  const close = () => { setOpen(false); setPromoShowing(false); };
  return <Modal transparent visible animationType="fade" onRequestClose={close} supportedOrientations={['portrait', 'landscape-left', 'landscape-right']}>
    <Pressable accessible={false} onPress={close} style={p.backdrop}>
      <Sparkles />
      <PromoCard promo={promo} game={game} onClose={close} onAction={() => { close(); if (game) onPlay(game); }} />
    </Pressable>
  </Modal>;
}

function PromoCard({ promo, game, onClose, onAction }: { promo: Promo; game?: Game; onClose: () => void; onAction: () => void }) {
  const { width, height } = useWindowDimensions();
  const reduced = useReducedMotion();
  const pop = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  const glow = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced) return;
    Animated.spring(pop, { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }).start();
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(glow, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(glow, { toValue: 0, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [reduced, pop, glow]);
  const landscape = width > height;
  const art = landscape ? Math.min(150, height * .32) : Math.min(210, width * .52);
  const [before, ...after] = (promo.gameLine || '').split('{game}');
  return <Animated.View onStartShouldSetResponder={() => true} accessibilityViewIsModal
    style={[p.cardWrap, { width: Math.min(width - 32, landscape ? 560 : 420), transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [.6, 1] }) }], opacity: pop }]}>
    <LinearGradient colors={['#ffe45c', '#ff3cac', '#8a3cff', '#22e1ff']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={p.rim}>
      <LinearGradient colors={['#3a0f7a', '#1c0b4d', '#12062b']} style={[p.card, landscape && { paddingVertical: 14 }]}>
        <Tap haptic="select" accessibilityLabel="Close" onPress={onClose} style={p.close}><Text style={p.closeText}>×</Text></Tap>
        <View style={[p.art, { height: art * .8 }]}>
          <Animated.View style={[p.halo, { width: art * 1.1, height: art * 1.1, borderRadius: art, opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [.35, .8] }), transform: [{ scale: glow.interpolate({ inputRange: [0, 1], outputRange: [.92, 1.06] }) }] }]} />
          <Image accessibilityIgnoresInvertColors source={promo.imageId ? { uri: `${API_URL}/api/media/${promo.imageId}` } : require('../assets/promo/treasure.png')}
            style={{ width: art, height: art * .8 }} resizeMode="contain" />
        </View>
        <Text accessibilityRole="header" style={[p.title, landscape && { fontSize: 34 }]} numberOfLines={1} adjustsFontSizeToFit>{promo.title}</Text>
        <View style={p.panel}>
          {!!promo.intro && <Text style={p.intro}>{promo.intro}</Text>}
          {!!promo.amount && <View style={p.amountRow}><Text style={p.amount} adjustsFontSizeToFit numberOfLines={1}>{promo.amount}</Text>{!!promo.amountLabel && <Text style={p.amountLabel}>{promo.amountLabel}</Text>}</View>}
          {!!promo.body && <Text style={p.body}>{promo.body}</Text>}
        </View>
        {!!game && !!promo.gameLine && <LinearGradient colors={[...grad.hot]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={p.ribbon}>
          <Text style={p.ribbonText}>{after.length ? <>{before}<Text style={{ color: c.gold }}>{game.name}</Text>{after.join(game.name)}</> : promo.gameLine}</Text>
        </LinearGradient>}
        <Tap haptic="heavy" onPress={onAction} style={p.actionTap}>
          <LinearGradient colors={[...grad.cta]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={p.action}><Text style={p.actionText}>{promo.button || 'Play now'}</Text></LinearGradient>
        </Tap>
      </LinearGradient>
    </LinearGradient>
  </Animated.View>;
}

/** Where the stars twinkle and coins fall: fixed, so the pop-up looks the same every time. [left %, top %, size, delay ms] */
const STARS = [[4, 12, 22, 0], [90, 8, 18, 600], [10, 48, 14, 1200], [88, 42, 24, 300], [3, 78, 18, 1600], [93, 82, 14, 900],
  [26, 4, 13, 1900], [72, 3, 19, 1100], [50, 1, 14, 400], [30, 94, 16, 2200], [66, 95, 20, 1400], [80, 62, 12, 2600]];
const COINS = [[8, 0], [24, 1400], [42, 700], [60, 2100], [78, 300], [90, 1700], [16, 2600], [70, 3100]];

/** Twinkling stars and falling coins around the card. Still when the phone asks for reduced motion. */
function Sparkles() {
  const { height } = useWindowDimensions();
  const reduced = useReducedMotion();
  const clock = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(Animated.timing(clock, { toValue: 1, duration: 4000, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [reduced, clock]);
  const phase = (delay: number) => Animated.modulo(Animated.add(clock, delay / 4000), 1);
  return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}>
    {STARS.map(([left, top, size, delay], i) => <Animated.Text key={`s${i}`} style={[p.star, { left: `${left}%`, top: `${top}%`, fontSize: size },
      !reduced && { opacity: phase(delay).interpolate({ inputRange: [0, .25, .5, 1], outputRange: [.15, 1, .15, .15] }), transform: [{ scale: phase(delay).interpolate({ inputRange: [0, .25, .5, 1], outputRange: [.6, 1.25, .6, .6] }) }] }]}>✦</Animated.Text>)}
    {!reduced && COINS.map(([left, delay], i) => <Animated.View key={`c${i}`} style={[p.coin, { left: `${left}%`,
      transform: [{ translateY: phase(delay).interpolate({ inputRange: [0, 1], outputRange: [-40, height + 40] }) }, { rotateY: phase(delay).interpolate({ inputRange: [0, 1], outputRange: ['0deg', '720deg'] }) }] }]}>
      <LinearGradient colors={['#fff3a0', '#ffc400', '#e07b00']} style={p.coinFace}><Text style={p.coinMark}>$</Text></LinearGradient>
    </Animated.View>)}
  </View>;
}

/** The player's sound switch: music and effects on or off, remembered on this phone. */
export function SoundToggle() {
  const on = useSoundOn();
  return <Tap haptic="select" accessibilityLabel={on ? 'Sound on. Turn sound off' : 'Sound off. Turn sound on'} accessibilityState={{ selected: on }}
    onPress={() => void sound.setOn(!on)} style={p.envelope}><Text style={[p.envelopeIcon, !on && { color: c.faint }]}>{on ? '🔊' : '🔇'}</Text></Tap>;
}

// ------------------------------------------------------------------ inbox

const REFRESH_MS = 60_000;
const announced = new Set<string>();

/**
 * The player's inbox: announcements from the platform or their store. The envelope shows how many are unread; a
 * new announcement also opens on its own once, with a bell, so a broadcast is seen without hunting for it.
 */
export function InboxButton({ token }: { token: string }) {
  const [box, setBox] = useState<Inbox | null>(null);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [fresh, setFresh] = useState<Inbox['messages'][number] | null>(null);
  const waiting = usePromoShowing();
  const load = useCallback(async () => {
    try {
      const next = await inboxApi.read(token);
      setBox(next);
      const newest = next.messages.find(message => !message.read && !announced.has(message.id));
      if (newest) { next.messages.forEach(message => announced.add(message.id)); setFresh(newest); }
    } catch { /* the envelope stays as it was; an older server has no inbox */ }
  }, [token]);
  useEffect(() => {
    void load();
    const timer = setInterval(() => { if (AppState.currentState === 'active') void load(); }, REFRESH_MS);
    const listener = AppState.addEventListener('change', state => { if (state === 'active') void load(); });
    return () => { clearInterval(timer); listener.remove(); };
  }, [load]);

  async function markRead(id: string) {
    setBox(current => current && { unread: Math.max(0, current.unread - (current.messages.find(m => m.id === id && !m.read) ? 1 : 0)), messages: current.messages.map(m => m.id === id ? { ...m, read: true } : m) });
    try { await inboxApi.markRead(token, id); } catch { void load(); }
  }
  async function readAll() {
    setBox(current => current && { unread: 0, messages: current.messages.map(m => ({ ...m, read: true })) });
    try { await inboxApi.markAllRead(token); } catch { void load(); }
  }
  function show(id: string, read: boolean) { setExpanded(current => current === id ? null : id); if (!read) void markRead(id); }

  const unread = box?.unread ?? 0;
  return <>
    <Tap haptic="select" accessibilityLabel={unread ? `Inbox, ${unread} unread` : 'Inbox'} onPress={() => setOpen(true)} style={p.envelope}>
      <Text style={p.envelopeIcon}>✉</Text>
      {unread > 0 && <View style={p.badge}><Text style={p.badgeText}>{unread > 9 ? '9+' : unread}</Text></View>}
    </Tap>
    <Modal transparent visible={open} animationType="slide" onRequestClose={() => setOpen(false)} supportedOrientations={['portrait', 'landscape-left', 'landscape-right']}>
      <View style={p.sheetShade}>
        <Pressable accessible={false} onPress={() => setOpen(false)} style={{ flex: 1 }} />
        <LinearGradient colors={['#2b1456', '#150732']} style={p.sheet}>
          <View style={p.sheetHead}>
            <Text accessibilityRole="header" style={p.sheetTitle}>Inbox</Text>
            {unread > 0 && <Tap haptic="select" onPress={() => void readAll()} style={p.sheetLink}><Text style={p.sheetLinkText}>Mark all read</Text></Tap>}
            <Tap haptic="select" accessibilityLabel="Close" onPress={() => setOpen(false)} style={p.sheetClose}><Text style={p.closeText}>×</Text></Tap>
          </View>
          <ScrollView contentContainerStyle={{ gap: 10, paddingBottom: 24 }}>
            {!box ? <Text style={p.empty}>Loading…</Text> : box.messages.length ? box.messages.map(message =>
              <Tap key={message.id} haptic="select" onPress={() => show(message.id, message.read)}
                style={[p.message, !message.read && p.messageUnread]}>
                <View style={p.messageHead}>
                  {!message.read && <View style={p.dot} />}
                  <Text style={[p.messageTitle, !message.read && { color: '#fff' }]} numberOfLines={expanded === message.id ? undefined : 1}>{message.title}</Text>
                  <Text style={p.messageTime}>{when(message.createdAt)}</Text>
                </View>
                {expanded === message.id && <Text style={p.messageBody}>{message.body}</Text>}
              </Tap>) : <Text style={p.empty}>No messages yet. News and offers will appear here.</Text>}
          </ScrollView>
        </LinearGradient>
      </View>
    </Modal>
    {fresh && !waiting && !open && <Announcement message={fresh} onClose={() => setFresh(null)} onRead={() => { void markRead(fresh.id); setFresh(null); }} />}
  </>;
}

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

/** A new announcement, shown once as a pop-up: a megaphone, the title and the message, and "Got it". */
function Announcement({ message, onClose, onRead }: { message: Inbox['messages'][number]; onClose: () => void; onRead: () => void }) {
  useEffect(() => { sound.play('message'); feel('select'); }, []);
  const { width } = useWindowDimensions();
  const reduced = useReducedMotion();
  const pop = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  const ring = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced) return;
    Animated.spring(pop, { toValue: 1, friction: 6, tension: 90, useNativeDriver: true }).start();
    Animated.sequence([0, 1, 2].flatMap(() => [
      Animated.timing(ring, { toValue: 1, duration: 90, useNativeDriver: true }),
      Animated.timing(ring, { toValue: -1, duration: 90, useNativeDriver: true }),
    ]).concat(Animated.timing(ring, { toValue: 0, duration: 90, useNativeDriver: true }))).start();
  }, [reduced, pop, ring]);
  return <Modal transparent visible animationType="fade" onRequestClose={onClose} supportedOrientations={['portrait', 'landscape-left', 'landscape-right']}>
    <View style={p.backdrop}>
      <Animated.View accessibilityViewIsModal style={{ width: Math.min(width - 32, 420), opacity: pop, transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [.7, 1] }) }] }}>
        <LinearGradient colors={['#ff3cac', '#8a3cff', '#22e1ff']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={p.rim}>
          <LinearGradient colors={['#3a0f7a', '#1c0b4d']} style={[p.card, { gap: 12 }]}>
            <Animated.Text style={[p.megaphone, { transform: [{ rotate: ring.interpolate({ inputRange: [-1, 1], outputRange: ['-14deg', '14deg'] }) }] }]}>📣</Animated.Text>
            <Text style={p.kicker}>NEW MESSAGE</Text>
            <Text accessibilityRole="header" style={p.announceTitle}>{message.title}</Text>
            <ScrollView style={{ maxHeight: 220, alignSelf: 'stretch' }}><Text style={p.announceBody}>{message.body}</Text></ScrollView>
            <Tap haptic="heavy" onPress={onRead} style={p.actionTap}>
              <LinearGradient colors={[...grad.cta]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={p.action}><Text style={p.actionText}>Got it</Text></LinearGradient>
            </Tap>
            <Tap haptic="select" onPress={onClose} style={p.later}><Text style={p.laterText}>Later</Text></Tap>
          </LinearGradient>
        </LinearGradient>
      </Animated.View>
    </View>
  </Modal>;
}

const p = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#06011ae6', alignItems: 'center', justifyContent: 'center', padding: 16 },
  cardWrap: { maxWidth: '100%' },
  rim: { borderRadius: 26, padding: 3 },
  card: { borderRadius: 23, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 20, alignItems: 'center', gap: 10, overflow: 'hidden' },
  close: { position: 'absolute', right: 6, top: 6, width: 44, height: 44, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  closeText: { color: '#fff', fontSize: 30, lineHeight: 32 },
  art: { alignItems: 'center', justifyContent: 'center', width: '100%' },
  halo: { position: 'absolute', backgroundColor: '#ffcc3355' },
  title: { fontFamily: serif, fontWeight: '900', fontSize: 44, letterSpacing: 2, color: '#ffe45c', textShadowColor: '#ff3cac', textShadowRadius: 14, textShadowOffset: { width: 0, height: 2 }, textAlign: 'center' },
  panel: { alignSelf: 'stretch', borderRadius: 16, borderWidth: 1, borderColor: '#ffd23f66', backgroundColor: '#ffffff10', padding: 14, gap: 6, alignItems: 'center' },
  intro: { color: '#ff9ad6', fontSize: 15, fontWeight: '800', textAlign: 'center', letterSpacing: .5 },
  amountRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, justifyContent: 'center' },
  amount: { color: '#ffd23f', fontSize: 46, fontWeight: '900', textShadowColor: '#ff7a1a', textShadowRadius: 10 },
  amountLabel: { color: '#fff', fontSize: 16, fontWeight: '800' },
  body: { color: '#f1e6ff', fontSize: 14, lineHeight: 20, textAlign: 'center' },
  ribbon: { alignSelf: 'stretch', borderRadius: 999, paddingVertical: 9, paddingHorizontal: 14 },
  ribbonText: { color: '#fff', fontWeight: '800', textAlign: 'center', fontSize: 14 },
  actionTap: { alignSelf: 'stretch', marginTop: 4 },
  action: { borderRadius: 999, minHeight: 54, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 4, borderBottomColor: '#b94d00' },
  actionText: { color: '#3b1600', fontSize: 17, fontWeight: '900', letterSpacing: 1 },
  star: { position: 'absolute', color: '#ffe45c', textShadowColor: '#ff3cac', textShadowRadius: 8 },
  coin: { position: 'absolute', top: 0, width: 26, height: 26 },
  coinFace: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: '#b35900', alignItems: 'center', justifyContent: 'center' },
  coinMark: { color: '#8a4b00', fontWeight: '900', fontSize: 13 },
  envelope: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  envelopeIcon: { color: c.gold, fontSize: 24 },
  badge: { position: 'absolute', right: 2, top: 4, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, backgroundColor: c.pink, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: c.ink },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '900' },
  sheetShade: { flex: 1, backgroundColor: '#06011ab3' },
  sheet: { maxHeight: '78%', borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: '#b56cff66', paddingHorizontal: 16, paddingTop: 10 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 8 },
  sheetTitle: { flex: 1, color: '#fff', fontSize: 22, fontWeight: '800' },
  sheetLink: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 6 },
  sheetLinkText: { color: c.gold, fontWeight: '700' },
  sheetClose: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  message: { borderRadius: 14, borderWidth: 1, borderColor: '#b56cff40', backgroundColor: '#ffffff08', padding: 14, gap: 8 },
  messageUnread: { borderColor: '#ff3cac99', backgroundColor: '#ff3cac14' },
  messageHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.pink },
  messageTitle: { flex: 1, color: c.muted, fontWeight: '700', fontSize: 15 },
  messageTime: { color: c.faint, fontSize: 11 },
  messageBody: { color: '#f1e6ff', fontSize: 14, lineHeight: 21 },
  empty: { color: c.muted, textAlign: 'center', padding: 24 },
  megaphone: { fontSize: 48 },
  kicker: { color: '#ff9ad6', fontSize: 12, letterSpacing: 2, fontWeight: '800' },
  announceTitle: { color: '#ffe45c', fontSize: 24, fontWeight: '900', textAlign: 'center' },
  announceBody: { color: '#f1e6ff', fontSize: 15, lineHeight: 22, textAlign: 'center' },
  later: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 16 },
  laterText: { color: c.muted, fontWeight: '700' },
});
