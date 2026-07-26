// app/(app)/(tabs)/circles.tsx
// Circles of Influence: saved premise queries that surface matching contacts.

import React from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../../src/components/Screen';
import { Text } from '../../../src/components/Text';
import { Card } from '../../../src/components/Card';
import { Button } from '../../../src/components/Button';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { useContacts } from '../../../src/features/contacts/ContactsContext';
import { matchCircle } from '../../../src/features/circles/circlesService';

export default function CirclesScreen() {
  const router = useRouter();
  const { colors, spacing } = useTheme();
  const { circles, contacts, gradeFor } = useContacts();

  return (
    <Screen scroll>
      <Text tone="muted" style={{ marginBottom: spacing.lg }}>
        A circle is a premise — an event, topic, expertise, hobby, or interest.
        Legend surfaces everyone who matches it, ready to text, email, or call.
      </Text>

      <View style={{ gap: spacing.md }}>
        {circles.length === 0 ? (
          <Text tone="muted">No circles yet — create your first one.</Text>
        ) : (
          circles.map((circle) => {
            const members = matchCircle(circle, contacts, gradeFor);
            const summary = [
              circle.query.tags.length ? `#${circle.query.tags.join(' #')}` : '',
              circle.query.kinds.join(', '),
              circle.query.text ? `"${circle.query.text}"` : '',
            ]
              .filter(Boolean)
              .join(' · ');
            return (
              <Pressable
                key={circle.id}
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/circle/[id]', params: { id: circle.id } })}
              >
                <Card>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text weight="semibold">{circle.name}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Ionicons name="people-outline" size={14} color={colors.textMuted} />
                      <Text variant="caption" tone="muted">{`${members.length}`}</Text>
                    </View>
                  </View>
                  {summary ? (
                    <Text variant="caption" tone="muted" style={{ marginTop: spacing.xs }}>{summary}</Text>
                  ) : null}
                </Card>
              </Pressable>
            );
          })
        )}
      </View>

      <Button
        title="New circle"
        onPress={() => router.push('/circle/edit')}
        style={{ marginTop: spacing.xl }}
      />
    </Screen>
  );
}
