// app/(app)/(tabs)/favorites.tsx
// Vendors the current user follows.

import { useMemo } from 'react';
import { FlatList, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Text } from '../../../src/components/Text';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { useVendors } from '../../../src/features/vendors/VendorContext';
import { VendorCard } from '../../../src/features/vendors/components/VendorCard';

export default function FavoritesScreen() {
  const { vendors, favorites, toggleFavorite } = useVendors();
  const { colors, spacing } = useTheme();
  const router = useRouter();

  const followed = useMemo(
    () => vendors.filter((v) => favorites.includes(v.id)),
    [vendors, favorites],
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <FlatList
        data={followed}
        keyExtractor={(v) => v.id}
        contentContainerStyle={{ padding: spacing.lg }}
        ListEmptyComponent={
          <Text tone="muted" style={{ marginTop: spacing.xl }} center>
            You aren&apos;t following any vendors yet. Tap the star on a vendor to follow.
          </Text>
        }
        renderItem={({ item }) => (
          <VendorCard
            vendor={item}
            isFavorite
            onPress={() => router.push(`/(app)/vendor/${item.id}`)}
            onToggleFavorite={() => void toggleFavorite(item.id)}
          />
        )}
      />
    </View>
  );
}
