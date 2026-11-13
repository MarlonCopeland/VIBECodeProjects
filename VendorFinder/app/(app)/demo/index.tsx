// app/(app)/demo/index.tsx
// Hub for the animation demos. Each card springs in on a stagger and squishes
// on press; the three demos run on mock data (src/features/demo).

import { View } from 'react-native';
import { Stack, router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Screen } from '../../../src/components/Screen';
import { Text } from '../../../src/components/Text';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { PressableScale, demoHref } from '../../../src/features/demo';

const DEMOS = [
  {
    path: 'home' as const,
    emoji: '📣',
    title: 'Live home feed',
    blurb: 'Drop-in alerts when vendors open or arrive, radar pings, a scrolling ticker.',
  },
  {
    path: 'vendors' as const,
    emoji: '🗂️',
    title: 'Vendor list',
    blurb: 'Skeleton shimmer, staggered entry, animated filtering, swipe to favorite.',
  },
  {
    path: 'deal/taco-loco' as const,
    emoji: '🔥',
    title: 'Hot deal page',
    blurb: 'Parallax hero, countdown, flip-to-reveal coupons, confetti on claim.',
  },
];

export default function DemoHub() {
  const { colors, spacing, radius } = useTheme();
  return (
    <Screen scroll edges={['bottom']}>
      <Stack.Screen options={{ title: 'Animation demos' }} />
      <Animated.View entering={FadeInDown.duration(400)}>
        <Text variant="title" style={{ marginBottom: spacing.xs }}>
          Make it move ✨
        </Text>
        <Text tone="muted" style={{ marginBottom: spacing.xl }}>
          Demo screens built with Reanimated and Gesture Handler on mock vendors.
        </Text>
      </Animated.View>

      <View style={{ gap: spacing.md }}>
        {DEMOS.map((d, i) => (
          <Animated.View key={d.path} entering={FadeInDown.delay(150 + i * 110).springify().damping(14)}>
            <PressableScale
              onPress={() => router.push(demoHref(d.path))}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.lg,
                padding: spacing.lg,
                borderRadius: radius.lg,
                backgroundColor: colors.card,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Text style={{ fontSize: 36 }}>{d.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text weight="semibold" style={{ marginBottom: 2 }}>
                  {d.title}
                </Text>
                <Text variant="caption" tone="muted">
                  {d.blurb}
                </Text>
              </View>
              <Text tone="muted">›</Text>
            </PressableScale>
          </Animated.View>
        ))}
      </View>
    </Screen>
  );
}
