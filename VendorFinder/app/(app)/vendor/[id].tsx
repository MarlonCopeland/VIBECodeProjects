// app/(app)/vendor/[id].tsx
// Vendor detail: name, type, status, rating, distance, address, follow button,
// description, and upcoming schedule.

import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { Screen } from '../../../src/components/Screen';
import { Text } from '../../../src/components/Text';
import { Card } from '../../../src/components/Card';
import { Button } from '../../../src/components/Button';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { useVendors } from '../../../src/features/vendors/VendorContext';
import { getVendor } from '../../../src/features/vendors/vendorService';
import { ScheduleItem } from '../../../src/features/vendors/components/ScheduleItem';
import type { Vendor } from '../../../src/backend/types';

export default function VendorDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const { vendors, favorites, toggleFavorite } = useVendors();
  const { colors, spacing } = useTheme();

  const fromContext = useMemo(() => vendors.find((v) => v.id === id) ?? null, [vendors, id]);
  const [vendor, setVendor] = useState<Vendor | null>(fromContext);

  useEffect(() => {
    if (fromContext) {
      setVendor(fromContext);
    } else if (id) {
      getVendor(id).then(setVendor).catch(() => {});
    }
  }, [id, fromContext]);

  useEffect(() => {
    if (vendor) navigation.setOptions({ title: vendor.name });
  }, [vendor, navigation]);

  if (!vendor) {
    return (
      <Screen center>
        <Text tone="muted">Vendor not found.</Text>
      </Screen>
    );
  }

  const isFavorite = favorites.includes(vendor.id);
  const distLabel = typeof vendor.distanceKm === 'number' ? `${vendor.distanceKm.toFixed(2)} km away` : null;

  return (
    <Screen scroll>
      <Text variant="title" weight="bold">
        {vendor.name}
      </Text>
      <Text tone="muted" style={{ marginTop: spacing.xs }}>
        {vendor.type} • Rating {vendor.rating}/5
      </Text>
      <Text
        variant="label"
        style={{ marginTop: spacing.xs, color: vendor.isOpen ? colors.success : colors.textMuted }}
      >
        {vendor.isOpen ? 'Open now' : 'Closed'}
        {distLabel ? ` • ${distLabel}` : ''}
      </Text>
      {vendor.currentLocation?.address ? (
        <Text tone="muted" variant="label" style={{ marginTop: spacing.xs }}>
          📍 {vendor.currentLocation.address}
        </Text>
      ) : null}

      <View style={{ marginTop: spacing.lg }}>
        <Button
          title={isFavorite ? 'Following ✓' : 'Follow'}
          variant={isFavorite ? 'secondary' : 'primary'}
          onPress={() => void toggleFavorite(vendor.id)}
        />
      </View>

      {vendor.description ? (
        <Card style={{ marginTop: spacing.lg }}>
          <Text variant="label" tone="muted" style={{ marginBottom: spacing.xs }}>
            ABOUT
          </Text>
          <Text>{vendor.description}</Text>
        </Card>
      ) : null}

      {vendor.tags?.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.md }}>
          {vendor.tags.map((t) => (
            <View
              key={t}
              style={{
                paddingVertical: 2,
                paddingHorizontal: spacing.sm,
                backgroundColor: colors.surfaceAlt,
                borderRadius: 999,
              }}
            >
              <Text variant="caption" tone="muted">
                #{t}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {vendor.schedule?.length ? (
        <Card style={{ marginTop: spacing.lg }}>
          <Text variant="label" tone="muted" style={{ marginBottom: spacing.xs }}>
            UPCOMING SCHEDULE
          </Text>
          {vendor.schedule.map((s, i) => (
            <ScheduleItem key={`${s.day}-${i}`} entry={s} />
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}
