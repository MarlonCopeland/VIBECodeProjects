// app/(app)/settings/rarity.tsx
// Rarity color palettes. Free palettes apply instantly; premium palettes are
// $1.99 cosmetic unlocks. Honest beta behavior: unlocking doesn't charge yet
// (real StoreKit IAP is TODO — paletteStore.ts) and the sheet says so.

import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../../src/components/Screen';
import { Text } from '../../../src/components/Text';
import { Card } from '../../../src/components/Card';
import { Button } from '../../../src/components/Button';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { PALETTE_STORE_ENABLED } from '../../../src/config/env';
import { useAppSettings } from '../../../src/features/settings/AppSettingsContext';
import { PALETTES, type Palette } from '../../../src/features/contacts/palettes';
import { purchasePalette } from '../../../src/features/contacts/paletteStore';
import { TIER_SPECS } from '../../../src/features/contacts/grading';
import { notify } from '../../../src/lib/notify';

export default function RaritySettingsScreen() {
  const { spacing, colors, radius } = useTheme();
  const { paletteId, setPaletteId, isPaletteUnlocked, unlockPalette } = useAppSettings();
  const [buying, setBuying] = useState<string | null>(null);

  const unlock = async (p: Palette) => {
    setBuying(p.id);
    try {
      const result = await purchasePalette(p.id);
      if (result.ok) {
        unlockPalette(p.id);
        setPaletteId(p.id);
        notify(result.beta ? 'Unlocked (beta)' : 'Unlocked', result.message);
      }
    } catch (e) {
      notify('Purchase failed', e instanceof Error ? e.message : String(e));
    } finally {
      setBuying(null);
    }
  };

  return (
    <Screen scroll>
      <Stack.Screen options={{ title: 'Rarity Colors' }} />
      <Text tone="muted" style={{ marginBottom: spacing.lg }}>
        The colors your contacts' rarity tiers use everywhere — list dots, badges, filters.
      </Text>

      <View style={{ gap: spacing.md }}>
        {PALETTES.map((p) => {
          const unlocked = isPaletteUnlocked(p);
          const active = paletteId === p.id;
          return (
            <Card key={p.id} style={{ borderColor: active ? colors.primary : colors.border, borderWidth: active ? 2 : 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Text weight="semibold" style={{ flex: 1 }}>
                  {p.name}
                  {p.animated ? '  ✦' : ''}
                </Text>
                {active ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Ionicons name="checkmark-circle" size={16} color={colors.primary} />
                    <Text variant="caption" tone="primary" weight="semibold">Active</Text>
                  </View>
                ) : p.premium && !unlocked ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Ionicons name="lock-closed" size={13} color={colors.textMuted} />
                    <Text variant="caption" tone="muted">
                      {PALETTE_STORE_ENABLED ? p.price : 'Coming soon'}
                    </Text>
                  </View>
                ) : null}
              </View>

              <Text variant="caption" tone="muted" style={{ marginTop: 2 }}>{p.description}</Text>

              {/* Swatch strip */}
              <View style={{ flexDirection: 'row', gap: 6, marginTop: spacing.md }}>
                {TIER_SPECS.map((spec) => (
                  <View
                    key={spec.id}
                    style={{
                      flex: 1,
                      height: 22,
                      borderRadius: radius.sm,
                      backgroundColor: p.colors[spec.id],
                    }}
                  />
                ))}
              </View>

              <View style={{ marginTop: spacing.md }}>
                {active ? null : unlocked ? (
                  <Button title={`Use ${p.name}`} variant="secondary" onPress={() => setPaletteId(p.id)} />
                ) : PALETTE_STORE_ENABLED ? (
                  <Button
                    title={`Unlock — ${p.price}`}
                    loading={buying === p.id}
                    onPress={() => void unlock(p)}
                  />
                ) : null}
              </View>
            </Card>
          );
        })}
      </View>

      <Text variant="caption" tone="muted" style={{ marginTop: spacing.lg }}>
        {PALETTE_STORE_ENABLED
          ? 'Premium palettes are free to unlock during beta — real App Store billing arrives before launch.'
          : 'Premium palettes arrive with a future update.'}
      </Text>
    </Screen>
  );
}
