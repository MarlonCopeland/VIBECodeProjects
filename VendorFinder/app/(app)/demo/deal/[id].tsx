// app/(app)/demo/deal/[id].tsx
// Demo: a vendor page that sells a hot deal.
//  - Parallax hero (slower than the scroll, stretches on overscroll) with a
//    bobbing emoji.
//  - Deal card with a wiggling ribbon, a shine sweep, an animated strike-
//    through, and a discount sticker that spins in.
//  - Rolling-digit countdown and a stock bar that fills on mount.
//  - Coupons flip over to reveal their code; tap again to copy.
//  - Sticky "Claim" button: confetti burst, then morphs into "Claimed".

import { useEffect, useState } from 'react';
import { Dimensions, Pressable, StyleSheet, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  Extrapolation,
  FadeInDown,
  FadeInUp,
  FadeOutDown,
  ZoomIn,
  interpolate,
  interpolateColor,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type EntryExitAnimationFunction,
} from 'react-native-reanimated';
import { Text } from '../../../../src/components/Text';
import { useTheme } from '../../../../src/theme/ThemeProvider';
import {
  ConfettiBurst,
  PressableScale,
  Pulse,
  Wiggle,
  formatPrice,
  getDemoVendor,
  useCountUp,
  type DemoCoupon,
  type DemoDeal,
} from '../../../../src/features/demo';

const HERO_H = 280;
const SCREEN_W = Dimensions.get('window').width;

