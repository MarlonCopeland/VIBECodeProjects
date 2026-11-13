// src/features/demo/components/motion.tsx
// Small reusable animation primitives for the demo screens, all built on
// Reanimated so they run on the UI thread. Each one is self-contained and
// safe to drop into real screens later.

import React, { useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle, type StyleProp } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '../../../theme/ThemeProvider';

/** Pressable that squishes down on press and springs back on release. */
export function PressableScale({
  children,
  onPress,
  style,
  scaleTo = 0.95,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  scaleTo?: number;
}) {
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => {
        scale.value = withSpring(scaleTo, { damping: 15, stiffness: 400 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 8, stiffness: 300 });
      }}
    >
      <Animated.View style={[style, animated]}>{children}</Animated.View>
    </Pressable>
  );
}

/** Endless gentle "breathing" scale — for badges that should feel alive. */
export function Pulse({
  children,
  style,
  to = 1.08,
  duration = 700,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  to?: number;
  duration?: number;
}) {
  const s = useSharedValue(1);
  useEffect(() => {
    s.value = withRepeat(
      withTiming(to, { duration, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
  }, [s, to, duration]);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}

/** Periodic attention wiggle: a quick shake, then a rest, forever. */
export function Wiggle({
  children,
  style,
  every = 2200,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  every?: number;
}) {
  const r = useSharedValue(0);
  useEffect(() => {
    const t = { duration: 70 };
    r.value = withRepeat(
      withSequence(
        withDelay(every, withTiming(-8, t)),
        withTiming(8, t),
        withTiming(-6, t),
        withTiming(6, t),
        withTiming(0, t),
      ),
      -1,
    );
  }, [r, every]);
  const animated = useAnimatedStyle(() => ({ transform: [{ rotate: `${r.value}deg` }] }));
  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}

/** Expanding, fading rings — a "live now" radar ping. */
export function PingRings({
  color,
  size = 16,
  rings = 3,
}: {
  color: string;
  size?: number;
  rings?: number;
}) {
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {Array.from({ length: rings }, (_, i) => (
        <Ring key={i} color={color} size={size} delay={(i * 1600) / rings} />
      ))}
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />
    </View>
  );
}

function Ring({ color, size, delay }: { color: string; size: number; delay: number }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(
      delay,
      withRepeat(withTiming(1, { duration: 1600, easing: Easing.out(Easing.quad) }), -1),
    );
  }, [p, delay]);
  const animated = useAnimatedStyle(() => ({
    opacity: interpolate(p.value, [0, 1], [0.6, 0]),
    transform: [{ scale: interpolate(p.value, [0, 1], [1, 3.2]) }],
  }));
  return (
    <Animated.View
      style={[
        StyleSheet.absoluteFillObject,
        { borderRadius: size / 2, backgroundColor: color },
        animated,
      ]}
    />
  );
}

/** Skeleton placeholder with a light band sweeping across it. */
export function Shimmer({ style }: { style?: StyleProp<ViewStyle> }) {
  const { colors, scheme } = useTheme();
  const x = useSharedValue(-1);
  useEffect(() => {
    x.value = withRepeat(withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.ease) }), -1);
  }, [x]);
  const band = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value * 300 }, { skewX: '-20deg' }],
  }));
  return (
    <View style={[{ backgroundColor: colors.surfaceAlt, overflow: 'hidden' }, style]}>
      <Animated.View
        style={[
          {
            position: 'absolute',
            top: 0,
            bottom: 0,
            width: 80,
            backgroundColor: scheme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.7)',
          },
          band,
        ]}
      />
    </View>
  );
}

const CONFETTI_COLORS = ['#F97316', '#FACC15', '#22C55E', '#3B82F6', '#EC4899', '#A855F7'];

/**
 * One-shot confetti explosion from the center of its parent. Remount it
 * (change its `key`) to fire again. `pointerEvents="none"` so it never
 * blocks taps underneath.
 */
export function ConfettiBurst({ count = 28, spread = 180 }: { count?: number; spread?: number }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        angle: (Math.PI * 2 * i) / count + Math.random() * 0.4,
        dist: spread * (0.5 + Math.random() * 0.6),
        spin: (Math.random() - 0.5) * 900,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length] ?? '#FACC15',
        w: 6 + Math.random() * 5,
        h: 10 + Math.random() * 6,
      })),
    [count, spread],
  );
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, styles.center]}>
      {pieces.map((p, i) => (
        <ConfettiPiece key={i} {...p} />
      ))}
    </View>
  );
}

function ConfettiPiece({
  angle,
  dist,
  spin,
  color,
  w,
  h,
}: {
  angle: number;
  dist: number;
  spin: number;
  color: string;
  w: number;
  h: number;
}) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withTiming(1, { duration: 1300, easing: Easing.out(Easing.cubic) });
  }, [t]);
  const animated = useAnimatedStyle(() => {
    // Burst outward, then gravity pulls the piece down as it fades.
    const x = Math.cos(angle) * dist * t.value;
    const y = Math.sin(angle) * dist * t.value + 140 * t.value * t.value;
    return {
      opacity: interpolate(t.value, [0, 0.7, 1], [1, 1, 0]),
      transform: [{ translateX: x }, { translateY: y }, { rotate: `${spin * t.value}deg` }],
    };
  });
  return (
    <Animated.View
      style={[
        { position: 'absolute', width: w, height: h, borderRadius: 2, backgroundColor: color },
        animated,
      ]}
    />
  );
}

/** A number that ticks up to `value` — e.g. "38 claimed". */
export function useCountUp(value: number, duration = 900) {
  const [display, setDisplay] = React.useState(0);
  useEffect(() => {
    const start = Date.now();
    let raf = 0;
    const step = () => {
      const k = Math.min(1, (Date.now() - start) / duration);
      const eased = 1 - Math.pow(1 - k, 3);
      setDisplay(Math.round(value * eased));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return display;
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
});
