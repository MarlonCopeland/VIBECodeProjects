// app/(app)/contact/knows.tsx
// Knows Connections picker: search the network and toggle who ?id= knows.
// Links are mutual and strong by contact id (see src/features/contacts/knows.ts).

import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../../src/components/Screen';
import { Text } from '../../../src/components/Text';
import { TextField } from '../../../src/components/TextField';
import { Avatar } from '../../../src/components/Avatar';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { useContacts } from '../../../src/features/contacts/ContactsContext';
import { displayNameOf } from '../../../src/features/contacts/knows';
import { notify } from '../../../src/lib/notify';

export default function KnowsPickerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, spacing } = useTheme();
  const { contacts, contactById, knowsFor, addKnows, removeKnows } = useContacts();
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const contact = id ? contactById(id) : undefined;
  const linkByOther = useMemo(() => {
    const map = new Map<string, string>();
    if (contact) for (const l of knowsFor(contact.id).linked) map.set(l.other.id, l.link.id);
    return map;
  }, [contact, knowsFor]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return contacts
      .filter((c) => c.id !== id)
      .filter((c) =>
        !q ||
        [displayNameOf(c), c.company ?? '', c.title ?? '', ...c.phones.map((p) => p.number)]
          .some((s) => s.toLowerCase().includes(q)),
      )
      .sort(
        (a, b) =>
          Number(linkByOther.has(b.id)) - Number(linkByOther.has(a.id)) ||
          displayNameOf(a).localeCompare(displayNameOf(b)),
      );
  }, [contacts, id, query, linkByOther]);

  if (!contact) {
    return (
      <Screen center>
        <Text tone="muted">Contact not found.</Text>
      </Screen>
    );
  }

  const toggle = async (otherId: string) => {
    setBusy(otherId);
    try {
      const linkId = linkByOther.get(otherId);
      if (linkId) await removeKnows(linkId);
      else await addKnows(contact.id, otherId);
    } catch (e) {
      notify('Could not update', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: `${contact.firstName || displayNameOf(contact)} knows…` }} />
      <TextField placeholder="Search name, company, phone" value={query} onChangeText={setQuery} />
      <Text variant="caption" tone="muted" style={{ marginBottom: spacing.sm }}>
        {`${linkByOther.size} linked · tap to link or unlink. Links show on both people.`}
      </Text>
      <FlatList
        data={rows}
        keyExtractor={(c) => c.id}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => {
          const linked = linkByOther.has(item.id);
          return (
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: linked, busy: busy === item.id }}
              disabled={busy !== null}
              onPress={() => void toggle(item.id)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.md,
                paddingVertical: spacing.sm,
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
                opacity: pressed || busy === item.id ? 0.5 : 1,
              })}
            >
              <Avatar uri={item.avatarUrl} name={displayNameOf(item)} size={36} />
              <View style={{ flex: 1 }}>
                <Text weight="medium">{displayNameOf(item) || 'Unnamed'}</Text>
                {item.company || item.title ? (
                  <Text variant="caption" tone="muted">{[item.title, item.company].filter(Boolean).join(' · ')}</Text>
                ) : null}
              </View>
              <Ionicons
                name={linked ? 'checkmark-circle' : 'ellipse-outline'}
                size={22}
                color={linked ? colors.primary : colors.textMuted}
              />
            </Pressable>
          );
        }}
        ListEmptyComponent={<Text tone="muted">No other contacts match.</Text>}
      />
    </Screen>
  );
}
