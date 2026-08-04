// app/(app)/(tabs)/search.tsx
// Full-text search over name/type/description/tags, with an "open now" toggle.

import { useMemo, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Text } from '../../../src/components/Text';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { useVendors } from '../../../src/features/vendors/VendorContext';
import { VendorCard } from '../../../src/features/vendors/components/VendorCard';
import { SearchBar } from '../../../src/features/vendors/components/SearchBar';

export default function SearchScreen() {
  const { vendors, favorites, toggleFavorite } = useVendors();
  const { colors, spacing, radius } = useTheme();
  const router = useRouter();

  const [query, setQuery] = useState('');
  const [openOnly, setOpenOnly] = useState(false);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return vendors.filter((v) => {
      if (openOnly && !v.isOpen) return false;
      if (!q) return true;
      return (
        v.name.toLowerCase().includes(q) ||
        v.type.toLowerCase().includes(q) ||
        (v.description || '').toLowerCase().includes(q) ||
        (v.tags || []).some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [vendors, query, openOnly]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, padding: spacing.lg }}>
      <SearchBar value={query} onChangeText={setQuery} />
      <Pressable
        onPress={() => setOpenOnly((v) => !v)}
        style={{
          alignSelf: 'flex-start',
          paddingVertical: spacing.xs,
          paddingHorizontal: spacing.md,
          borderRadius: radius.sm,
          borderWidth: 1,
          borderColor: openOnly ? colors.primary : colors.border,
          backgroundColor: openOnly ? colors.primary : 'transparent',
          marginBottom: spacing.md,
        }}
      >
        <Text variant="label" tone={openOnly ? 'inverse' : 'default'}>
          Open now
        </Text>
      </Pressable>

      <FlatList
        data={results}
        keyExtractor={(v) => v.id}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <Text tone="muted" style={{ marginTop: spacing.xl }} center>
            No matches.
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
