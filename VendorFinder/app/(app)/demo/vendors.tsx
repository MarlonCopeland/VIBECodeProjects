// app/(app)/demo/vendors.tsx
// Demo: an animated vendor list.
//  - Collapsing large title driven by the scroll position (UI thread).
//  - Skeleton shimmer while "loading", then cards cascade in on a stagger.
//  - Filter chips: removed cards fade out, the rest spring into new slots.
//  - Swipe a card right to favorite it; the heart pops with a mini burst.
//  - "Open" vendors ping, "New" badges breathe, deal badges wiggle.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Stack, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  FadeIn,
  FadeInDown,
  FadeOut,
  LinearTransition,
  ZoomIn,
  interpolate,
  runOnJS,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
} from 'react-native-reanimated';
import { Text } from '../../../src/components/Text';
import { useTheme } from '../../../src/theme/ThemeProvider';
import {
  ConfettiBurst,
  DEMO_VENDORS,
  PingRings,
  PressableScale,
  Pulse,
  Shimmer,
  Wiggle,
  demoHref,
  type DemoVendor,
} from '../../../src/features/demo';

type Filter = 'All' | 'Open now' | 'Deals' | 'New' | 'Food';
const FILTERS: Filter[] = ['All', 'Open now', 'Deals', 'New', 'Food'];

const matches: Record<Filter, (v: DemoVendor) => boolean> = {
  All: () => true,
  'Open now': (v) => v.isOpen,
  Deals: (v) => !!v.hotDeal,
  New: (v) => v.isNew,
  Food: (v) => v.type === 'Food',
};

export default function DemoVendorList() {
  const { colors, spacing, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('All');
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  // Fake network delay so the skeleton → content handoff is visible. The
  // refresh button replays it.
  const load = useCallback(() => {
    setLoading(true);
    const t = setTimeout(() => setLoading(false), 1300);
    return () => clearTimeout(t);
  }, []);
  useEffect(load, [load]);

  const toggleFavorite = useCallback((id: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const visible = useMemo(() => DEMO_VENDORS.filter(matches[filter]), [filter]);

  // --- Collapsing header -------------------------------------------------
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });
  const bigTitle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, 50], [1, 0], Extrapolation.CLAMP),
    transform: [
      // Pull-down stretch (iOS overscroll) and scroll-up shrink.
      { scale: interpolate(scrollY.value, [-120, 0, 60], [1.25, 1, 0.85], Extrapolation.CLAMP) },
      { translateY: interpolate(scrollY.value, [0, 60], [0, -10], Extrapolation.CLAMP) },
    ],
  }));
  const smallTitle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [35, 65], [0, 1], Extrapolation.CLAMP),
    transform: [{ translateY: interpolate(scrollY.value, [35, 65], [8, 0], Extrapolation.CLAMP) }],
  }));
  const headerBorder = useAnimatedStyle(() => ({
    borderBottomColor: scrollY.value > 60 ? colors.border : 'transparent',
  }));

  const HEADER_H = 52;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />

      <Animated.View
        style={[
          {
            paddingTop: insets.top,
            height: insets.top + HEADER_H,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: spacing.sm,
            backgroundColor: colors.background,
            borderBottomWidth: 1,
            zIndex: 2,
          },
          headerBorder,
        ]}
      >
        <Pressable hitSlop={12} onPress={() => router.back()} style={{ padding: spacing.sm }}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <Animated.View style={[{ flex: 1, alignItems: 'center' }, smallTitle]}>
          <Text weight="semibold">Vendors near you</Text>
        </Animated.View>
        <Pressable hitSlop={12} onPress={load} style={{ padding: spacing.sm }}>
          <Ionicons name="refresh" size={22} color={colors.text} />
        </Pressable>
      </Animated.View>

      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xxl }}
      >
        <Animated.View style={[{ transformOrigin: 'left' }, bigTitle]}>
          <Text variant="display">Vendors near you</Text>
          <Text tone="muted" style={{ marginTop: spacing.xs }}>
            Swipe a card right to favorite it →
          </Text>
        </Animated.View>

        <Animated.ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginHorizontal: -spacing.lg, marginVertical: spacing.lg }}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.sm }}
        >
          {FILTERS.map((f, i) => {
            const active = f === filter;
            return (
              <Animated.View key={f} entering={FadeIn.delay(i * 60)}>
                <PressableScale
                  onPress={() => setFilter(f)}
                  style={{
                    paddingHorizontal: spacing.lg,
                    paddingVertical: spacing.sm,
                    borderRadius: radius.pill,
                    backgroundColor: active ? colors.primary : colors.surfaceAlt,
                  }}
                >
                  <Text variant="label" style={{ color: active ? colors.onPrimary : colors.text }}>
                    {f}
                  </Text>
                </PressableScale>
              </Animated.View>
            );
          })}
        </Animated.ScrollView>

        {loading ? (
          <View style={{ gap: spacing.md }}>
            {[0, 1, 2, 3].map((i) => (
              <Animated.View
                key={i}
                exiting={FadeOut.duration(150)}
                style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}
              >
                <Shimmer style={{ width: 56, height: 56, borderRadius: radius.md }} />
                <View style={{ flex: 1, gap: spacing.sm }}>
                  <Shimmer style={{ height: 16, width: '60%', borderRadius: 6 }} />
                  <Shimmer style={{ height: 12, width: '85%', borderRadius: 6 }} />
                </View>
              </Animated.View>
            ))}
          </View>
        ) : (
          <View style={{ gap: spacing.md }}>
            {visible.map((v, i) => (
              <Animated.View
                key={v.id}
                entering={FadeInDown.delay(i * 70).springify().damping(14)}
                exiting={FadeOut.duration(180)}
                layout={LinearTransition.springify().damping(16)}
              >
                <SwipeToFavorite
                  vendor={v}
                  favorite={favorites.has(v.id)}
                  onToggleFavorite={toggleFavorite}
                />
              </Animated.View>
            ))}
            {visible.length === 0 ? (
              <Animated.View entering={ZoomIn.springify()}>
                <Text tone="muted" center style={{ marginTop: spacing.xl }}>
                  Nothing here yet 🌵
                </Text>
              </Animated.View>
            ) : null}
          </View>
        )}
      </Animated.ScrollView>
    </View>
  );
}

