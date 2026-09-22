import { StyleSheet } from 'react-native';
export const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#111117' }, auth: { padding: 24, gap: 18, flexGrow: 1 }, content: { padding: 14, gap: 16, paddingBottom: 32 },
  header: { paddingHorizontal: 20, paddingVertical: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  brand: { color: '#f4f6fa', fontSize: 14, fontWeight: '800', letterSpacing: 1.5 }, pill: { backgroundColor: '#211d18', borderRadius: 20, padding: 10, flexShrink: 0 },
  hero: { backgroundColor: '#27171b', borderRadius: 24, padding: 26, overflow: 'hidden', gap: 14 }, heroTitle: { color: '#fff2db', fontSize: 38, lineHeight: 43, fontWeight: '800' },
  kicker: { color: '#bfa063', fontSize: 11, letterSpacing: 1.4, fontWeight: '700' }, art: { position: 'absolute', right: 8, bottom: -30, color: '#9ab775', fontSize: 140, opacity: .18 },
  title: { color: '#f1f4f9', fontSize: 23, fontWeight: '700' }, muted: { color: '#aaa1b1', fontSize: 14, lineHeight: 22 }, small: { color: '#938c9e', fontSize: 11, lineHeight: 17 }, accent: { color: '#efd49b', fontWeight: '600' },
  input: { backgroundColor: '#19171e', borderWidth: 1, borderColor: '#bba16a2b', borderRadius: 7, padding: 16, color: '#fff', fontSize: 16, minHeight: 54 },
  button: { backgroundColor: '#efd49b', padding: 17, borderRadius: 7, alignItems: 'center', minHeight: 52 }, buttonText: { color: '#271d11', fontWeight: '800', fontSize: 15 }, link: { color: '#efd49b', textAlign: 'center', padding: 12 }, error: { color: '#ffb5ad', lineHeight: 22 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 }, game: { width: '48%', flexGrow: 1, borderRadius: 20, padding: 17, gap: 12, minHeight: 205 }, symbol: { fontSize: 48, color: '#e9d9a7', textAlign: 'center' }, gameName: { color: '#f0f3f8', fontWeight: '700', fontSize: 16 },
  card: { backgroundColor: '#19171e', borderRadius: 18, padding: 20, gap: 12 }, row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#253044', gap: 12 }, grow: { flex: 1, gap: 6 },
  /* Secondary actions: readable, and large enough to hit without aiming. */
  secondary: { minHeight: 44, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 8, borderWidth: 1, borderColor: '#bba16a55', backgroundColor: '#1d1a22', alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: '#efd49b', fontWeight: '700', fontSize: 14 },
  danger: { borderColor: '#d98a8a55', backgroundColor: '#241a1c' }, dangerText: { color: '#ffb5ad', fontWeight: '700', fontSize: 14 },
  disabled: { opacity: .45 },
  buttonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center' },
  inlineButton: { minHeight: 44, justifyContent: 'center' },
  /* Anything tapped needs a target a thumb can hit, whatever the glyph inside measures. */
  iconButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  tabs: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#bba16a2b', backgroundColor: '#15151c', paddingVertical: 10 }, tab: { flex: 1, alignItems: 'center', padding: 6, gap: 4 }, tabIcon: { color: '#8794a8', fontSize: 24 },
  /* The selected tab says so with a mark as well as a colour, for anyone who cannot pick gold out of grey. */
  tabMark: { height: 3, width: 22, borderRadius: 2, backgroundColor: 'transparent' }, tabMarkOn: { backgroundColor: '#efd49b' },
});
