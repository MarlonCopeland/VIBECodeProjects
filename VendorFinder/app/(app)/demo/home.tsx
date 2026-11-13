// app/(app)/demo/home.tsx
// Demo: a home screen that comes alive with vendor activity.
//  - Live alerts ("Taco Loco just opened") drop in from the top every few
//    seconds; older ones get pushed down and the oldest drops off. Tap to
//    open, swipe/✕ to dismiss, pause the stream from the header.
//  - The bell rings and its badge pops each time an alert lands.
//  - A scrolling "opening now" ticker.
//  - "Opening soon" cards whose CLOSED sign flips to OPEN on a timer.
//  - "New in your area" cards with a shimmering ribbon.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, View, type LayoutChangeEvent } from 'react-native';
import { Stack, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  FadeInDown,
  FadeOut,
  LinearTransition,
  ZoomIn,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type EntryExitAnimationFunction,
} from 'react-native-reanimated';
import { Text } from '../../../src/components/Text';
import { useTheme } from '../../../src/theme/ThemeProvider';
import {
  ConfettiBurst,
  DEMO_ALERTS,
  DEMO_VENDORS,
  PingRings,
  PressableScale,
  Pulse,
  Shimmer,
  demoHref,
  getDemoVendor,
  useCountUp,
  type DemoAlert,
  type DemoAlertKind,
} from '../../../src/features/demo';

const ALERT_EVERY_MS = 3500;
const MAX_ALERTS = 3;

interface LiveAlert extends DemoAlert {
  key: string;
}

/** Drop from above with a little overshoot, like a notification landing. */
const dropIn: EntryExitAnimationFunction = () => {
  'worklet';
  return {
    initialValues: { opacity: 0, transform: [{ translateY: -70 }, { scale: 0.9 }] },
    animations: {
      opacity: withTiming(1, { duration: 200 }),
      transform: [
        { translateY: withSpring(0, { damping: 12, stiffness: 160 }) },
        { scale: withSpring(1, { damping: 12, stiffness: 160 }) },
      ],
    },
  };
};

