// app/(app)/outreach/calls.tsx
// Call list: a working phone queue ordered stalest-first (never-contacted at
// the top — they need the touch most). Tap to dial, log the call, move on.

import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '../../../src/components/Screen';
import { Text } from '../../../src/components/Text';
import { Button } from '../../../src/components/Button';
import { Card } from '../../../src/components/Card';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { useContacts } from '../../../src/features/contacts/ContactsContext';
import { matchCircle } from '../../../src/features/circles/circlesService';
import { callTargets, dial, type OutreachTarget } from '../../../src/features/outreach/outreachService';
import { GradeBadge } from '../../../src/features/contacts/components/GradeBadge';
import { describeFreshness } from '../../../src/features/contacts/grading';
import { notify } from '../../../src/lib/notify';

export default function CallListScreen() {
  const { circleId } = useLocalSearchParams<{ circleId?: string }>();
  const router = useRouter();
  const { colors, spacing } = useTheme();
  const { circles, contacts, gradeFor, logInteraction } = useContacts();

  const circle = circles.find((c) => c.id === circleId);

  // Stalest first: never-contacted, then longest-since-touch.
  const queue = useMemo<OutreachTarget[]>(() => {
    const members = circle
      ? matchCircle(circle, contacts, gradeFor).map((m) => m.contact)
      : contacts;
    return callTargets(members).sort((a, b) => {
      const fa = gradeFor(a.contact.id).freshnessDays;
      const fb = gradeFor(b.contact.id).freshnessDays;
      if (fa === null && fb === null) return 0;
      if (fa === null) return -1;
      if (fb === null) return 1;
      return fb - fa;
    });
  }, [circle, contacts, gradeFor]);

  const [index, setIndex] = useState(0);
  const [calledIds, setCalledIds] = useState<string[]>([]);
  const current = queue[index];
  const done = index >= queue.length;

  const logAndNext = async () => {
    if (!current) return;
    try {
      await logInteraction({ contactId: current.contact.id, kind: 'call', note: 'Call list' });
      setCalledIds((prev) => [...prev, current.contact.id]);
      setIndex((i) => i + 1);
    } catch (e) {
      notify('Could not log', e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Screen scroll>
      <Text tone="muted" style={{ marginBottom: spacing.lg }}>
        {circle ? `Circle: ${circle.name} · ` : ''}
        {`${queue.length} callable contact${queue.length === 1 ? '' : 's'}, stalest first.`}
      </Text>

      {done ? (
        <Card>
          <Text variant="heading" weight="bold">Call list finished</Text>
          <Text tone="muted" style={{ marginTop: spacing.xs }}>
            {`${calledIds.length} call${calledIds.length === 1 ? '' : 's'} logged — grades updated (+10 each).`}
          </Text>
          <Button title="Done" style={{ marginTop: spacing.lg }} onPress={() => router.back()} />
        </Card>
      ) : current ? (
        <Card>
          <Text variant="label" tone="muted">{`CALL ${index + 1} OF ${queue.length}`}</Text>
          <Text variant="title" weight="bold" style={{ marginTop: spacing.xs }}>
            {`${current.contact.firstName} ${current.contact.lastName}`.trim()}
          </Text>
          <Text tone="muted">{current.address}</Text>
          <View style={{ marginTop: spacing.sm }}>
            <GradeBadge grade={gradeFor(current.contact.id)} variant="pill" />
          </View>
          <Text variant="caption" tone="muted" style={{ marginTop: spacing.sm }}>
            {`Last touch: ${describeFreshness(gradeFor(current.contact.id).freshnessDays)}`}
            {current.contact.premises[0] ? ` · Premise: ${current.contact.premises[0].label}` : ''}
            {current.contact.whereMet ? ` · Met at ${current.contact.whereMet.placeName}` : ''}
          </Text>

          <Button
            title="Call now"
            style={{ marginTop: spacing.lg }}
            onPress={() => void dial(current).catch((e) => notify('Could not dial', String(e)))}
          />
          <Button title="Log call & next" variant="secondary" style={{ marginTop: spacing.sm }} onPress={() => void logAndNext()} />
          <Button title="Skip" variant="ghost" style={{ marginTop: spacing.sm }} onPress={() => setIndex((i) => i + 1)} />
        </Card>
      ) : (
        <Text tone="muted">No contacts with phone numbers.</Text>
      )}

      {/* Upcoming queue */}
      {!done && queue.length > index + 1 ? (
        <View style={{ marginTop: spacing.xl }}>
          <Text variant="label" tone="muted" style={{ marginBottom: spacing.sm }}>UP NEXT</Text>
          {queue.slice(index + 1, index + 6).map((t) => (
            <View
              key={t.contact.id}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.sm,
                paddingVertical: spacing.sm,
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
              }}
            >
              <GradeBadge grade={gradeFor(t.contact.id)} variant="dot" />
              <Text variant="label" style={{ flex: 1 }}>
                {`${t.contact.firstName} ${t.contact.lastName}`.trim()}
              </Text>
              <Text variant="caption" tone="muted">
                {describeFreshness(gradeFor(t.contact.id).freshnessDays)}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </Screen>
  );
}
