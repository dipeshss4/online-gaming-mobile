import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, KeyboardAvoidingView, Modal, Platform, RefreshControl, ScrollView, useWindowDimensions, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { API_URL, ApiError, Auth, Balance, Game, Identity, Page, onRenewed, request, session, Transaction } from './api';
import { HistoryScreen } from './GameHistory';
import { s } from './styles';
import { NativeSlots, supportsNativeSlots } from './NativeSlots';
import { NativeRoulette } from './NativeRoulette';
import { NativeCrash } from './NativeCrash';
import { StripeDeposit } from './StripeDeposit';
import { PlayLimits } from './PlayLimits';
import { Withdraw } from './Withdraw';
import { FloorBoards, FloorTotals, useFloor } from './FloorNow';
import { AuthLook, Brand, Site, WebLobby } from './WebLook';
import { Tap } from './Tap';
import { Feel, c } from './theme';
import { LobbySkeleton } from './Skeleton';

type Tab = 'Discover' | 'Wallet' | 'Activity' | 'Account';
/** The cashier's panes, in the order the web wallet uses them. */
type Cash = 'Deposit' | 'Withdraw' | 'Activity' | 'Limits';
const money = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 });
function Button({ title, onPress, disabled = false, haptic }: { title: string; onPress: () => void; disabled?: boolean; haptic?: Feel }) {
  return <Tap haptic={haptic} disabled={disabled} onPress={onPress} style={s.button}><Text style={s.buttonText}>{title}</Text></Tap>;
}
function Field({ value, set, placeholder, secret = false }: { value: string; set: (v: string) => void; placeholder: string; secret?: boolean }) {
  return <TextInput accessibilityLabel={placeholder} placeholder={placeholder} placeholderTextColor="#8893a7" value={value} onChangeText={set} secureTextEntry={secret} autoCapitalize="none" autoCorrect={false} keyboardType={placeholder === 'Email address' ? 'email-address' : 'default'} style={s.input} />;
}
export default function App() { return <SafeAreaProvider><Main /></SafeAreaProvider>; }
function Main() {
  const {width,height}=useWindowDimensions();
  const landscape=width>height;
  const [token, setToken] = useState<string | null>(null), [identity, setIdentity] = useState<Identity | null>(null);
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [register, setRegister] = useState(false);
  const [tab, setTab] = useState<Tab>('Discover'), [games, setGames] = useState<Game[]>([]), [balance, setBalance] = useState<Balance | null>(null);
  const [cash, setCash] = useState<Cash>('Deposit');
  // One poll for the floor, shown in two places: the pulse above the games, the boards below them.
  const floor = useFloor(token || '');
  const [transactions, setTransactions] = useState<Transaction[]>([]), [loads, setLoads] = useState(0);
  const [search, setSearch] = useState(''), [selected, setSelected] = useState<Game | null>(null);
  const [currentPassword, setCurrentPassword] = useState(''), [newPassword, setNewPassword] = useState('');
  const generation = useRef(0);
  const [site, setSite] = useState<Site | null>(null);
  const [siteError, setSiteError] = useState('');
  async function loadSite() { try { setSite(await request<Site>('/api/site')); setSiteError(''); } catch (e) { setSiteError(e instanceof ApiError && [401,404].includes(e.status) ? 'The configured backend does not expose the public site configuration required by this mobile version. Deploy the compatible backend before signing in.' : 'Cannot load site branding. Please retry.'); } }
  useEffect(() => { void loadSite(); const listener = AppState.addEventListener('change', state => { if (state === 'active') void loadSite(); }); return () => listener.remove(); }, []);
  async function clearSession() {
    generation.current++;
    setToken(null); setIdentity(null); setBalance(null); setGames([]); setTransactions([]); setSelected(null); setCurrentPassword(''); setNewPassword(''); setPassword(''); setTab('Discover');
    await session.clear();
  }
  // The session renews itself in api.ts; this keeps the token held here in step with it.
  useEffect(() => { onRenewed(next => setToken(next)); return () => onRenewed(null); }, []);
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
        request<Page<Transaction>>('/api/wallet/transactions?page=0&size=20', token),
      ]);
      if (version !== generation.current) return;
      setIdentity(me); setGames(data[0]); setBalance(data[1]); setTransactions(data[2].items); setLoads(n => n + 1);
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
  // A restored session is checked with the server before anything is shown. That pause used to be a bare
  // spinner; the app's own chrome plus the shape of the lobby makes it read as opening rather than stalling.
  if (!ready) return <SafeAreaView style={s.root}><StatusBar style="light" />
    <View style={[s.header,landscape&&{paddingVertical:7}]}><Brand site={site}/><ActivityIndicator color={c.gold} /></View>
    <View style={s.content}><LobbySkeleton landscape={landscape}/></View></SafeAreaView>;
  return <SafeAreaView style={s.root}><StatusBar style="light" /><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    {!token ? <AuthLook site={site}>
      <Text style={s.kicker}>{site.content.signIn.formKicker}</Text>
      <Text style={[s.title,{fontFamily:Platform.OS==='android'?'serif':'Georgia',fontSize:32}]}>{register ? site.content.signIn.registerTitle : site.content.signIn.loginTitle}</Text><Text style={s.muted}>{register ? site.content.signIn.registerSubtitle : site.content.signIn.loginSubtitle}</Text>
      <Text style={s.kicker}>EMAIL ADDRESS</Text><Field value={email} set={setEmail} placeholder="Email address" /><Text style={s.kicker}>PASSWORD</Text><Field value={password} set={setPassword} placeholder="Password" secret />
      {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
      {register&&!site.registrationEnabled&&<Text style={s.error}>{site.content.signIn.registrationClosed}</Text>}
      <Button title={busy ? 'Processing…' : register ? 'Create Account' : 'Sign In'} onPress={authenticate} disabled={busy||(register&&!site.registrationEnabled)} />
      <Tap haptic="select" disabled={busy} onPress={() => { setRegister(!register); setError(''); }} style={s.inlineButton}><Text style={s.link}>{register ? 'Already registered? Sign in' : 'New here? Create an account'}</Text></Tap>
    </AuthLook> : <>
      <View style={[s.header,landscape&&{paddingVertical:7}]}><Brand site={site}/><Tap haptic="select" accessibilityLabel="Open account" onPress={()=>setTab('Account')} hitSlop={12} style={s.iconButton}><Text style={[s.accent,{fontSize:22}]}>◎</Text></Tap><Tap haptic="select" accessibilityLabel="Open wallet" onPress={()=>setTab('Wallet')} style={s.pill}><Text style={s.small}>{site.content.brand.creditsLabel}</Text><Text style={s.accent}>{balance ? `${money(balance.balance)} ${balance.currency}` : 'Wallet —'}</Text></Tap></View>
      <View style={{flex:1,flexDirection:landscape?'row-reverse':'column'}}><ScrollView style={{flex:1}} key={tab} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={busy} onRefresh={load} tintColor="#efd49b" />}>
        {!!error && <View style={s.card}><Text accessibilityRole="alert" style={s.error}>{error}</Text><Button title="Retry" onPress={load} disabled={busy} /></View>}
        {tab === 'Discover' && <>{!!token && <FloorTotals floor={floor} currency={balance?.currency || 'USD'} />}{!games.length && busy ? <LobbySkeleton landscape={landscape}/> : <WebLobby site={site} games={games} onPlay={setSelected}/>}{!!token && <FloorBoards floor={floor} />}{!landscape&&<Button title="＋ Load funds · Stripe test" onPress={()=>setTab('Wallet')}/>}</>}
        {tab === 'Wallet' && <>
          <Text style={s.title}>Your wallet</Text>
          <View style={[s.hero]}><Text style={s.kicker}>AVAILABLE BALANCE</Text><Text style={s.heroTitle}>{balance ? money(balance.balance) : '—'}</Text><Text style={s.accent}>{balance?.currency || ''} · {balance?.status || 'Account wallet'}</Text>
            {/* Money held for a withdrawal under review is still the player's; it just cannot be staked. */}
            {!!balance?.held && <Text style={s.muted}>Held for withdrawal: {money(balance.held)} — not available to play with.</Text>}</View>
          {/* Two by two on a phone: "Withdraw" needs its own width, and a lone button on a second row reads as a mistake. */}
          <View style={s.buttonRow}>{(['Deposit', 'Withdraw', 'Activity', 'Limits'] as Cash[]).map(pane =>
            <Tap key={pane} haptic="select" accessibilityRole="tab" accessibilityState={{ selected: cash === pane }} onPress={() => setCash(pane)}
              style={[s.secondary, { flexGrow: 1, minWidth: '46%' }, cash === pane && { borderColor: c.gold, backgroundColor: c.surfaceLift }]}>
              <Text style={s.secondaryText}>{pane}</Text></Tap>)}</View>
          {cash === 'Deposit' && identity && <StripeDeposit token={token} userId={identity.userId} onRefresh={()=>{void load();}}/>}
          {cash === 'Withdraw' && <Withdraw token={token} balance={balance} onChanged={()=>{void load();}} />}
          {cash === 'Activity' && <><Text style={s.title}>Recent transactions</Text><Text style={s.small}>Latest 20 entries · Pull to refresh</Text>{transactions.map(t => <View style={s.row} key={t.id}><View style={s.grow}><Text style={s.gameName}>{t.description || t.type}</Text><Text style={s.small}>{new Date(t.createdAt).toLocaleString()}</Text></View><Text style={t.type === 'CREDIT' ? s.accent : s.muted}>{t.type === 'CREDIT' ? '+' : '−'}{money(t.amount)}</Text></View>)}{!transactions.length && <Text style={s.muted}>No transactions yet.</Text>}</>}
          {cash === 'Limits' && <PlayLimits token={token} currency={balance?.currency || 'USD'} onChanged={()=>{void load();}} />}
        </>}
        {tab === 'Activity' && token && <HistoryScreen token={token} games={games} refresh={loads} />}
        {tab === 'Account' && <><Text style={s.title}>Your account</Text><View style={s.card}><Text style={s.gameName}>{identity?.email}</Text><Text style={s.accent}>{identity?.role}</Text><Text style={s.small}>Access is controlled by your backend. Admin management remains in the web panel.</Text></View><Text style={s.title}>Security</Text><Text style={s.muted}>Changing your password signs out all devices.</Text><Field value={currentPassword} set={setCurrentPassword} placeholder="Current password" secret /><Field value={newPassword} set={setNewPassword} placeholder="New password (12–72 characters)" secret /><Button title="Update password" onPress={changePassword} disabled={busy || !currentPassword || !newPassword} /><Text style={s.small}>Sign out below revokes all sessions for this account.</Text><Button title="Sign out all devices" disabled={busy} onPress={confirmLogout} /></>}
      </ScrollView><View style={[s.tabs,landscape&&{width:76,flexDirection:'column',borderRightWidth:1,borderRightColor:'#bba16a2b',paddingVertical:8}]}>{(['Discover', 'Wallet', 'Activity'] as Tab[]).map((t, i) => <Tap haptic="select" accessibilityRole="tab" accessibilityState={{ selected: tab === t }} key={t} onPress={() => setTab(t)} style={[s.tab,landscape&&{flex:0,flexShrink:0,minHeight:72,paddingVertical:10}]}><View style={[s.tabMark, tab === t && s.tabMarkOn]}/><Text style={[s.tabIcon, tab === t && s.accent]}>{['⌂', '▤', '◷'][i]}</Text><Text style={[s.small, tab === t && s.accent]}>{t==='Discover'?'Home':t==='Activity'?'History':t}</Text></Tap>)}</View></View>
    </>}
    <Modal supportedOrientations={['landscape-left','landscape-right']} visible={!!selected} animationType="slide" onRequestClose={() => { if (!selected || !(supportsNativeSlots(selected) || selected.engine?.layout === 'ROULETTE' || selected.code === 'ASCENT_CRASH')) setSelected(null); }}><SafeAreaView style={s.root}>{selected && token && identity && selected.code === 'ASCENT_CRASH' ? <NativeCrash key={selected.code} game={selected} token={token} userId={identity.userId} onClose={()=>{setSelected(null);void load();}} onSettled={()=>{void load();}}/> : selected && token && identity && selected.engine?.layout === 'ROULETTE' ? <NativeRoulette key={selected.code} game={selected} token={token} userId={identity.userId} initialBalance={balance} onClose={()=>{setSelected(null);void load();}} onSettled={()=>{void load();}}/> : selected && token && identity && supportsNativeSlots(selected) ? <NativeSlots key={selected.code} game={selected} token={token} userId={identity.userId} initialBalance={balance} onClose={() => { setSelected(null); void load(); }} onSettled={() => { void load(); }} /> : <ScrollView contentContainerStyle={s.content}><Button title="← Back to games" onPress={() => setSelected(null)} /><Text style={s.heroTitle}>{selected?.name}</Text><Text style={s.muted}>{selected?.description}</Text><View style={s.card}><Text style={s.kicker}>SERVER STAKE LIMITS</Text><Text style={s.title}>{selected?.minStake} – {selected?.maxStake}</Text></View>{selected?.engine?.rules?.map((rule, i) => <Text key={i} style={s.muted}>• {rule}</Text>)}<View style={s.card}><Text style={s.gameName}>Native game screen · Coming next</Text><Text style={s.muted}>This milestone supports browsing only. No stake is placed and no wallet balance is changed from this screen.</Text></View></ScrollView>}</SafeAreaView></Modal>
  </KeyboardAvoidingView></SafeAreaView>;
}
