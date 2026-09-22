import React, { useCallback, useEffect, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { ApiError, LimitKind, PlayerLimit, Protection, protection } from './api';
import { s } from './styles';
import { Tap } from './Tap';

/**
 * Play limits and breaks, the same controls the web cashier offers. The server owns the rules: a tighter limit
 * applies at once, a looser one or a removal waits out a cooling period, and a break cannot be shortened once
 * it starts. This screen only shows what the server says and sends what the player asked for.
 */
const WINDOW: Record<LimitKind, string> = {
  DEPOSIT_DAY: '24 hours', DEPOSIT_WEEK: '7 days', DEPOSIT_MONTH: '30 days',
  LOSS_DAY: '24 hours', LOSS_WEEK: '7 days', LOSS_MONTH: '30 days',
};
const COOL_OFF: [string, string][] = [['24h', '24 hours'], ['7d', '7 days'], ['30d', '30 days']];
const SELF_EXCLUSION: [string, string][] = [['6m', '6 months'], ['1y', '1 year'], ['5y', '5 years']];
const when = (iso: string) => new Date(iso).toLocaleString();

export function PlayLimits({ token, currency, onChanged }: { token: string; currency: string; onChanged?: () => void }) {
  const [view, setView] = useState<Protection | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [confirming, setConfirming] = useState<[string, string] | null>(null);
  const money = (value: number | null | undefined) => `${(value ?? 0).toFixed(2)} ${currency}`;

  const load = useCallback(async () => {
    try { setView(await protection.read(token)); setError(''); }
    catch (cause) { setError(cause instanceof ApiError ? cause.message : 'Could not load your limits.'); }
  }, [token]);
  useEffect(() => { void load(); }, [load]);

  async function save(kind: LimitKind, amount: number | null) {
    setBusy(kind); setError('');
    try { setView(await protection.setLimit(token, kind, amount)); onChanged?.(); }
    catch (cause) { setError(cause instanceof ApiError ? cause.message : 'Could not save that limit.'); }
    finally { setBusy(''); }
  }

  async function takeBreak(kind: 'COOL_OFF' | 'SELF_EXCLUSION', duration: string) {
    setBusy(duration); setError(''); setConfirming(null);
    try { setView(await protection.takeBreak(token, kind, duration)); onChanged?.(); }
    catch (cause) { setError(cause instanceof ApiError ? cause.message : 'Could not start that break.'); }
    finally { setBusy(''); }
  }

  if (!view) return <View style={s.card}><Text style={s.muted}>{error || 'Loading your limits…'}</Text>
    {!!error && <Tap onPress={() => void load()} style={s.secondary}><Text style={s.secondaryText}>Retry</Text></Tap>}</View>;

  const active = view.activeBreak;
  const of = (prefix: string) => view.limits.filter(limit => limit.kind.startsWith(prefix));

  return <View style={{ gap: 16 }}>
    <View>
      <Text style={s.title}>Your limits</Text>
      <Text style={s.muted}>Set what you can deposit or lose. A lower limit starts now; raising or removing one
        waits {view.coolingHours} hours, so a decision made today still holds tomorrow.</Text>
    </View>
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}

    <Text style={s.kicker}>DEPOSIT LIMITS</Text>
    {of('DEPOSIT').map(limit => <Limit key={limit.kind} limit={limit} busy={busy === limit.kind} money={money} onSave={save} />)}

    <Text style={s.kicker}>LOSS LIMITS</Text>
    <Text style={s.small}>Loss is what you staked minus what you won. Free spins never count.</Text>
    {of('LOSS').map(limit => <Limit key={limit.kind} limit={limit} busy={busy === limit.kind} money={money} onSave={save} />)}

    <Text style={s.kicker}>TAKE A BREAK</Text>
    {active && <View style={s.card}><Text style={s.accent}>
      {active.kind === 'SELF_EXCLUSION' ? 'You are self-excluded' : 'You are on a break'}{' '}
      {active.permanent ? 'permanently' : active.endsAt ? `until ${when(active.endsAt)}` : ''}.
    </Text><Text style={s.small}>You can make a break longer, never shorter.</Text></View>}

    {!active?.permanent && <>
      <Text style={s.small}>A short pause. You can still sign in; you cannot play or deposit.</Text>
      <View style={s.buttonRow}>{COOL_OFF.map(([code, label]) =>
        <Tap key={code} accessibilityRole="button" accessibilityLabel={`Cool off for ${label}`} disabled={!!busy}
          onPress={() => setConfirming(['COOL_OFF', code])} style={s.secondary}><Text style={s.secondaryText}>{label}</Text></Tap>)}</View>

      <Text style={s.small}>Self-exclusion, for a longer break from gambling. It cannot be undone.</Text>
      <View style={s.buttonRow}>{SELF_EXCLUSION.map(([code, label]) =>
        <Tap key={code} accessibilityRole="button" accessibilityLabel={`Self-exclude for ${label}`} disabled={!!busy}
          onPress={() => setConfirming(['SELF_EXCLUSION', code])} style={[s.secondary, s.danger]}><Text style={s.dangerText}>{label}</Text></Tap>)}</View>
    </>}

    {confirming && <View style={s.card}>
      <Text style={s.gameName}>{confirming[0] === 'SELF_EXCLUSION' ? 'Self-exclude' : 'Take a break'} for {
        [...COOL_OFF, ...SELF_EXCLUSION].find(([code]) => code === confirming[1])?.[1]}?</Text>
      <Text style={s.muted}>{confirming[0] === 'SELF_EXCLUSION'
        ? 'You will not be able to play or deposit for the whole period, and it cannot be shortened or cancelled.'
        : 'You will not be able to play or deposit until it ends. It cannot be shortened.'}</Text>
      <View style={s.buttonRow}>
        <Tap onPress={() => setConfirming(null)} style={s.secondary}><Text style={s.secondaryText}>Cancel</Text></Tap>
        <Tap disabled={!!busy} onPress={() => void takeBreak(confirming[0] as 'COOL_OFF' | 'SELF_EXCLUSION', confirming[1])}
          style={[s.secondary, s.danger]}><Text style={s.dangerText}>{busy ? 'Starting…' : 'Yes, start it'}</Text></Tap>
      </View>
    </View>}
  </View>;
}