export default function DemoDealPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const vendor = getDemoVendor(id);
  const { colors, spacing, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const [claimed, setClaimed] = useState(false);
  const [burst, setBurst] = useState(0);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1600);
    return () => clearTimeout(t);
  }, [toast]);

  // --- Parallax hero ------------------------------------------------------
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });
  const heroStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(scrollY.value, [-HERO_H, 0, HERO_H], [-HERO_H / 2, 0, HERO_H * 0.5]) },
      { scale: interpolate(scrollY.value, [-HERO_H, 0], [2, 1], Extrapolation.CLAMP) },
    ],
  }));
  const bob = useSharedValue(0);
  useEffect(() => {
    bob.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [bob]);
  const emojiStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(bob.value, [0, 1], [-8, 8]) },
      { rotate: `${interpolate(bob.value, [0, 1], [-6, 6])}deg` },
    ],
  }));
  const topBarBg = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      scrollY.value,
      [HERO_H - 120, HERO_H - 60],
      ['transparent', colors.surface],
    ),
  }));
  const topBarTitle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [HERO_H - 100, HERO_H - 60], [0, 1], Extrapolation.CLAMP),
  }));

  // --- Claim button -------------------------------------------------------
  const claimProgress = useSharedValue(0);
  const claimStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(claimProgress.value, [0, 1], [colors.danger, colors.success]),
  }));

  if (!vendor) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text>Vendor not found.</Text>
      </View>
    );
  }

  const claim = () => {
    if (claimed) return;
    setClaimed(true);
    setBurst((b) => b + 1);
    claimProgress.value = withTiming(1, { duration: 400 });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />

      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: 120 + insets.bottom }}
      >
        {/* Hero */}
        <Animated.View
          style={[
            { height: HERO_H, backgroundColor: vendor.accent, alignItems: 'center', justifyContent: 'center' },
            heroStyle,
          ]}
        >
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.12)' }]} />
          <Animated.Text style={[{ fontSize: 96 }, emojiStyle]}>{vendor.emoji}</Animated.Text>
        </Animated.View>

        <View
          style={{
            marginTop: -radius.xl,
            borderTopLeftRadius: radius.xl,
            borderTopRightRadius: radius.xl,
            backgroundColor: colors.background,
            padding: spacing.lg,
            gap: spacing.lg,
          }}
        >
          <Animated.View entering={FadeInDown.delay(100).springify()}>
            <Text variant="title">{vendor.name}</Text>
            <Text tone="muted">
              {vendor.tagline} · ★ {vendor.rating.toFixed(1)} · {vendor.distanceKm} km
            </Text>
          </Animated.View>

          {vendor.hotDeal ? (
            <Animated.View entering={FadeInDown.delay(220).springify()}>
              <DealCard deal={vendor.hotDeal} claimed={claimed} />
            </Animated.View>
          ) : null}

          {vendor.coupons.length > 0 ? (
            <Animated.View entering={FadeInDown.delay(340).springify()}>
              <Text variant="label" tone="muted" style={{ marginBottom: spacing.sm }}>
                COUPONS · TAP TO REVEAL
              </Text>
              <Animated.ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ marginHorizontal: -spacing.lg }}
                contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.md }}
              >
                {vendor.coupons.map((c) => (
                  <FlipCoupon key={c.id} coupon={c} accent={vendor.accent} onCopied={setToast} />
                ))}
              </Animated.ScrollView>
            </Animated.View>
          ) : null}

          <Animated.View entering={FadeInDown.delay(460).springify()}>
            <Text variant="label" tone="muted" style={{ marginBottom: spacing.sm }}>
              ABOUT
            </Text>
            <Text tone="muted">
              A demo vendor page. Scroll up to see the hero parallax, and pull down past the top to
              see it stretch.
            </Text>
          </Animated.View>
        </View>
      </Animated.ScrollView>

      {/* Top bar: transparent over the hero, solid once scrolled past it */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            paddingTop: insets.top,
            height: insets.top + 52,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: spacing.sm,
          },
          topBarBg,
        ]}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(0,0,0,0.35)',
          }}
        >
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </Pressable>
        <Animated.View style={[{ flex: 1, alignItems: 'center', marginRight: 36 }, topBarTitle]}>
          <Text weight="semibold">{vendor.name}</Text>
        </Animated.View>
      </Animated.View>

      {/* Sticky claim button */}
      {vendor.hotDeal ? (
        <View
          style={{
            position: 'absolute',
            left: spacing.lg,
            right: spacing.lg,
            bottom: insets.bottom + spacing.lg,
          }}
        >
          <Pulse to={claimed ? 1 : 1.03} duration={600}>
            <PressableScale onPress={claim}>
              <Animated.View
                style={[
                  {
                    height: 56,
                    borderRadius: radius.pill,
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'row',
                    gap: spacing.sm,
                  },
                  claimStyle,
                ]}
              >
                {claimed ? (
                  <Animated.View key="done" entering={ZoomIn.springify()} style={{ flexDirection: 'row', gap: spacing.sm }}>
                    <Ionicons name="checkmark-circle" size={22} color="#fff" />
                    <Text weight="bold" style={{ color: '#fff' }}>
                      Deal claimed — show at the window
                    </Text>
                  </Animated.View>
                ) : (
                  <Text weight="bold" style={{ color: '#fff' }}>
                    Claim deal · {formatPrice(vendor.hotDeal.salePrice)}
                  </Text>
                )}
              </Animated.View>
            </PressableScale>
          </Pulse>
        </View>
      ) : null}

      {/* Confetti covers the whole screen, never blocks taps */}
      {burst > 0 ? (
        <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { top: '35%' }]}>
          <ConfettiBurst key={burst} count={48} spread={SCREEN_W * 0.6} />
        </View>
      ) : null}

      {toast ? (
        <Animated.View
          entering={FadeInUp.springify()}
          exiting={FadeOutDown}
          style={{
            position: 'absolute',
            alignSelf: 'center',
            bottom: insets.bottom + 90,
            paddingHorizontal: spacing.lg,
            paddingVertical: spacing.sm,
            borderRadius: radius.pill,
            backgroundColor: colors.text,
          }}
        >
          <Text variant="label" style={{ color: colors.background }}>
            {toast}
          </Text>
        </Animated.View>
      ) : null}
    </View>
  );
}

