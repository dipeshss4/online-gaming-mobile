import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { API_URL, ApiError, Auth, Balance, Bet, Game, Identity, Page, request, session, Transaction } from './api';
import { s } from './styles';
import { NativeSlots, supportsNativeSlots } from './NativeSlots';
import { NativeRoulette } from './NativeRoulette';
import { NativeCrash } from './NativeCrash';
import { StripeDeposit } from './StripeDeposit';
import { AuthLook, Brand, Site, WebLobby } from './WebLook';

type Tab = 'Discover' | 'Wallet' | 'Activity' | 'Account';
const money = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 });
function Button({ title, onPress, disabled = false }: { title: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [s.button, (disabled || pressed) && { opacity: .5 }]}><Text style={s.buttonText}>{title}</Text></Pressable>;
}
function Field({ value, set, placeholder, secret = false }: { value: string; set: (v: string) => void; placeholder: string; secret?: boolean }) {
  return <TextInput accessibilityLabel={placeholder} placeholder={placeholder} placeholderTextColor="#8893a7" value={value} onChangeText={set} secureTextEntry={secret} autoCapitalize="none" autoCorrect={false} keyboardType={placeholder === 'Email address' ? 'email-address' : 'default'} style={s.input} />;
}
export default function App() { return <SafeAreaProvider><Main /></SafeAreaProvider>; }
function Main() {
  const [token, setToken] = useState<string | null>(null), [identity, setIdentity] = useState<Identity | null>(null);
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [register, setRegister] = useState(false);
  const [tab, setTab] = useState<Tab>('Discover'), [games, setGames] = useState<Game[]>([]), [balance, setBalance] = useState<Balance | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]), [bets, setBets] = useState<Bet[]>([]);
  const [search, setSearch] = useState(''), [selected, setSelected] = useState<Game | null>(null);
  const [currentPassword, setCurrentPassword] = useState(''), [newPassword, setNewPassword] = useState('');
  const generation = useRef(0);
  const [site, setSite] = useState<Site | null>(null);
  const [siteError, setSiteError] = useState('');
  async function loadSite() { try { setSite(await request<Site>('/api/site')); setSiteError(''); } catch { setSiteError('Cannot load site branding. Please retry.'); } }
  useEffect(() => { void loadSite(); const listener = AppState.addEventListener('change', state => { if (state === 'active') void loadSite(); }); return () => listener.remove(); }, []);
  async function clearSession() {
    generation.current++;
    setToken(null); setIdentity(null); setBalance(null); setGames([]); setTransactions([]); setBets([]); setSelected(null); setCurrentPassword(''); setNewPassword(''); setPassword(''); setTab('Discover');
    await session.clear();
  }
  useEffect(() => { session.read().then(async saved => {
    if (saved) { const me = await request<Identity>('/api/auth/me', saved); setIdentity(me); setToken(saved); }
  }).catch(async e => { if (e instanceof ApiError && e.status === 401) await session.clear(); setError(e.message); }).finally(() => setReady(true)); }, []);
  async function load() {
    if (!token) return;
    const version = ++generation.current;
    setBusy(true); setError('');
    try {
      const me = await request<Identity>('/api/auth/me', token);
      const data = await Promise.all([
        request<Game[]>('/api/games', token), request<Balance>('/api/wallet', token),
        request<Page<Transaction>>('/api/wallet/transactions?page=0&size=20', token), request<Page<Bet>>('/api/bets?page=0&size=20', token),
      ]);
      if (version !== generation.current) return;
      setIdentity(me); setGames(data[0]); setBalance(data[1]); setTransactions(data[2].items); setBets(data[3].items);
    } catch (e) {
      if (version !== generation.current) return;
      if (e instanceof ApiError && e.status === 401) await clearSession();
      setError(e instanceof Error ? e.message : 'Unable to load account');
    } finally { setBusy(false); }
  }
  useEffect(() => { if (token) void load(); }, [token]);
  useEffect(() => { const listener = AppState.addEventListener('change', state => { if (state === 'active' && token) void load(); }); return () => listener.remove(); }, [token]);
  async function authenticate() {
    if (!email.trim() || password.length < 8) { setError('Enter your email and a password of at least 8 characters.'); return; }
    setBusy(true); setError('');
    try { const auth = await request<Auth>(`/api/auth/${register ? 'register' : 'login'}`, null, { email: email.trim(), password }); await session.save(auth.accessToken); setIdentity(auth); setToken(auth.accessToken); setPassword(''); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function logout() {
    setBusy(true); setError('');
    try { await request('/api/auth/logout', token, {}); await clearSession(); }
    catch (e) { if (e instanceof ApiError && e.status === 401) await clearSession(); else setError('Server logout failed. Retry to revoke all sessions.'); }
    finally { setBusy(false); }
  }
  function confirmLogout() {
    if (Platform.OS === 'web') {
      if (window.confirm('Sign out all devices? This also signs you out of the web app.')) void logout();
    } else {
      Alert.alert('Sign out all devices?', 'This also signs you out of the web app.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Sign out', onPress: logout }]);
    }
  }
  async function changePassword() {
    if (newPassword.length < 12 || newPassword.length > 72) { setError('New password must be 12–72 characters.'); return; }
    setBusy(true); setError('');
    try { await request('/api/auth/password', token, { currentPassword, newPassword }); await clearSession(); setError('Password changed. Please sign in again.'); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  if (!site) return <SafeAreaView style={s.root}><View style={s.content}><Text style={s.muted}>{siteError || 'Loading…'}</Text>{!!siteError && <Button title="Retry" onPress={loadSite}/>}</View></SafeAreaView>;
  if (!ready) return <SafeAreaView style={s.root}><ActivityIndicator color="#efd49b" /></SafeAreaView>;
  return <SafeAreaView style={s.root}><StatusBar style="light" /><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    {!token ? <AuthLook site={site}>
      <Text style={s.kicker}>{site.content.signIn.formKicker}</Text>
      <Text style={[s.title,{fontFamily:Platform.OS==='android'?'serif':'Georgia',fontSize:32}]}>{register ? site.content.signIn.registerTitle : site.content.signIn.loginTitle}</Text><Text style={s.muted}>{register ? site.content.signIn.registerSubtitle : site.content.signIn.loginSubtitle}</Text>
      <Text style={s.kicker}>EMAIL ADDRESS</Text><Field value={email} set={setEmail} placeholder="Email address" /><Text style={s.kicker}>PASSWORD</Text><Field value={password} set={setPassword} placeholder="Password" secret />
      {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
      {register&&!site.registrationEnabled&&<Text style={s.error}>{site.content.signIn.registrationClosed}</Text>}
      <Button title={busy ? 'Processing…' : register ? 'Create Account' : 'Sign In'} onPress={authenticate} disabled={busy||(register&&!site.registrationEnabled)} />
      <Pressable disabled={busy} onPress={() => { setRegister(!register); setError(''); }}><Text style={s.link}>{register ? 'Already registered? Sign in' : 'New here? Create an account'}</Text></Pressable>
    </AuthLook> : <>
      <View style={s.header}><Brand site={site}/><Pressable accessibilityRole="button" accessibilityLabel="Open account" onPress={()=>setTab('Account')}><Text style={s.accent}>◎</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Open wallet" onPress={()=>setTab('Wallet')} style={s.pill}><Text style={[s.small,{fontSize:6}]}>{site.content.brand.creditsLabel}</Text><Text style={s.accent}>{balance ? `${money(balance.balance)} ${balance.currency}` : 'Wallet —'}</Text></Pressable></View>
      <ScrollView key={tab} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={busy} onRefresh={load} tintColor="#efd49b" />}>
        {!!error && <View style={s.card}><Text accessibilityRole="alert" style={s.error}>{error}</Text><Button title="Retry" onPress={load} disabled={busy} /></View>}
        {tab === 'Discover' && <><Button title="＋ Load funds · Stripe test" onPress={()=>setTab('Wallet')}/><WebLobby site={site} games={games} onPlay={setSelected}/></>}
        {tab === 'Wallet' && <><Text style={s.title}>Your wallet</Text><View style={s.hero}><Text style={s.kicker}>AVAILABLE BALANCE</Text><Text style={s.heroTitle}>{balance ? money(balance.balance) : '—'}</Text><Text style={s.accent}>{balance?.currency || ''} · {balance?.status || 'Account wallet'}</Text>{!!balance?.held && <Text style={s.muted}>Held: {money(balance.held)}</Text>}</View>{identity&&<StripeDeposit token={token} userId={identity.userId} onRefresh={()=>{void load();}}/>}<Text style={s.title}>Recent transactions</Text><Text style={s.small}>Latest 20 entries · Pull to refresh</Text>{transactions.map(t => <View style={s.row} key={t.id}><View style={s.grow}><Text style={s.gameName}>{t.description || t.type}</Text><Text style={s.small}>{new Date(t.createdAt).toLocaleString()}</Text></View><Text style={t.type === 'CREDIT' ? s.accent : s.muted}>{t.type === 'CREDIT' ? '+' : '−'}{money(t.amount)}</Text></View>)}{!transactions.length && <Text style={s.muted}>No transactions yet.</Text>}</>}
        {tab === 'Activity' && <><Text style={s.title}>Your activity</Text><Text style={s.muted}>Latest 20 bets from your account. No simulated players or results.</Text>{bets.map(b => <View style={s.card} key={b.betId}><Text style={s.gameName}>{b.gameCode.replaceAll('_', ' ')}</Text><Text style={s.small}>{b.status} · {b.settledAt ? new Date(b.settledAt).toLocaleString() : 'Pending'}</Text><View style={s.row}><Text style={s.muted}>Stake {money(b.stake)}</Text><Text style={s.accent}>Payout {money(b.payout)}</Text></View></View>)}{!bets.length && <Text style={s.muted}>Your bet history will appear here.</Text>}</>}
        {tab === 'Account' && <><Text style={s.title}>Your account</Text><View style={s.card}><Text style={s.gameName}>{identity?.email}</Text><Text style={s.accent}>{identity?.role}</Text><Text style={s.small}>Access is controlled by your backend. Admin management remains in the web panel.</Text></View><Text style={s.title}>Security</Text><Text style={s.muted}>Changing your password signs out all devices.</Text><Field value={currentPassword} set={setCurrentPassword} placeholder="Current password" secret /><Field value={newPassword} set={setNewPassword} placeholder="New password (12–72 characters)" secret /><Button title="Update password" onPress={changePassword} disabled={busy || !currentPassword || !newPassword} /><Text style={s.small}>Sign out below revokes all sessions for this account.</Text><Button title="Sign out all devices" disabled={busy} onPress={confirmLogout} /></>}
      </ScrollView><View style={s.tabs}>{(['Discover', 'Wallet', 'Activity'] as Tab[]).map((t, i) => <Pressable accessibilityRole="tab" accessibilityState={{ selected: tab === t }} key={t} onPress={() => setTab(t)} style={s.tab}><Text style={[s.tabIcon, tab === t && s.accent]}>{['⌂', '▤', '◷'][i]}</Text><Text style={[s.small, tab === t && s.accent]}>{t==='Discover'?'Home':t==='Activity'?'History':t}</Text></Pressable>)}</View>
    </>}
    <Modal visible={!!selected} animationType="slide" onRequestClose={() => { if (!selected || !(supportsNativeSlots(selected) || selected.engine?.layout === 'ROULETTE' || selected.code === 'ASCENT_CRASH')) setSelected(null); }}><SafeAreaView style={s.root}>{selected && token && identity && selected.code === 'ASCENT_CRASH' ? <NativeCrash key={selected.code} game={selected} token={token} userId={identity.userId} onClose={()=>{setSelected(null);void load();}} onSettled={()=>{void load();}}/> : selected && token && identity && selected.engine?.layout === 'ROULETTE' ? <NativeRoulette key={selected.code} game={selected} token={token} userId={identity.userId} initialBalance={balance} onClose={()=>{setSelected(null);void load();}} onSettled={()=>{void load();}}/> : selected && token && identity && supportsNativeSlots(selected) ? <NativeSlots key={selected.code} game={selected} token={token} userId={identity.userId} initialBalance={balance} onClose={() => { setSelected(null); void load(); }} onSettled={() => { void load(); }} /> : <ScrollView contentContainerStyle={s.content}><Button title="← Back to games" onPress={() => setSelected(null)} /><Text style={s.heroTitle}>{selected?.name}</Text><Text style={s.muted}>{selected?.description}</Text><View style={s.card}><Text style={s.kicker}>SERVER STAKE LIMITS</Text><Text style={s.title}>{selected?.minStake} – {selected?.maxStake}</Text></View>{selected?.engine?.rules?.map((rule, i) => <Text key={i} style={s.muted}>• {rule}</Text>)}<View style={s.card}><Text style={s.gameName}>Native game screen · Coming next</Text><Text style={s.muted}>This milestone supports browsing only. No stake is placed and no wallet balance is changed from this screen.</Text></View></ScrollView>}</SafeAreaView></Modal>
  </KeyboardAvoidingView></SafeAreaView>;
}
