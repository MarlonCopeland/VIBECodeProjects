// app/(app)/(tabs)/index.tsx
// Home: vendors sorted open-now first, then by distance. Pull to refresh.

import { useMemo } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Text } from '../../../src/components/Text';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { useVendors } from '../../../src/features/vendors/VendorContext';
import { VendorCard } from '../../../src/features/vendors/components/VendorCard';
import type { Vendor } from '../../../src/backend/types';

export default function HomeScreen() {
  const { vendors, favorites, loading, refresh, toggleFavorite } = useVendors();
  const { colors, spacing } = useTheme();
  const router = useRouter();

  const sorted = useMemo(() => {
    const dist = (v: Vendor) => (typeof v.distanceKm === 'number' ? v.distanceKm : Infinity);
    return [...vendors].sort((a, b) => {
      if (a.isOpen !== b.isOpen) return a.isOpen ? -1 : 1;
      return dist(a) - dist(b);
    });
  }, [vendors]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <FlatList
        data={sorted}
        keyExtractor={(v) => v.id}
        contentContainerStyle={{ padding: spacing.lg }}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={refresh} tintColor={colors.primary} />
        }
        ListHeaderComponent={
          <Text variant="title" weight="bold" style={{ marginBottom: spacing.md }}>
            Vendors near you
          </Text>
        }
        ListEmptyComponent={
          <Text tone="muted" style={{ marginTop: spacing.xl }} center>
            No vendors yet. Pull to refresh.
          </Text>
        }
        renderItem={({ item }) => (
          <VendorCard
            vendor={item}
            isFavorite={favorites.includes(item.id)}
            onPress={() => router.push(`/(app)/vendor/${item.id}`)}
            onToggleFavorite={() => void toggleFavorite(item.id)}
          />
        )}
      />
    </View>
  );
}