function DealCard({ deal, claimed }: { deal: DemoDeal; claimed: boolean }) {
  const { colors, spacing, radius } = useTheme();
  const pctOff = Math.round((1 - deal.salePrice / deal.originalPrice) * 100);
  const claimedCount = useCountUp(deal.claimed + (claimed ? 1 : 0));
  const left = Math.max(0, deal.stock - deal.claimed - (claimed ? 1 : 0));

  // Strike-through draws across the old price, then the new price pops in.
  const strike = useSharedValue(0);
  // Stock bar fills to the claimed fraction.
  const fill = useSharedValue(0);
  // Light band sweeping across the card every few seconds.
  const shine = useSharedValue(0);
  useEffect(() => {
    strike.value = withDelay(500, withTiming(1, { duration: 350, easing: Easing.out(Easing.quad) }));
    shine.value = withRepeat(
      withSequence(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }), withDelay(1800, withTiming(0, { duration: 0 }))),
      -1,
    );
  }, [strike, shine]);
  useEffect(() => {
    fill.value = withDelay(400, withSpring((deal.claimed + (claimed ? 1 : 0)) / deal.stock, { damping: 18 }));
  }, [fill, deal, claimed]);

  const strikeStyle = useAnimatedStyle(() => ({ width: `${strike.value * 100}%` }));
  const fillStyle = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }));
  const shineStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(shine.value, [0, 1], [-150, SCREEN_W]) }, { rotate: '20deg' }],
  }));

  return (
    <View
      style={{
        borderRadius: radius.lg,
        borderWidth: 2,
        borderColor: colors.danger,
        backgroundColor: colors.card,
        padding: spacing.lg,
        overflow: 'hidden',
        gap: spacing.md,
      }}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          { position: 'absolute', top: -40, bottom: -40, width: 60, backgroundColor: 'rgba(255,255,255,0.25)' },
          shineStyle,
        ]}
      />

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Wiggle every={1800}>
          <View style={{ backgroundColor: colors.danger, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}>
            <Text weight="bold" style={{ color: '#fff', fontSize: 12 }}>
              🔥 HOT DEAL
            </Text>
          </View>
        </Wiggle>
        <Animated.View
          entering={ZoomIn.delay(800).springify().damping(6)}
          style={{
            width: 58,
            height: 58,
            borderRadius: 29,
            backgroundColor: colors.warning,
            alignItems: 'center',
            justifyContent: 'center',
            transform: [{ rotate: '-12deg' }],
          }}
        >
          <Text weight="bold" style={{ color: '#fff' }}>
            -{pctOff}%
          </Text>
        </Animated.View>
      </View>

      <Text variant="heading">{deal.title}</Text>

      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md }}>
        <Animated.Text
          entering={ZoomIn.delay(850).springify().damping(7)}
          style={{ fontSize: 34, fontWeight: '800', color: colors.danger }}
        >
          {formatPrice(deal.salePrice)}
        </Animated.Text>
        <View style={{ marginBottom: 6, justifyContent: 'center' }}>
          <Text tone="muted" style={{ fontSize: 18 }}>
            {formatPrice(deal.originalPrice)}
          </Text>
          <Animated.View
            style={[{ position: 'absolute', height: 2, backgroundColor: colors.textMuted, top: '50%' }, strikeStyle]}
          />
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text variant="label" tone="muted">
          Ends in
        </Text>
        <Countdown seconds={deal.endsInSec} />
      </View>

      <View style={{ gap: spacing.xs }}>
        <View style={{ height: 10, borderRadius: 5, backgroundColor: colors.surfaceAlt, overflow: 'hidden' }}>
          <Animated.View style={[{ height: '100%', borderRadius: 5, backgroundColor: colors.danger }, fillStyle]} />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text variant="caption" tone="muted">
            {claimedCount} claimed
          </Text>
          <Text variant="caption" weight="bold" style={{ color: colors.danger }}>
            Only {left} left!
          </Text>
        </View>
      </View>
    </View>
  );
}

/** HH:MM:SS where each digit rolls up as it changes. */
function Countdown({ seconds }: { seconds: number }) {
  const [remaining, setRemaining] = useState(seconds);
  useEffect(() => {
    const t = setInterval(() => setRemaining((r) => Math.max(0, r - 1)), 1000);
    return () => clearInterval(t);
  }, []);
  const h = Math.floor(remaining / 3600);
  const m = Math.floor((remaining % 3600) / 60);
  const s = remaining % 60;
  const text = [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {text.split('').map((ch, i) => (ch === ':' ? <Colon key={i} /> : <Digit key={i} slot={i} value={ch} />))}
    </View>
  );
}