export default function DemoHome() {
  const { colors, spacing, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const [alerts, setAlerts] = useState<LiveAlert[]>([]);
  const [paused, setPaused] = useState(false);
  const [unread, setUnread] = useState(0);
  const seq = useRef(0);

  // Bell ring + badge pop, triggered per incoming alert.
  const bell = useSharedValue(0);
  const badge = useSharedValue(1);

  const pushAlert = useCallback(() => {
    const n = seq.current++;
    const next = DEMO_ALERTS[n % DEMO_ALERTS.length];
    if (!next) return;
    setAlerts((prev) => [{ ...next, key: `${next.id}-${n}` }, ...prev].slice(0, MAX_ALERTS));
    setUnread((u) => u + 1);
    const t = { duration: 80 };
    bell.value = withSequence(
      withTiming(18, t),
      withTiming(-16, t),
      withTiming(12, t),
      withTiming(-8, t),
      withTiming(0, t),
    );
    badge.value = withSequence(withSpring(1.5, { damping: 5, stiffness: 400 }), withSpring(1));
  }, [bell, badge]);

  useEffect(() => {
    if (paused) return;
    const first = setTimeout(pushAlert, 700);
    const t = setInterval(pushAlert, ALERT_EVERY_MS);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [paused, pushAlert]);

  const bellStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${bell.value}deg` }] }));
  const badgeStyle = useAnimatedStyle(() => ({ transform: [{ scale: badge.value }] }));

  const openNow = DEMO_VENDORS.filter((v) => v.isOpen).length;
  const openCount = useCountUp(openNow, 1200);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />

      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + spacing.sm,
          paddingBottom: insets.bottom + spacing.xxl,
          gap: spacing.xl,
        }}
      >
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, gap: spacing.sm }}>
          <Pressable hitSlop={12} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </Pressable>
          <Animated.View entering={FadeInDown.springify()} style={{ flex: 1 }}>
            <Text variant="heading">{greeting} 👋</Text>
            <Text variant="caption" tone="muted">
              <Text variant="caption" weight="bold" style={{ color: colors.success }}>
                {openCount}
              </Text>{' '}
              vendors open near you right now
            </Text>
          </Animated.View>
          <Pressable hitSlop={8} onPress={() => setPaused((p) => !p)} style={{ padding: spacing.xs }}>
            <Ionicons name={paused ? 'play-circle-outline' : 'pause-circle-outline'} size={26} color={colors.textMuted} />
          </Pressable>
          <Pressable hitSlop={8} onPress={() => setUnread(0)} style={{ padding: spacing.xs }}>
            <Animated.View style={[{ transformOrigin: 'top' }, bellStyle]}>
              <Ionicons name="notifications" size={26} color={colors.text} />
            </Animated.View>
            {unread > 0 ? (
              <Animated.View
                style={[
                  {
                    position: 'absolute',
                    top: 0,
                    right: 0,
                    minWidth: 18,
                    height: 18,
                    borderRadius: 9,
                    paddingHorizontal: 4,
                    backgroundColor: colors.danger,
                    alignItems: 'center',
                    justifyContent: 'center',
                  },
                  badgeStyle,
                ]}
              >
                <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>{unread}</Text>
              </Animated.View>
            ) : null}
          </Pressable>
        </View>

        {/* Live alerts */}
        <View style={{ paddingHorizontal: spacing.lg, gap: spacing.sm, minHeight: 3 * 72 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            {paused ? (
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.textMuted }} />
            ) : (
              <PingRings color={colors.danger} size={8} />
            )}
            <Text variant="label" tone="muted">
              {paused ? 'PAUSED' : 'LIVE'}
            </Text>
          </View>
          {alerts.length === 0 ? (
            <Shimmer style={{ height: 64, borderRadius: radius.lg }} />
          ) : null}
          {alerts.map((a) => (
            <Animated.View
              key={a.key}
              entering={dropIn}
              exiting={FadeOut.duration(200)}
              layout={LinearTransition.springify().damping(15)}
            >
              <AlertCard alert={a} onDismiss={() => setAlerts((prev) => prev.filter((x) => x.key !== a.key))} />
            </Animated.View>
          ))}
        </View>

        <Ticker
          items={DEMO_VENDORS.filter((v) => v.isOpen).map((v) => `${v.emoji} ${v.name} is open`)}
        />

        {/* Opening soon */}
        <View style={{ gap: spacing.sm }}>
          <Text variant="label" tone="muted" style={{ paddingHorizontal: spacing.lg }}>
            OPENING SOON
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.md }}
          >
            {DEMO_VENDORS.filter((v) => !v.isOpen)
              .concat(DEMO_VENDORS.filter((v) => v.isOpen).slice(0, 2))
              .map((v, i) => (
                <Animated.View key={v.id} entering={FadeInDown.delay(200 + i * 100).springify()}>
                  <OpeningCard vendorId={v.id} opensInMs={2500 + i * 2200} />
                </Animated.View>
              ))}
          </ScrollView>
        </View>

        {/* New in your area */}
        <View style={{ gap: spacing.sm, paddingHorizontal: spacing.lg }}>
          <Text variant="label" tone="muted">
            NEW IN YOUR AREA
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
            {DEMO_VENDORS.filter((v) => v.isNew).map((v, i) => (
              <Animated.View
                key={v.id}
                entering={ZoomIn.delay(400 + i * 140).springify().damping(10)}
                style={{ width: '47%' }}
              >
                <PressableScale
                  onPress={() => router.push(demoHref(`deal/${v.id}`))}
                  style={{
                    height: 130,
                    borderRadius: radius.lg,
                    backgroundColor: v.accent,
                    padding: spacing.md,
                    justifyContent: 'flex-end',
                    overflow: 'hidden',
                  }}
                >
                  <NewRibbon />
                  <Text style={{ fontSize: 34 }}>{v.emoji}</Text>
                  <Text weight="bold" style={{ color: '#fff' }}>
                    {v.name}
                  </Text>
                  <Text variant="caption" style={{ color: 'rgba(255,255,255,0.85)' }} numberOfLines={1}>
                    {v.tagline}
                  </Text>
                </PressableScale>
              </Animated.View>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const KIND_META: Record<DemoAlertKind, { icon: keyof typeof Ionicons.glyphMap; label: string }> = {
  opened: { icon: 'storefront', label: 'Now open' },
  new: { icon: 'sparkles', label: 'New vendor' },
  deal: { icon: 'flame', label: 'Flash deal' },
};

function AlertCard({ alert, onDismiss }: { alert: LiveAlert; onDismiss: () => void }) {
  const { colors, spacing, radius } = useTheme();
  const vendor = getDemoVendor(alert.vendorId);
  const meta = KIND_META[alert.kind];
  const tint = alert.kind === 'opened' ? colors.success : alert.kind === 'new' ? colors.primary : colors.danger;

  // Icon gives one excited spin/bounce when the card lands.
  const pop = useSharedValue(0);
  useEffect(() => {
    pop.value = withDelay(150, withSpring(1, { damping: 6, stiffness: 120 }));
  }, [pop]);
  const iconStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: interpolate(pop.value, [0, 1], [0.3, 1]) },
      { rotate: `${interpolate(pop.value, [0, 1], [-90, 0])}deg` },
    ],
  }));

  if (!vendor) return null;
  return (
    <PressableScale
      onPress={() => router.push(demoHref(`deal/${vendor.id}`))}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        padding: spacing.md,
        borderRadius: radius.lg,
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.border,
        borderLeftWidth: 4,
        borderLeftColor: tint,
      }}
    >
      <View>
        <Text style={{ fontSize: 30 }}>{vendor.emoji}</Text>
        <Animated.View
          style={[
            {
              position: 'absolute',
              right: -6,
              bottom: -4,
              width: 20,
              height: 20,
              borderRadius: 10,
              backgroundColor: tint,
              alignItems: 'center',
              justifyContent: 'center',
            },
            iconStyle,
          ]}
        >
          <Ionicons name={meta.icon} size={11} color="#fff" />
        </Animated.View>
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="caption" weight="bold" style={{ color: tint }}>
          {meta.label.toUpperCase()} · now
        </Text>
        <Text numberOfLines={2}>
          <Text weight="semibold">{vendor.name}</Text> {alert.message}
        </Text>
      </View>
      <Pressable hitSlop={10} onPress={onDismiss}>
        <Ionicons name="close" size={18} color={colors.textMuted} />
      </Pressable>
    </PressableScale>
  );
}

/** Endless marquee. Renders the strip twice and slides by one strip width. */
function Ticker({ items }: { items: string[] }) {
  const { colors, spacing } = useTheme();
  const [stripW, setStripW] = useState(0);
  const x = useSharedValue(0);

  useEffect(() => {
    if (!stripW) return;
    x.value = 0;
    x.value = withRepeat(withTiming(-stripW, { duration: stripW * 22, easing: Easing.linear }), -1);
    return () => cancelAnimation(x);
  }, [stripW, x]);

  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const onLayout = (e: LayoutChangeEvent) => setStripW(Math.round(e.nativeEvent.layout.width));

  const strip = (measure: boolean) => (
    <View onLayout={measure ? onLayout : undefined} style={{ flexDirection: 'row' }}>
      {items.map((t, i) => (
        <Text key={i} variant="label" style={{ color: colors.onPrimary, marginRight: spacing.xxl }}>
          {t}
        </Text>
      ))}
    </View>
  );

  return (
    <View style={{ backgroundColor: colors.primary, paddingVertical: spacing.sm, overflow: 'hidden' }}>
      <Animated.View style={[{ flexDirection: 'row', paddingLeft: spacing.lg }, style]}>
        {strip(true)}
        {strip(false)}
      </Animated.View>
    </View>
  );
}

/** Card with a hanging CLOSED sign that flips to OPEN after `opensInMs`. */
function OpeningCard({ vendorId, opensInMs }: { vendorId: string; opensInMs: number }) {
  const { colors, spacing, radius } = useTheme();
  const vendor = getDemoVendor(vendorId);
  const [open, setOpen] = useState(false);
  const flip = useSharedValue(0);
  const swing = useSharedValue(0);

  useEffect(() => {
    // Sign sways on its hook while waiting.
    swing.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.sin) }), -1, true);
    const t = setTimeout(() => {
      setOpen(true);
      flip.value = withSpring(1, { damping: 9, stiffness: 80 });
    }, opensInMs);
    return () => clearTimeout(t);
  }, [opensInMs, flip, swing]);

  const signStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 600 },
      { rotate: `${interpolate(swing.value, [0, 1], [-4, 4])}deg` },
      { rotateX: `${interpolate(flip.value, [0, 1], [0, 360])}deg` },
    ],
  }));
  // Swap the label halfway through the flip, when the sign is edge-on.
  const closedFace = useAnimatedStyle(() => ({ opacity: flip.value < 0.25 ? 1 : 0 }));
  const openFace = useAnimatedStyle(() => ({ opacity: flip.value >= 0.25 ? 1 : 0 }));

  if (!vendor) return null;
  return (
    <PressableScale
      onPress={() => router.push(demoHref(`deal/${vendor.id}`))}
      style={{
        width: 150,
        height: 170,
        borderRadius: radius.lg,
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: open ? colors.success : colors.border,
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: spacing.md,
      }}
    >
      <Animated.View style={[{ alignItems: 'center' }, signStyle]}>
        <View style={{ width: 2, height: 10, backgroundColor: colors.textMuted }} />
        <View style={{ width: 84, height: 30 }}>
          <Animated.View
            style={[
              { position: 'absolute', inset: 0, borderRadius: 6, backgroundColor: colors.textMuted, alignItems: 'center', justifyContent: 'center' },
              closedFace,
            ]}
          >
            <Text weight="bold" style={{ color: '#fff', fontSize: 12, letterSpacing: 1 }}>
              CLOSED
            </Text>
          </Animated.View>
          <Animated.View
            style={[
              { position: 'absolute', inset: 0, borderRadius: 6, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center' },
              openFace,
            ]}
          >
            <Text weight="bold" style={{ color: '#fff', fontSize: 12, letterSpacing: 1 }}>
              OPEN
            </Text>
          </Animated.View>
        </View>
      </Animated.View>

      <View style={{ alignItems: 'center' }}>
        {open ? (
          <Pulse to={1.12} duration={500}>
            <Text style={{ fontSize: 40 }}>{vendor.emoji}</Text>
          </Pulse>
        ) : (
          <Text style={{ fontSize: 40, opacity: 0.4 }}>{vendor.emoji}</Text>
        )}
        {open ? <ConfettiBurst count={16} spread={60} /> : null}
      </View>

      <View style={{ alignItems: 'center' }}>
        <Text weight="semibold" numberOfLines={1}>
          {vendor.name}
        </Text>
        <Text variant="caption" style={{ color: open ? colors.success : colors.textMuted }}>
          {open ? 'Just opened!' : 'Opening soon…'}
        </Text>
      </View>
    </PressableScale>
  );
}

/** Diagonal "NEW" ribbon in the corner with a light glint sweeping across. */
function NewRibbon() {
  const glint = useSharedValue(0);
  useEffect(() => {
    glint.value = withRepeat(
      withSequence(withTiming(1, { duration: 700 }), withDelay(1500, withTiming(0, { duration: 0 }))),
      -1,
    );
  }, [glint]);
  const glintStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(glint.value, [0, 1], [-40, 120]) }],
  }));
  return (
    <View
      style={{
        position: 'absolute',
        top: 14,
        right: -30,
        width: 120,
        paddingVertical: 3,
        backgroundColor: '#FACC15',
        alignItems: 'center',
        overflow: 'hidden',
        transform: [{ rotate: '35deg' }],
      }}
    >
      <Animated.View
        style={[{ position: 'absolute', top: 0, bottom: 0, width: 20, backgroundColor: 'rgba(255,255,255,0.7)' }, glintStyle]}
      />
      <Text weight="bold" style={{ fontSize: 11, color: '#3F2D00', letterSpacing: 1 }}>
        NEW
      </Text>
    </View>
  );
}
