import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Linking, Text, TextInput, View } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { ApiError, Balance, PaymentMethod, PayoutAccount, Withdrawal, payments } from './api';
import { s } from './styles';
import { Tap } from './Tap';

/**
 * Taking money out, the same three steps the web cashier offers: request (the amount is held and leaves the
 * available balance), review by staff, then payout. Only the server decides any of it — this screen shows what
 * it says and sends what the player asked for.
 *
 * A withdrawal is money, so the safeguards here are deliberate: the requestId is reused on a retry so a second
 * tap cannot become a second withdrawal, and a link to a processor's page is checked before it is opened.
 */
const when = (iso: string) => new Date(iso).toLocaleString();
const money = (value: number, currency: string) => `${value.toFixed(2)} ${currency}`;
/** What the player is told each status means. The words match the web cashier. */
const MEANING: Record<Withdrawal['status'], string> = {
  REQUESTED: 'On hold, waiting to be reviewed. You can still cancel it.',
  SUBMITTED: 'Approved and sent to the payment provider.',
  PAID: 'Paid out.',
  REJECTED: 'Not approved. The money is back in your balance.',
  CANCELLED: 'You cancelled it. The money is back in your balance.',
  FAILED: 'The provider could not pay it. The money is back in your balance.',
};

export function Withdraw({ token, balance, onChanged }: { token: string; balance: Balance | null; onChanged?: () => void }) {
  const [methods, setMethods] = useState<PaymentMethod[] | null>(null);
  const [requests, setRequests] = useState<Withdrawal[]>([]);
  const [provider, setProvider] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  // What the server said about the last thing the player did, shown beside the control they used. A refusal
  // printed at the top of a long screen is a tap that appears to do nothing.
  const [said, setSaid] = useState<{ where: 'form' | 'list'; bad: boolean; text: string } | null>(null);
  const alive = useRef(true);
  // Reused while the player is asking for the same money, so a retry after a dropped connection cannot become a
  // second withdrawal. It is thrown away once the server has accepted the request.
  const attempt = useRef({ key: '', id: '' });

  const load = useCallback(async () => {
    try {
      const [catalog, list] = await Promise.all([payments.methods(token), payments.withdrawals(token)]);
      if (!alive.current) return;
      const payable = catalog.methods.filter(method => method.withdrawals);
      setMethods(payable);
      setRequests(list);
      setProvider(current => payable.some(method => method.providerCode === current) ? current : payable[0]?.providerCode ?? '');
      setError('');
    } catch (cause) {
      if (alive.current) setError(cause instanceof ApiError ? cause.message : 'Could not load withdrawals.');
    }
  }, [token]);

  useEffect(() => { alive.current = true; void load(); return () => { alive.current = false; }; }, [load]);
  // Staff can approve or reject while the app sits in the background, and payout setup finishes on the
  // processor's own page — so the state is re-read whenever the player comes back.
  useEffect(() => {
    const listener = AppState.addEventListener('change', state => { if (state === 'active') void load(); });
    return () => listener.remove();
  }, [load]);

  const method = methods?.find(item => item.providerCode === provider);
  const payout = usePayoutAccount(token, method);
  const blocked = !!method?.payoutAccountRequired && payout.account?.status !== 'READY';
  const available = balance?.balance ?? 0;
  const currency = method?.currency || balance?.currency || 'USD';
  const value = Number(amount);
  const problem = useMemo(() => {
    if (!method || amount.trim() === '') return '';
    if (!/^\d+(\.\d{1,2})?$/.test(amount.trim())) return 'Enter an amount with at most two decimals.';
    if (value < method.minAmount) return `The smallest withdrawal is ${money(method.minAmount, method.currency)}.`;
    if (value > method.maxAmount) return `The largest withdrawal is ${money(method.maxAmount, method.currency)}.`;
    if (value > available) return `You have ${money(available, currency)} available.`;
    return '';
  }, [amount, method, value, available, currency]);

  async function submit() {
    if (!method || problem !== '' || amount.trim() === '' || busy) return;
    const key = `${method.providerCode}:${value}`;
    if (attempt.current.key !== key) attempt.current = { key, id: randomUUID() };
    setBusy('request'); setSaid(null);
    try {
      const withdrawal = await payments.withdraw(token, method.providerCode, value, attempt.current.id);
      attempt.current = { key: '', id: '' };
      if (!alive.current) return;
      setAmount('');
      setSaid({ where: 'form', bad: false, text: `${money(withdrawal.amount, withdrawal.currency)} is on hold until it is reviewed and paid.` });
      await load();
      onChanged?.();
    } catch (cause) {
      if (alive.current) setSaid({ where: 'form', bad: true, text: cause instanceof ApiError ? cause.message : 'Could not request that withdrawal.' });
    } finally { if (alive.current) setBusy(''); }
  }

  async function cancel(id: string) {
    setBusy(id); setSaid(null);
    try {
      await payments.cancelWithdrawal(token, id);
      if (!alive.current) return;
      setSaid({ where: 'list', bad: false, text: 'Withdrawal cancelled. The money is available again.' });
      await load();
      onChanged?.();
    } catch (cause) {
      if (alive.current) setSaid({ where: 'list', bad: true, text: cause instanceof ApiError ? cause.message : 'Could not cancel that withdrawal.' });
    } finally { if (alive.current) setBusy(''); }
  }

  if (!methods) return <View style={s.card}>
    <Text style={s.muted}>{error || 'Loading withdrawal options…'}</Text>
    {!!error && <Tap onPress={() => void load()} style={s.secondary}><Text style={s.secondaryText}>Retry</Text></Tap>}
  </View>;

  return <View style={{ gap: 16 }}>
    <View>
      <Text style={s.title}>Withdraw</Text>
      <Text style={s.muted}>Requesting puts the amount on hold: it leaves your available balance but stays in your
        ledger. Our team reviews it — you can cancel until then — and the provider pays it out.</Text>
    </View>
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}

    {!methods.length
      ? <View style={s.card}><Text style={s.gameName}>No withdrawal methods yet</Text>
          <Text style={s.muted}>Withdrawals become available once an operator connects a payout provider.</Text></View>
      : <View style={s.card}>
          <Text style={s.kicker}>PAY ME WITH</Text>
          <View style={s.buttonRow}>{methods.map(item => {
            const chosen = item.providerCode === provider;
            return <Tap key={item.providerCode} accessibilityRole="radio" accessibilityState={{ selected: chosen }}
              accessibilityLabel={`Withdraw with ${item.displayName}`} onPress={() => { setProvider(item.providerCode); setSaid(null); }}
              style={[s.secondary, chosen && { borderColor: '#ffd23f', backgroundColor: '#272026' }]}>
              <Text style={s.secondaryText}>{item.displayName}{item.sandbox ? ' · test' : ''}</Text>
            </Tap>;
          })}</View>

          {method?.payoutAccountRequired && <PayoutSetup token={token} method={method} state={payout} />}

          {/* Until the processor can actually pay this player, asking for an amount only leads to a refusal. */}
          {method && !blocked && <Amount method={method} amount={amount} setAmount={setAmount} problem={problem}
            available={available} currency={currency} busy={busy === 'request'} onSubmit={submit}
            said={said?.where === 'form' ? said : null} />}
        </View>}

    <Text style={s.kicker}>YOUR REQUESTS</Text>
    {said?.where === 'list' && <Text accessibilityRole={said.bad ? 'alert' : undefined} accessibilityLiveRegion="polite"
      style={said.bad ? s.error : s.accent}>{said.text}</Text>}
    {!requests.length && <Text style={s.muted}>Withdrawals you request appear here with their status.</Text>}
    {requests.map(item => <View key={item.id} style={s.card}>
      <View style={s.row}>
        <View style={s.grow}>
          <Text style={s.gameName}>{money(item.amount, item.currency)}</Text>
          <Text style={s.small}>{when(item.createdAt)}</Text>
        </View>
        <Text style={item.status === 'PAID' ? s.accent : s.muted}>{item.status}</Text>
      </View>
      <Text style={s.small}>{MEANING[item.status]}</Text>
      {!!(item.failureReason || item.reviewNote) && <Text style={s.muted}>{item.failureReason ?? item.reviewNote}</Text>}
      {item.status === 'REQUESTED' && <Tap accessibilityLabel={`Cancel withdrawal of ${money(item.amount, item.currency)}`}
        disabled={!!busy} onPress={() => void cancel(item.id)} style={[s.secondary, s.danger, !!busy && s.disabled]}>
        <Text style={s.dangerText}>{busy === item.id ? 'Cancelling…' : 'Cancel this request'}</Text></Tap>}
    </View>)}
  </View>;
}

