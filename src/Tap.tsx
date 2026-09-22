import React from 'react';
import { Platform, Pressable, StyleProp, ViewStyle } from 'react-native';
import { Feel, c, feel, useReducedMotion } from './theme';

/**
 * Every control that can be pressed, pressed the same way: it dips and dims under the finger, ripples on
 * Android where that is the platform's answer, and gives a short haptic so the press is felt as well as seen.
 *
 * Before this, feedback was whatever each screen remembered to add — a few game tiles scaled, most buttons did
 * nothing at all, and nothing anywhere buzzed. That is the difference between a web page in an app shell and
 * something that feels native on either phone.
 */
export function Tap({ children, onPress, onLongPress, style, disabled, haptic = 'tap', accessibilityLabel, accessibilityRole = 'button',
  accessibilityState, hitSlop = 6, scale = 0.97, ripple = true }: {
  children: React.ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  style?: StyleProp<ViewStyle> | ((state: { pressed: boolean }) => StyleProp<ViewStyle>);
  disabled?: boolean;
  /** 'select' for switching between things, 'heavy' for committing a stake, 'none' to stay quiet. */
  haptic?: Feel;
  accessibilityLabel?: string;
  accessibilityRole?: 'button' | 'tab' | 'radio' | 'link';
  accessibilityState?: { selected?: boolean; disabled?: boolean; busy?: boolean };
  hitSlop?: number;
  scale?: number;
  ripple?: boolean;
}) {
  const reduced = useReducedMotion();
  return <Pressable
    accessibilityRole={accessibilityRole}
    accessibilityLabel={accessibilityLabel}
    accessibilityState={{ disabled: !!disabled, ...accessibilityState }}
    disabled={disabled}
    hitSlop={hitSlop}
    android_ripple={ripple && Platform.OS === 'android' ? { color: '#efd49b26' } : undefined}
    onLongPress={onLongPress}
    onPress={() => { feel(haptic); onPress?.(); }}
    style={state => {
      const base = typeof style === 'function' ? style(state) : style;
      if (disabled) return [base, { opacity: 0.45 }];
      // Android already answers with a ripple; doubling it with a dip reads as a stutter.
      if (!state.pressed || Platform.OS === 'android') return base;
      return [base, reduced ? { opacity: 0.75 } : { opacity: 0.82, transform: [{ scale }] }];
    }}
  >{children}</Pressable>;
}

/** The dark ground behind a pressed surface, for callers that colour their own pressed state. */
export const pressedSurface = { backgroundColor: c.surfaceLift };
