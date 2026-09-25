import { AccessibilityInfo, Platform } from 'react-native';
import { useEffect, useState } from 'react';

/**
 * The tokens the app is built from. Before this file there were 131 distinct colour literals across the
 * screens — a dozen near-identical golds among them — which is what made the app look assembled rather than
 * designed. New work reaches for these names; the older screens are moved over as they are touched.
 */
export const c = {
  ink: '#12062b',            // the app's ground: deep casino indigo
  surface: '#1c0b3d',        // cards
  surfaceLift: '#2b1456',    // a card that is pressed, selected, or raised
  line: '#b56cff40',         // hairline on dark
  lineStrong: '#b56cff77',
  gold: '#ffd23f',           // the one gold: actions, focus, brand accents
  goldDeep: '#ff9f1a',       // the shadow half of a gold gradient
  goldInk: '#3b1600',        // text on gold
  text: '#f7f2ff',
  muted: '#c9b8e8',
  faint: '#9a8cc4',
  win: '#2ee57a',
  bad: '#ffb5ad',
  pink: '#ff3cac',           // neon highlights: the selected tab, eyebrows, glows
  violet: '#8a3cff',
  cyan: '#22e1ff',
} as const;

/** The gradients the vibrant look is built from, as on the website: gold for actions, hot pink-violet for "you are here". */
export const grad = {
  cta: ['#ffe45c', '#ffb01f', '#ff7a1a'] as const,
  hot: ['#ff3cac', '#a43cff', '#3c7bff'] as const,
  hero: ['#c2188a', '#6a1fd1', '#2a0f6e'] as const,
  panel: ['#2b1456', '#1a0a3a'] as const,
};

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