function Amount({ method, amount, setAmount, problem, available, currency, busy, onSubmit, said }: {
  method: PaymentMethod; amount: string; setAmount: (value: string) => void; problem: string;
  available: number; currency: string; busy: boolean; onSubmit: () => void;
  said: { bad: boolean; text: string } | null;
}) {
  const ready = amount.trim() !== '' && problem === '';
  return <>
    <Text style={s.kicker}>AMOUNT</Text>
    <Text style={s.small}>{money(method.minAmount, method.currency)} – {money(method.maxAmount, method.currency)} ·
      you have {money(available, currency)} available</Text>
    <TextInput accessibilityLabel="Withdrawal amount" value={amount} onChangeText={setAmount} keyboardType="decimal-pad"
      placeholder="0.00" placeholderTextColor="#96909e" editable={!busy} style={s.input} />
    {!!problem && <Text style={s.error}>{problem}</Text>}
    <Tap disabled={!ready || busy} onPress={onSubmit}
      style={[s.button, (!ready || busy) && s.disabled]}>
      <Text style={s.buttonText}>{busy ? 'Requesting…' : 'Request withdrawal'}</Text></Tap>
    {/* Right under the button that caused it, so the answer is on screen wherever the player has scrolled to. */}
    {said && <Text accessibilityRole={said.bad ? 'alert' : undefined} accessibilityLiveRegion="polite"
      style={said.bad ? s.error : s.accent}>{said.text}</Text>}
    {method.sandbox && <Text style={s.small}>Test mode: no real money moves.</Text>}
  </>;
}

