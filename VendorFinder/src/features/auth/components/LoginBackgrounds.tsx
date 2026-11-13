// src/features/auth/components/LoginBackgrounds.tsx
// Decorative, non-interactive backgrounds for the login screen. Both fill
// their parent absolutely and ignore touches, so the form renders on top.
//
//  - AuroraBackground: slow-drifting soft color blobs.
//  - VendorMarqueeBackground: rows of real vendor badges scrolling sideways.
//
// Built on core `Animated` (no extra deps). Native driver is unavailable on
// web, so it is enabled per-platform.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Platform,
  StyleSheet,
  View,
  useWindowDimensions,
  type ViewStyle,
} from 'react-native';
import { Text } from '../../../components/Text';
import { listVendors } from '../../vendors/vendorService';
import type { VendorType } from '../../../backend/types';

const NATIVE_DRIVER = Platform.OS !== 'web';

function useLoop(duration: number, delay = 0) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(v, {
          toValue: 1,
          duration,
          delay,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: NATIVE_DRIVER,
        }),
        Animated.timing(v, {
          toValue: 0,
          duration,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: NATIVE_DRIVER,
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [v, duration, delay]);
  return v;
}

// ---------------------------------------------------------------------------
// Aurora
// ---------------------------------------------------------------------------

interface BlobSpec {
  color: string;
  size: number; // fraction of the larger window side
  x: number; // center, fraction of width
  y: number; // center, fraction of height
  drift: number; // px of travel
  duration: number;
}

const BLOBS: BlobSpec[] = [
  { color: '#4C8BF5', size: 0.9, x: 0.15, y: 0.2, drift: 90, duration: 9000 },
  { color: '#8B5CF6', size: 0.8, x: 0.85, y: 0.3, drift: 110, duration: 11000 },
  { color: '#14B8A6', size: 0.75, x: 0.3, y: 0.85, drift: 80, duration: 10000 },
  { color: '#EC4899', size: 0.55, x: 0.8, y: 0.8, drift: 70, duration: 8000 },
];

/**
 * A soft radial blob. Native has no CSS blur, so the falloff is faked with
 * stacked translucent circles; web additionally gets a real blur filter.
 */
function SoftBlob({ spec, w, h }: { spec: BlobSpec; w: number; h: number }) {
  const t = useLoop(spec.duration, spec.duration * 0.15);
  const size = Math.max(w, h) * spec.size;
  const rings = 6;

  const transform = [
    { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [-spec.drift, spec.drift] }) },
    {
      translateY: t.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: [spec.drift * 0.6, -spec.drift * 0.6, spec.drift * 0.3],
      }),
    },
    { scale: t.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.15] }) },
  ];

  const webBlur = Platform.OS === 'web' ? ({ filter: 'blur(60px)' } as unknown as ViewStyle) : null;

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          width: size,
          height: size,
          left: spec.x * w - size / 2,
          top: spec.y * h - size / 2,
          alignItems: 'center',
          justifyContent: 'center',
          transform,
        },
        webBlur,
      ]}
    >
      {Array.from({ length: rings }, (_, i) => {
        const d = size * (1 - i / rings);
        return (
          <View
            key={i}
            style={{
              position: 'absolute',
              width: d,
              height: d,
              borderRadius: d / 2,
              backgroundColor: spec.color,
              opacity: 0.16,
            }}
          />
        );
      })}
    </Animated.View>
  );
}

