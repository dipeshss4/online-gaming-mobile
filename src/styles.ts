import { StyleSheet } from 'react-native';
export const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#12062b' }, auth: { padding: 24, gap: 18, flexGrow: 1 }, content: { padding: 14, gap: 16, paddingBottom: 32 },
  header: { paddingHorizontal: 20, paddingVertical: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  brand: { color: '#f4f6fa', fontSize: 14, fontWeight: '800', letterSpacing: 1.5 }, pill: { backgroundColor: '#2b1456', borderRadius: 20, padding: 10, flexShrink: 0, borderWidth: 1.5, borderColor: '#ffd23f99' },
  hero: { backgroundColor: '#3a0f5e', borderWidth: 1, borderColor: '#ff3cac66', borderRadius: 24, padding: 26, overflow: 'hidden', gap: 14 }, heroTitle: { color: '#fff2db', fontSize: 38, lineHeight: 43, fontWeight: '800' },
  kicker: { color: '#ff9ad6', fontSize: 11, letterSpacing: 1.4, fontWeight: '700' }, art: { position: 'absolute', right: 8, bottom: -30, color: '#9ab775', fontSize: 140, opacity: .18 },
  title: { color: '#f1f4f9', fontSize: 23, fontWeight: '700' }, muted: { color: '#c9b8e8', fontSize: 14, lineHeight: 22 }, small: { color: '#9a8cc4', fontSize: 11, lineHeight: 17 }, accent: { color: '#ffd23f', fontWeight: '600' },
  input: { backgroundColor: '#1c0b3d', borderWidth: 1, borderColor: '#b56cff40', borderRadius: 7, padding: 16, color: '#fff', fontSize: 16, minHeight: 54 },
  button: { backgroundColor: '#ffb01f', padding: 17, borderRadius: 999, alignItems: 'center', minHeight: 52, overflow: 'hidden', borderBottomWidth: 4, borderBottomColor: '#b94d00' }, buttonText: { color: '#3b1600', fontWeight: '900', fontSize: 15, letterSpacing: .5 }, link: { color: '#ffd23f', textAlign: 'center', padding: 12 }, error: { color: '#ffb5ad', lineHeight: 22 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 }, game: { width: '48%', flexGrow: 1, borderRadius: 20, padding: 17, gap: 12, minHeight: 205 }, symbol: { fontSize: 48, color: '#e9d9a7', textAlign: 'center' }, gameName: { color: '#f0f3f8', fontWeight: '700', fontSize: 16 },
  card: { backgroundColor: '#1c0b3d', borderWidth: 1, borderColor: '#b56cff40', borderRadius: 18, padding: 20, gap: 12 }, row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#33245a', gap: 12 }, grow: { flex: 1, gap: 6 },
  /* Secondary actions: readable, and large enough to hit without aiming. */
  secondary: { minHeight: 44, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 8, borderWidth: 1, borderColor: '#b56cff77', backgroundColor: '#22104a', alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: '#ffd23f', fontWeight: '700', fontSize: 14 },
  danger: { borderColor: '#d98a8a55', backgroundColor: '#241a1c' }, dangerText: { color: '#ffb5ad', fontWeight: '700', fontSize: 14 },
  disabled: { opacity: .45 },
  buttonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center' },
  inlineButton: { minHeight: 44, justifyContent: 'center' },
  /* Anything tapped needs a target a thumb can hit, whatever the glyph inside measures. */
  iconButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  tabs: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#b56cff40', backgroundColor: '#1a0a3a', paddingVertical: 10 }, tab: { flex: 1, alignItems: 'center', padding: 6, gap: 4 }, tabIcon: { color: '#9a8cc4', fontSize: 24 },
  /* The selected tab says so with a mark as well as a colour, for anyone who cannot pick gold out of grey. */
  tabMark: { height: 3, width: 22, borderRadius: 2, backgroundColor: 'transparent' }, tabMarkOn: { backgroundColor: '#ff3cac' },
});