type PayoutState = { account: PayoutAccount | null; error: string; read: () => Promise<void> };

/** The payout account for methods that pay into one. Re-read when the player returns from the processor's page. */
function usePayoutAccount(token: string, method?: PaymentMethod): PayoutState {
  const [account, setAccount] = useState<PayoutAccount | null>(null);
  const [error, setError] = useState('');
  const alive = useRef(true);
  const code = method?.payoutAccountRequired ? method.providerCode : null;

  const read = useCallback(async () => {
    if (!code) return;
    try {
      const next = await payments.payoutAccount(token, code);
      if (!alive.current) return;
      setAccount(next); setError('');
    } catch (cause) {
      if (alive.current) setError(cause instanceof ApiError ? cause.message : 'Could not check your payout account.');
    }
  }, [token, code]);

  useEffect(() => { alive.current = true; setAccount(null); setError(''); void read(); return () => { alive.current = false; }; }, [read]);
  useEffect(() => {
    const listener = AppState.addEventListener('change', state => { if (state === 'active') void read(); });
    return () => listener.remove();
  }, [read]);

  return { account, error, read };
}

/**
 * Processors that pay into an account the player sets up first (Stripe Connect). Identity and bank details are
 * collected on the processor's own page and never reach this app.
 */
function PayoutSetup({ token, method, state }: { token: string; method: PaymentMethod; state: PayoutState }) {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  // "Continue on Card (Stripe)" is the method's name where the processor's name belongs; the web makes the same swap.
  const name = method.providerCode === 'STRIPE' ? 'Stripe' : method.displayName;
  const account = state.account;
  const error = failure || state.error;

  /**
   * Opens a link the backend got from the processor. It is checked first: an app that opens whatever URL an API
   * hands it is a phishing page waiting to happen, however much the API is trusted today.
   */
  async function open(get: () => Promise<{ url: string }>, whenItFails: string) {
    setBusy(true); setFailure('');
    try {
      const { url } = await get();
      const parsed = new URL(url);
      const host = parsed.hostname.toLowerCase();
      const allowed = method.providerCode === 'STRIPE' ? host === 'stripe.com' || host.endsWith('.stripe.com') : false;
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password || !allowed)
        throw new Error(`Blocked: ${name} returned a link this app does not recognise.`);
      await Linking.openURL(parsed.href);
    } catch (cause) {
      if (alive.current) setFailure(cause instanceof Error ? cause.message : whenItFails);
    } finally { if (alive.current) setBusy(false); }
  }

  if (error) return <View style={{ gap: 10 }}>
    <Text accessibilityRole="alert" style={s.error}>{error}</Text>
    <Tap onPress={() => { setFailure(''); void state.read(); }} style={s.secondary}>
      <Text style={s.secondaryText}>Try again</Text></Tap>
  </View>;
  if (!account) return <View style={s.buttonRow}><ActivityIndicator color="#efd49b" /><Text style={s.muted}>Checking your payout account…</Text></View>;

  if (account.status === 'READY') return <View style={{ gap: 8 }}>
    <Text style={s.small}>Paid to the payout account you set up with {name}.{account.sandbox ? ' Test mode: no real money moves.' : ''}</Text>
    <Tap disabled={busy} onPress={() => void open(() => payments.payoutDashboard(token, method.providerCode), `Could not open your ${name} dashboard.`)}
      style={s.inlineButton}><Text style={s.link}>{busy ? 'Opening…' : 'Manage payout details'}</Text></Tap>
  </View>;

  if (account.status === 'RESTRICTED') return <Text style={s.error}>
    {account.detail ?? `${name} cannot pay out to your account.`} Please contact support.</Text>;

  return <View style={{ gap: 10 }}>
    <Text style={s.gameName}>{account.status === 'NONE' ? `Set up payouts with ${name}` : 'Finish your payout setup'}</Text>
    <Text style={s.muted}>{account.status === 'NONE'
      ? `${name} pays withdrawals to your bank account or debit card. You confirm who you are and add where to be paid on ${name}'s own page — a few minutes, once.`
      : account.detail ?? `${name} needs a few more details before it can pay you.`}</Text>
    {account.sandbox && <Text style={s.small}>Test mode: use {name}'s test details. No real money moves.</Text>}
    <Tap disabled={busy} onPress={() => void open(() => payments.startPayoutSetup(token, method.providerCode), `Could not open ${name} payout setup.`)}
      style={[s.button, busy && s.disabled]}><Text style={s.buttonText}>{busy ? 'Opening…' : `Continue on ${name}`}</Text></Tap>
    {account.status === 'ONBOARDING' && <Tap onPress={() => void state.read()} style={s.inlineButton}>
      <Text style={s.link}>I finished — check again</Text></Tap>}
    <Text style={s.small}>{name} opens outside the app. Come back here when you are done.</Text>
  </View>;
}
