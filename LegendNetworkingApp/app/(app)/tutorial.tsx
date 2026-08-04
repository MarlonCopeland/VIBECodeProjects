// app/(app)/tutorial.tsx
// First-run tutorial: four swipeable slides introducing Legend's pillars.
// Shown automatically on the first open (see app/(app)/_layout.tsx) and
// re-viewable any time from Settings → Support → "View the tutorial".

import React, { useRef, useState } from 'react';
import { ScrollView, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '../../src/components/Text';
import { Button } from '../../src/components/Button';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useAppSettings } from '../../src/features/settings/AppSettingsContext';
import { TIER_SPECS } from '../../src/features/contacts/grading';

interface Slide {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
}

const SLIDES: Slide[] = [
  {
    key: 'welcome',
    icon: 'people-circle-outline',
    title: 'Welcome to Legend',
    body:
      'Your network, owned by you. Import contacts from your phone or a CSV, record where you met and why you know each other — and export everything back out whenever you want. No feed, no followers, no lock-in.',
  },
  {
    key: 'grades',
    icon: 'stats-chart-outline',
    title: 'Every relationship has a grade',
    body:
      'Calls, texts, emails, and visits raise a contact’s score; time quietly erodes it. Grades map to loot-drop rarity tiers, so one glance tells you who’s golden and who’s fading.',
  },
  {
    key: 'circles',
    icon: 'radio-outline',
    title: 'Circles of Influence',
    body:
      'Group people by premise — the event, topic, or interest that connects you. Legend surfaces everyone who matches, so your “NAACP Gala” or “jazz people” circle is always one tap away.',
  },
  {
    key: 'outreach',
    icon: 'send-outline',
    title: 'Reach the whole circle',
    body:
      'Blast a personalized text to each member one-by-one, email everyone at once, or work through a call list sorted stalest-first. Every touch is logged automatically and feeds the grade.',
  },
];

export default function TutorialScreen() {
  const router = useRouter();
  const { colors, spacing, radius } = useTheme();
  const { setHasSeenTutorial, activePalette } = useAppSettings();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const [page, setPage] = useState(0);

  const last = page === SLIDES.length - 1;

  const finish = () => {
    setHasSeenTutorial(true);
    if (router.canGoBack()) router.back();
    else router.replace('/(app)/(tabs)');
  };

  const goTo = (index: number) => {
    scrollRef.current?.scrollTo({ x: index * width, animated: true });
    setPage(index);
  };

  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / width);
    if (index !== page) setPage(index);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top, paddingBottom: insets.bottom + spacing.lg }}>
      <Stack.Screen options={{ headerShown: false, presentation: 'fullScreenModal' }} />

      {/* Skip — top right */}
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
        <Text
          tone="muted"
          weight="semibold"
          accessibilityRole="button"
          onPress={finish}
          style={{ padding: spacing.sm }}
        >
          Skip
        </Text>
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onMomentumEnd}
        style={{ flex: 1 }}
      >
        {SLIDES.map((slide) => (
          <View
            key={slide.key}
            style={{ width, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl }}
          >
            <View
              style={{
                width: 112,
                height: 112,
                borderRadius: 56,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.surfaceAlt,
                marginBottom: spacing.xl,
              }}
            >
              <Ionicons name={slide.icon} size={56} color={colors.primary} />
            </View>

            <Text variant="title" weight="bold" style={{ textAlign: 'center', marginBottom: spacing.md }}>
              {slide.title}
            </Text>
            <Text tone="muted" style={{ textAlign: 'center', lineHeight: 22 }}>
              {slide.body}
            </Text>

            {slide.key === 'grades' ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.sm, marginTop: spacing.xl }}>
                {TIER_SPECS.map((tier) => (
                  <View
                    key={tier.id}
                    style={{
                      paddingHorizontal: spacing.md,
                      paddingVertical: 6,
                      borderRadius: radius.lg,
                      backgroundColor: activePalette.colors[tier.id],
                    }}
                  >
                    <Text variant="caption" weight="semibold" style={{ color: '#FFFFFF' }}>
                      {tier.label}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ))}
      </ScrollView>

      {/* Dots */}
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: spacing.sm, marginBottom: spacing.lg }}>
        {SLIDES.map((slide, i) => (
          <View
            key={slide.key}
            style={{
              width: i === page ? 22 : 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: i === page ? colors.primary : colors.border,
            }}
          />
        ))}
      </View>

      <View style={{ paddingHorizontal: spacing.xl }}>
        <Button
          title={last ? 'Get started' : 'Next'}
          onPress={() => (last ? finish() : goTo(page + 1))}
        />
      </View>
    </View>
  );
}
