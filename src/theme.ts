import { AccessibilityInfo, Platform } from 'react-native';
import { useEffect, useState } from 'react';

/**
 * The tokens the app is built from. Before this file there were 131 distinct colour literals across the
 * screens — a dozen near-identical golds among them — which is what made the app look assembled rather than
 * designed. New work reaches for these names; the older screens are moved over as they are touched.
 */
export const c = {
  ink: '#111117',            // the app's ground
  surface: '#19171e',        // cards
  surfaceLift: '#211d26',    // a card that is pressed, selected, or raised
  line: '#bba16a2b',         // hairline on dark
  lineStrong: '#bba16a55',
  gold: '#efd49b',           // the one gold: actions, focus, brand accents
  goldDeep: '#c9a366',       // the shadow half of a gold gradient
  goldInk: '#271d11',        // text on gold
  text: '#f2f0f6',
  muted: '#aaa1b1',
  faint: '#938c9e',
  win: '#7ad3a0',
  bad: '#ffb5ad',
} as const;

/** A four-step rhythm. Anything between these is a decision nobody made on purpose. */
export const sp = { xs: 4, s: 8, m: 12, l: 16, xl: 24 } as const;
export const radius = { s: 8, m: 12, l: 18, pill: 999 } as const;

/**
 * Haptics. A casino app is one of the few places where touch feedback is not decoration: it is the difference
 * between a button you pressed and a button that answered. Guarded because a build without the native module
 * must not take the screen down with it, and the web preview has nothing to buzz.
 */
export type Feel = 'none' | 'tap' | 'select' | 'heavy' | 'win' | 'warn';
let haptics: typeof import('expo-haptics') | null | undefined;
export function feel(kind: Feel = 'tap') {
  if (kind === 'none' || Platform.OS === 'web') return;
  try {
    if (haptics === undefined) haptics = require('expo-haptics');
    if (!haptics) return;
    const { impactAsync, notificationAsync, selectionAsync, ImpactFeedbackStyle, NotificationFeedbackType } = haptics;
    if (kind === 'select') return void selectionAsync();
    if (kind === 'heavy') return void impactAsync(ImpactFeedbackStyle.Medium);
    if (kind === 'win') return void notificationAsync(NotificationFeedbackType.Success);
    if (kind === 'warn') return void notificationAsync(NotificationFeedbackType.Warning);
    return void impactAsync(ImpactFeedbackStyle.Light);
  } catch { haptics = null; }
}

/** Someone who has asked their phone to stop animating should not be handed a bouncing button. */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then(value => { if (alive) setReduced(value); }).catch(() => {});
    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => { alive = false; listener.remove(); };
  }, []);
  return reduced;
}