export function AuroraBackground() {
  const { width, height } = useWindowDimensions();
  return (
    <View style={[StyleSheet.absoluteFill, styles.clip, styles.inert, { backgroundColor: '#06080F' }]}>
      {BLOBS.map((b, i) => (
        <SoftBlob key={i} spec={b} w={width} h={height} />
      ))}
      {/* Darken toward the form so inputs stay legible. */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(6,8,15,0.12)' }]} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Vendor marquee
// ---------------------------------------------------------------------------

const TYPE_STYLE: Record<VendorType, { emoji: string; color: string }> = {
  Food: { emoji: '🌮', color: '#F97316' },
  Clothes: { emoji: '👕', color: '#EC4899' },
  Activity: { emoji: '🎯', color: '#22C55E' },
  Electronics: { emoji: '🎧', color: '#3B82F6' },
  Arts: { emoji: '🎨', color: '#A855F7' },
  Services: { emoji: '✂️', color: '#14B8A6' },
  Other: { emoji: '⭐', color: '#EAB308' },
};

interface Badge {
  name: string;
  type: VendorType;
}

// Shown until (or instead of, if there are too few) live vendors.
const FALLBACK: Badge[] = [
  { name: 'Taco Libre', type: 'Food' },
  { name: 'Thread & Co', type: 'Clothes' },
  { name: 'Axe Throw Hub', type: 'Activity' },
  { name: 'Retro Bits', type: 'Electronics' },
  { name: 'Clay Studio', type: 'Arts' },
  { name: 'Fresh Fade', type: 'Services' },
  { name: 'Bao Bros', type: 'Food' },
  { name: 'Vinyl Vault', type: 'Other' },
  { name: 'Mural Makers', type: 'Arts' },
  { name: 'Kona Ice', type: 'Food' },
];

function useFeaturedBadges(): Badge[] {
  const [live, setLive] = useState<Badge[]>([]);
  useEffect(() => {
    let alive = true;
    // Deferred so a misconfigured backend that throws synchronously is caught too.
    Promise.resolve()
      .then(() => listVendors())
      .then((vs) => {
        if (!alive) return;
        // Paid tiers first: they're the "featured" vendors.
        const sorted = [...vs].sort(
          (a, b) => Number(b.subscriptionTier !== 'free') - Number(a.subscriptionTier !== 'free') || b.rating - a.rating,
        );
        setLive(sorted.slice(0, 24).map((v) => ({ name: v.name, type: v.type })));
      })
      .catch(() => {}); // decorative: fall back silently
    return () => {
      alive = false;
    };
  }, []);
  return live.length >= 6 ? live : [...live, ...FALLBACK];
}

function VendorBadge({ badge }: { badge: Badge }) {
  const s = TYPE_STYLE[badge.type] ?? TYPE_STYLE.Other;
  return (
    <View style={styles.badge}>
      <View style={[styles.badgeLogo, { backgroundColor: s.color }]}>
        <Text style={styles.badgeEmoji}>{s.emoji}</Text>
      </View>
      <Text weight="semibold" numberOfLines={1} style={styles.badgeName}>
        {badge.name}
      </Text>
    </View>
  );
}

function MarqueeRow({ items, reverse, duration }: { items: Badge[]; reverse: boolean; duration: number }) {
  const x = useRef(new Animated.Value(0)).current;
  const [rowWidth, setRowWidth] = useState(0);

  useEffect(() => {
    if (!rowWidth) return;
    x.setValue(0);
    const anim = Animated.loop(
      Animated.timing(x, {
        toValue: 1,
        duration,
        easing: Easing.linear,
        useNativeDriver: NATIVE_DRIVER,
      }),
    );
    anim.start();
    return () => anim.stop();
  }, [x, rowWidth, duration]);

  // Two copies side by side; sliding exactly one copy's width loops seamlessly.
  const translateX = x.interpolate({
    inputRange: [0, 1],
    outputRange: reverse ? [-rowWidth, 0] : [0, -rowWidth],
  });

  return (
    <Animated.View style={{ flexDirection: 'row', transform: [{ translateX }] }}>
      {[0, 1].map((copy) => (
        <View
          key={copy}
          style={{ flexDirection: 'row' }}
          onLayout={copy === 0 ? (e) => setRowWidth(e.nativeEvent.layout.width) : undefined}
        >
          {items.map((b, i) => (
            <VendorBadge key={`${copy}-${i}`} badge={b} />
          ))}
        </View>
      ))}
    </Animated.View>
  );
}

export function VendorMarqueeBackground() {
  const badges = useFeaturedBadges();
  const { height } = useWindowDimensions();
  const rowCount = Math.max(5, Math.ceil(height / 90) + 2);

  // Each row gets a rotated slice of the list so neighbors don't line up.
  const rows = useMemo(
    () =>
      Array.from({ length: rowCount }, (_, r) => {
        const offset = (r * 3) % badges.length;
        const rotated = [...badges.slice(offset), ...badges.slice(0, offset)];
        // Pad short lists so one copy is always wider than the screen.
        while (rotated.length < 8) rotated.push(...badges);
        return rotated;
      }),
    [badges, rowCount],
  );

  return (
    <View style={[StyleSheet.absoluteFill, styles.clip, styles.inert, { backgroundColor: '#070A12' }]}>
      <View style={styles.tilted}>
        {rows.map((items, r) => (
          <View key={r} style={{ marginBottom: 14 }}>
            <MarqueeRow items={items} reverse={r % 2 === 1} duration={38000 + (r % 3) * 9000} />
          </View>
        ))}
      </View>
      {/* Dim + vignette so the form reads cleanly over the motion. */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(7,10,18,0.55)' }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  inert: { pointerEvents: 'none' },
  tilted: {
    position: 'absolute',
    top: -120,
    left: -200,
    right: -200,
    bottom: -120,
    transform: [{ rotate: '-10deg' }],
    opacity: 0.85,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 14,
    paddingVertical: 10,
    paddingLeft: 10,
    paddingRight: 18,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  badgeLogo: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  badgeEmoji: { fontSize: 22 },
  badgeName: { color: 'rgba(255,255,255,0.85)', fontSize: 15, maxWidth: 160 },
});
