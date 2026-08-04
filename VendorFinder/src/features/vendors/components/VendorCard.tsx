// src/features/vendors/components/VendorCard.tsx
// Themed vendor list row: name, type/rating, open status + distance, address,
// and a follow/unfollow star.

import React from 'react';
import { Pressable, View } from 'react-native';
import { Card } from '../../../components/Card';
import { Text } from '../../../components/Text';
import { useTheme } from '../../../theme/ThemeProvider';
import type { Vendor } from '../../../backend/types';

interface VendorCardProps {
  vendor: Vendor;
  isFavorite: boolean;
  onPress: () => void;
  onToggleFavorite: () => void;
}

export function VendorCard({ vendor, isFavorite, onPress, onToggleFavorite }: VendorCardProps) {
  const { colors, spacing } = useTheme();
  const distLabel = typeof vendor.distanceKm === 'number' ? `${vendor.distanceKm.toFixed(2)} km` : '—';

  return (
    <Pressable onPress={onPress} style={{ marginBottom: spacing.sm }}>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>
            <Text variant="heading" weight="semibold">
              {vendor.name}
            </Text>
            <Text tone="muted" variant="label" style={{ marginTop: spacing.xs }}>
              {vendor.type} • Rating {vendor.rating}/5
            </Text>
            <Text
              variant="label"
              style={{ marginTop: 2, color: vendor.isOpen ? colors.success : colors.textMuted }}
            >
              {vendor.isOpen ? 'Open now' : 'Closed'} • {distLabel}
            </Text>
            {vendor.currentLocation?.address ? (
              <Text tone="muted" variant="caption" numberOfLines={1} style={{ marginTop: spacing.xs }}>
                {vendor.currentLocation.address}
              </Text>
            ) : null}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isFavorite ? 'Unfollow vendor' : 'Follow vendor'}
            onPress={onToggleFavorite}
            hitSlop={8}
            style={{ paddingLeft: spacing.md }}
          >
            <Text style={{ fontSize: 24, color: isFavorite ? colors.primary : colors.textMuted }}>
              {isFavorite ? '★' : '☆'}
            </Text>
          </Pressable>
        </View>
      </Card>
    </Pressable>
  );
}
