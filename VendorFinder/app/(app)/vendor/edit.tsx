// app/(app)/vendor/edit.tsx
// Edit the acting vendor's profile: name, type, tags, and description.

import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Screen } from '../../../src/components/Screen';
import { Text } from '../../../src/components/Text';
import { TextField } from '../../../src/components/TextField';
import { Button } from '../../../src/components/Button';
import { Banner } from '../../../src/components/Banner';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { useAuth } from '../../../src/features/auth/AuthContext';
import { vendorToolsService } from '../../../src/features/vendorTools';
import { VENDOR_TYPES } from '../../../src/features/vendors';
import { useAsyncAction } from '../../../src/lib/useAsyncAction';
import type { Vendor, VendorType } from '../../../src/backend/types';

export default function EditVendorProfileScreen() {
  const { user } = useAuth();
  const { colors, spacing, radius } = useTheme();
  const router = useRouter();

  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<VendorType>('Other');
  const [tags, setTags] = useState('');
  const [description, setDescription] = useState('');
  const { error, busy, run } = useAsyncAction();

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      void run(async () => {
        const v = await vendorToolsService.getByOwner(user.id);
        if (!v) return;
        setVendor(v);
        setName(v.name);
        setType(v.type);
        setTags((v.tags || []).join(', '));
        setDescription(v.description || '');
      });
    }, [user, run]),
  );

  if (!vendor) {
    return (
      <Screen center>
        <Text tone="muted">No vendor record found.</Text>
      </Screen>
    );
  }

  const save = () =>
    run(async () => {
      await vendorToolsService.update(vendor.id, {
        name: name.trim(),
        type,
        tags: tags
          .split(',')
          .map((t) => t.trim().toLowerCase())
          .filter(Boolean),
        description: description.trim(),
      });
      router.back();
    });

  return (
    <Screen scroll>
      <Banner kind="error" message={error} />

      <TextField label="Vendor name" value={name} onChangeText={setName} placeholder="Vendor name" />

      <Text variant="label" tone="muted" style={{ marginBottom: spacing.xs }}>
        Type
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.md }}>
        {VENDOR_TYPES.map((t) => {
          const active = type === t;
          return (
            <Pressable
              key={t}
              onPress={() => setType(t)}
              style={{
                paddingVertical: spacing.xs,
                paddingHorizontal: spacing.md,
                borderRadius: radius.sm,
                borderWidth: 1,
                borderColor: active ? colors.primary : colors.border,
                backgroundColor: active ? colors.primary : 'transparent',
              }}
            >
              <Text variant="label" tone={active ? 'inverse' : 'default'}>
                {t}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <TextField
        label="Tags (comma-separated)"
        value={tags}
        onChangeText={setTags}
        placeholder="pizza, lunch, sandwiches"
        autoCapitalize="none"
      />
      <TextField
        label="Description"
        value={description}
        onChangeText={setDescription}
        placeholder="Tell customers what you offer"
        multiline
        numberOfLines={3}
      />

      <Button title="Save changes" onPress={save} loading={busy} />
    </Screen>
  );
}
