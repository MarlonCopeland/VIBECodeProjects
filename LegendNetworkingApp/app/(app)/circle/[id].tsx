// app/(app)/circle/[id].tsx
// Circle detail: matched members with grades + match reasons, pin/exclude
// overrides, and the three outreach launchers (text blast, email, call list).

import React from 'react';
import { Pressable, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../../src/components/Screen';
import { Text } from '../../../src/components/Text';
import { Button } from '../../../src/components/Button';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { useContacts } from '../../../src/features/contacts/ContactsContext';
import { matchCircle } from '../../../src/features/circles/circlesService';
import { GradeBadge } from '../../../src/features/contacts/components/GradeBadge';
import { isFeatureEnabled } from '../../../src/config/features';

export default function CircleDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors, spacing } = useTheme();
  const { circles, contacts, gradeFor, updateCircle } = useContacts();

  const circle = circles.find((c) => c.id === id);
  if (!circle) {
    return (
      <Screen center>
        <Text tone="muted">Circle not found.</Text>
      </Screen>
    );
  }

  const members = matchCircle(circle, contacts, gradeFor);
  const outreach = isFeatureEnabled('outreach');

  const togglePin = (contactId: string) => {
    const pinned = circle.pinnedContactIds.includes(contactId)
      ? circle.pinnedContactIds.filter((x) => x !== contactId)
      : [...circle.pinnedContactIds, contactId];
    void updateCircle(circle.id, { pinnedContactIds: pinned });
  };

  const exclude = (contactId: string) => {
    void updateCircle(circle.id, {
      excludedContactIds: [...circle.excludedContactIds, contactId],
      pinnedContactIds: circle.pinnedContactIds.filter((x) => x !== contactId),
    });
  };

  return (
    <Screen scroll>
      <Stack.Screen
        options={{
          title: circle.name,
          headerRight: () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Edit circle"
              onPress={() => router.push({ pathname: '/circle/edit', params: { id: circle.id } })}
            >
              <Text tone="primary" weight="semibold">Edit</Text>
            </Pressable>
          ),
        }}
      />

      <Text tone="muted">
        {`${members.length} member${members.length === 1 ? '' : 's'} match this premise.`}
      </Text>
      {circle.excludedContactIds.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => void updateCircle(circle.id, { excludedContactIds: [] })}
        >
          <Text variant="caption" tone="primary" style={{ marginTop: spacing.xs }}>
            {`${circle.excludedContactIds.length} excluded — tap to restore all`}
          </Text>
        </Pressable>
      ) : null}

      {outreach ? (
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginVertical: spacing.lg }}>
          <View style={{ flex: 1 }}>
            <Button
              title="Text all"
              onPress={() => router.push({ pathname: '/outreach/text', params: { circleId: circle.id } })}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              title="Email all"
              variant="secondary"
              onPress={() => router.push({ pathname: '/outreach/email', params: { circleId: circle.id } })}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              title="Call list"
              variant="secondary"
              onPress={() => router.push({ pathname: '/outreach/calls', params: { circleId: circle.id } })}
            />
          </View>
        </View>
      ) : null}

      <View>
        {members.map((m) => {
          const name = `${m.contact.firstName} ${m.contact.lastName}`.trim();
          return (
            <View
              key={m.contact.id}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.md,
                paddingVertical: spacing.md,
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
              }}
            >
              <Pressable
                accessibilityRole="button"
                style={{ flex: 1 }}
                onPress={() => router.push({ pathname: '/contact/[id]', params: { id: m.contact.id } })}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <Text weight="semibold">{name}</Text>
                  <GradeBadge grade={m.grade} variant="dot" />
                </View>
                <Text variant="caption" tone="muted" numberOfLines={1}>
                  {m.reasons.join(' · ')}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={m.pinned ? `Unpin ${name}` : `Pin ${name}`}
                onPress={() => togglePin(m.contact.id)}
                hitSlop={8}
              >
                <Ionicons
                  name={m.pinned ? 'star' : 'star-outline'}
                  size={20}
                  color={m.pinned ? colors.warning : colors.textMuted}
                />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Exclude ${name}`}
                onPress={() => exclude(m.contact.id)}
                hitSlop={8}
              >
                <Ionicons name="remove-circle-outline" size={20} color={colors.textMuted} />
              </Pressable>
            </View>
          );
        })}
        {members.length === 0 ? (
          <Text tone="muted" style={{ marginTop: spacing.lg }}>
            No matches. Edit the circle to broaden its premise, or add premises/tags to your contacts.
          </Text>
        ) : null}
      </View>
    </Screen>
  );
}