// Built-in Slide* animations travel the full window height; a digit only
// needs to roll one cell, so these custom ones move 32px.
const DIGIT_H = 32;
const digitIn: EntryExitAnimationFunction = () => {
  'worklet';
  return {
    initialValues: { transform: [{ translateY: DIGIT_H }], opacity: 0 },
    animations: {
      transform: [{ translateY: withTiming(0, { duration: 260 }) }],
      opacity: withTiming(1, { duration: 260 }),
    },
  };
};
const digitOut: EntryExitAnimationFunction = () => {
  'worklet';
  return {
    initialValues: { transform: [{ translateY: 0 }], opacity: 1 },
    animations: {
      transform: [{ translateY: withTiming(-DIGIT_H, { duration: 260 }) }],
      opacity: withTiming(0, { duration: 260 }),
    },
  };
};

function Digit({ slot, value }: { slot: number; value: string }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        width: 22,
        height: DIGIT_H,
        borderRadius: 6,
        backgroundColor: colors.text,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* New key per value → old digit slides out the top, new one in from below */}
      <Animated.Text
        key={`${slot}-${value}`}
        entering={digitIn}
        exiting={digitOut}
        style={{ position: 'absolute', fontSize: 20, fontWeight: '800', color: colors.background, fontVariant: ['tabular-nums'] }}
      >
        {value}
      </Animated.Text>
    </View>
  );
}

function Colon() {
  const { colors } = useTheme();
  return <Text weight="bold" style={{ color: colors.text, fontSize: 20, lineHeight: 32 }}>:</Text>;
}

const COUPON_W = 170;
const COUPON_H = 110;

function FlipCoupon({
  coupon,
  accent,
  onCopied,
}: {
  coupon: DemoCoupon;
  accent: string;
  onCopied: (msg: string) => void;
}) {
  const { colors, radius, spacing } = useTheme();
  const flip = useSharedValue(0);
  const [revealed, setRevealed] = useState(false);

  const front = useAnimatedStyle(() => ({
    transform: [{ perspective: 800 }, { rotateY: `${interpolate(flip.value, [0, 1], [0, 180])}deg` }],
  }));
  const back = useAnimatedStyle(() => ({
    transform: [{ perspective: 800 }, { rotateY: `${interpolate(flip.value, [0, 1], [180, 360])}deg` }],
  }));

  const onPress = () => {
    if (!revealed) {
      setRevealed(true);
      flip.value = withSpring(1, { damping: 12, stiffness: 90 });
      return;
    }
    void Clipboard.setStringAsync(coupon.code);
    onCopied(`Copied ${coupon.code}`);
  };

  const face = {
    position: 'absolute' as const,
    width: COUPON_W,
    height: COUPON_H,
    borderRadius: radius.lg,
    padding: spacing.md,
    backfaceVisibility: 'hidden' as const,
    justifyContent: 'space-between' as const,
  };

  return (
    <PressableScale onPress={onPress} style={{ width: COUPON_W, height: COUPON_H }}>
      <Animated.View style={[face, { backgroundColor: accent }, front]}>
        <Text weight="bold" style={{ color: '#fff', fontSize: 20 }}>
          {coupon.headline}
        </Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text variant="caption" style={{ color: 'rgba(255,255,255,0.9)', flexShrink: 1 }}>
            {coupon.detail}
          </Text>
          <Ionicons name="gift" size={20} color="#fff" />
        </View>
      </Animated.View>
      <Animated.View
        style={[
          face,
          {
            backgroundColor: colors.card,
            borderWidth: 2,
            borderStyle: 'dashed',
            borderColor: accent,
            alignItems: 'center',
          },
          back,
        ]}
      >
        <Text variant="caption" tone="muted">
          Your code
        </Text>
        <Text weight="bold" style={{ fontSize: 20, letterSpacing: 2, color: accent }}>
          {coupon.code}
        </Text>
        <Text variant="caption" tone="muted">
          Tap to copy
        </Text>
      </Animated.View>
    </PressableScale>
  );
}