const SWIPE_TRIGGER = 90;

function SwipeToFavorite({
  vendor,
  favorite,
  onToggleFavorite,
}: {
  vendor: DemoVendor;
  favorite: boolean;
  onToggleFavorite: (id: string) => void;
}) {
  const { colors, radius, spacing } = useTheme();
  const tx = useSharedValue(0);
  const heartScale = useSharedValue(1);
  const [burst, setBurst] = useState(0);

  const toggle = useCallback(() => {
    if (!favorite) setBurst((b) => b + 1);
    onToggleFavorite(vendor.id);
  }, [favorite, onToggleFavorite, vendor.id]);

  const popHeart = () => {
    'worklet';
    heartScale.value = withSequence(
      withSpring(1.6, { damping: 4, stiffness: 400 }),
      withSpring(1, { damping: 8 }),
    );
  };

  const pan = Gesture.Pan()
    // Only claim clearly-horizontal drags so the list still scrolls.
    .activeOffsetX([-12, 12])
    .failOffsetY([-12, 12])
    .onUpdate((e) => {
      // Rubber-band: free to the right, stiff to the left.
      tx.value = e.translationX > 0 ? e.translationX * 0.85 : e.translationX * 0.15;
    })
    .onEnd(() => {
      if (tx.value > SWIPE_TRIGGER) {
        popHeart();
        runOnJS(toggle)();
      }
      tx.value = withSpring(0, { damping: 14, stiffness: 180 });
    });

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { rotate: `${tx.value / 60}deg` }],
  }));
  const behindStyle = useAnimatedStyle(() => ({
    opacity: interpolate(tx.value, [0, SWIPE_TRIGGER], [0, 1], Extrapolation.CLAMP),
    transform: [
      { scale: interpolate(tx.value, [0, SWIPE_TRIGGER, SWIPE_TRIGGER + 30], [0.5, 1, 1.25], Extrapolation.CLAMP) },
    ],
  }));
  const heartStyle = useAnimatedStyle(() => ({ transform: [{ scale: heartScale.value }] }));

  return (
    <View>
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: spacing.xl,
            top: 0,
            bottom: 0,
            justifyContent: 'center',
          },
          behindStyle,
        ]}
      >
        <Ionicons name={favorite ? 'heart-dislike' : 'heart'} size={32} color={colors.danger} />
      </Animated.View>

      <GestureDetector gesture={pan}>
        <Animated.View style={cardStyle}>
          <PressableScale
            onPress={() => router.push(demoHref(`deal/${vendor.id}`))}
            scaleTo={0.97}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.md,
              padding: spacing.md,
              borderRadius: radius.lg,
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: radius.md,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: vendor.accent + '26',
              }}
            >
              <Text style={{ fontSize: 30 }}>{vendor.emoji}</Text>
            </View>

            <View style={{ flex: 1, gap: 2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Text weight="semibold" numberOfLines={1} style={{ flexShrink: 1 }}>
                  {vendor.name}
                </Text>
                {vendor.isNew ? (
                  <Pulse>
                    <Badge label="NEW" color={colors.primary} />
                  </Pulse>
                ) : null}
                {vendor.hotDeal ? (
                  <Wiggle>
                    <Badge label="🔥 DEAL" color={colors.danger} />
                  </Wiggle>
                ) : null}
              </View>
              <Text variant="caption" tone="muted" numberOfLines={1}>
                {vendor.tagline}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 2 }}>
                {vendor.isOpen ? (
                  <>
                    <PingRings color={colors.success} size={8} />
                    <Text variant="caption" style={{ color: colors.success }}>
                      Open
                    </Text>
                  </>
                ) : (
                  <Text variant="caption" tone="muted">
                    Closed
                  </Text>
                )}
                <Text variant="caption" tone="muted">
                  · ★ {vendor.rating.toFixed(1)} · {vendor.distanceKm} km
                </Text>
              </View>
            </View>

            <Pressable
              hitSlop={10}
              onPress={() => {
                heartScale.value = withSequence(
                  withSpring(1.6, { damping: 4, stiffness: 400 }),
                  withSpring(1, { damping: 8 }),
                );
                toggle();
              }}
            >
              <Animated.View style={heartStyle}>
                <Ionicons
                  name={favorite ? 'heart' : 'heart-outline'}
                  size={24}
                  color={favorite ? colors.danger : colors.textMuted}
                />
              </Animated.View>
              {burst > 0 ? <ConfettiBurst key={burst} count={12} spread={36} /> : null}
            </Pressable>
          </PressableScale>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: color }}>
      <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>{label}</Text>
    </View>
  );
}
