import React from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import type { FreeSpinGrant } from './api';
import { c } from './theme';

/** The strip over a slot's console while free spins wait on it: how many, at what stake, and a switch to use them. */
export function FreeSpinBanner({ grant, remaining, use, onUse, disabled }: { grant: FreeSpinGrant; remaining: number; use: boolean; onUse: (on: boolean) => void; disabled?: boolean }) {
  return <View style={f.row} accessibilityLabel={`${remaining} free spins at ${grant.stake.toFixed(2)}`}>
    <Text style={f.gift} accessibilityElementsHidden>🎁</Text>
    <Text style={f.text} numberOfLines={2}><Text style={f.strong}>{remaining} FREE {remaining === 1 ? 'SPIN' : 'SPINS'}</Text> at {grant.stake.toFixed(2)} · the stake is on us · until {new Date(grant.expiresAt).toLocaleDateString()}</Text>
    <Switch accessibilityLabel="Use free spins" value={use} onValueChange={onUse} disabled={disabled} trackColor={{ true: c.gold, false: '#3a2a5a' }} thumbColor="#fff" />
  </View>;
}

const f = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, borderWidth: 1.5, borderColor: c.gold, backgroundColor: '#3a2a04cc' },
  gift: { fontSize: 20 },
  text: { flex: 1, color: '#fff3c0', fontSize: 12 },
  strong: { color: c.gold, fontWeight: '900' },
});