function Limit({ limit, busy, money, onSave }: {
  limit: PlayerLimit; busy: boolean; money: (value: number | null | undefined) => string;
  onSave: (kind: LimitKind, amount: number | null) => void;
}) {
  const [value, setValue] = useState('');
  const label = `${limit.kind.startsWith('DEPOSIT') ? 'Deposits' : 'Losses'} in ${WINDOW[limit.kind]}`;
  const amount = Number(value);
  // The server takes two decimals and at least 1.00; say no here rather than send it and fail.
  const valid = value.trim() !== '' && Number.isFinite(amount) && amount >= 1 && Math.round(amount * 100) === amount * 100;

  return <View style={s.card}>
    <Text style={s.gameName}>{label}</Text>
    <Text style={s.small}>{limit.amount == null ? 'No limit set'
      : `Limit ${money(limit.amount)} · used ${money(limit.used)} · ${money(limit.remaining)} left`}</Text>
    {!!limit.pendingEffectiveAt && <Text style={s.accent}>
      {limit.pendingRemoval ? 'Removal' : `Change to ${money(limit.pendingAmount)}`} takes effect {when(limit.pendingEffectiveAt)}
    </Text>}
    <View style={s.buttonRow}>
      <TextInput accessibilityLabel={`${label} limit`} value={value} onChangeText={setValue} keyboardType="decimal-pad"
        placeholder={limit.amount == null ? 'Set limit' : 'New limit'} placeholderTextColor="#96909e"
        style={[s.input, { flex: 1, minWidth: 120 }]} />
      <Tap accessibilityLabel={`Save ${label} limit`} disabled={!valid || busy}
        onPress={() => { onSave(limit.kind, amount); setValue(''); }}
        style={[s.secondary, (!valid || busy) && s.disabled]}><Text style={s.secondaryText}>{busy ? 'Saving…' : 'Save'}</Text></Tap>
    </View>
    {limit.amount != null && !limit.pendingRemoval && <Tap accessibilityLabel={`Remove ${label} limit`}
      disabled={busy} onPress={() => onSave(limit.kind, null)} style={s.inlineButton}><Text style={s.link}>Remove this limit</Text></Tap>}
  </View>;
}
