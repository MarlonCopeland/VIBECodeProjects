// app/(app)/outreach/text.tsx
// Text blast: compose once, send as INDIVIDUAL texts one at a time (mobile
// OSes provide no mass-SMS API by design — the stepper pre-fills each
// compose). Every send logs a `text` interaction, feeding the grade.

import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '../../../src/components/Screen';
import { Text } from '../../../src/components/Text';
import { Button } from '../../../src/components/Button';
import { TextField } from '../../../src/components/TextField';
import { Card } from '../../../src/components/Card';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { useContacts } from '../../../src/features/contacts/ContactsContext';
import { matchCircle } from '../../../src/features/circles/circlesService';
import { composeSms, personalize, smsTargets } from '../../../src/features/outreach/outreachService';
import { GradeBadge } from '../../../src/features/contacts/components/GradeBadge';
import { notify } from '../../../src/lib/notify';

export default function TextBlastScreen() {
  const { circleId } = useLocalSearchParams<{ circleId?: string }>();
  const router = useRouter();
  const { spacing } = useTheme();
  const { circles, contacts, gradeFor, logInteraction } = useContacts();

  const circle = circles.find((c) => c.id === circleId);
  const targets = useMemo(() => {
    const members = circle
      ? matchCircle(circle, contacts, gradeFor).map((m) => m.contact)
      : contacts;
    return smsTargets(members);
  }, [circle, contacts, gradeFor]);

  const [message, setMessage] = useState('');
  const [index, setIndex] = useState(0);
  const [sent, setSent] = useState(0);
  const [busy, setBusy] = useState(false);

  const current = targets[index];
  const done = index >= targets.length;

  const sendCurrent = async () => {
    if (!current || !message.trim()) return;
    setBusy(true);
    try {
      const ok = await composeSms(current, personalize(message, current.contact));
      if (ok) {
        await logInteraction({ contactId: current.contact.id, kind: 'text', note: 'Text blast' });
        setSent((n) => n + 1);
      }
      setIndex((i) => i + 1);
    } catch (e) {
      notify('Send failed', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll>
      <Text tone="muted" style={{ marginBottom: spacing.md }}>
        {circle ? `Circle: ${circle.name} · ` : ''}
        {`${targets.length} contact${targets.length === 1 ? '' : 's'} with a phone number. Each gets an individual text — nobody sees a group thread.`}
      </Text>

      <TextField
        label="Message"
        placeholder="Hey {first} — it's been a minute! …"
        helper="{first}, {last}, and {name} personalize each text."
        multiline
        numberOfLines={4}
        value={message}
        onChangeText={setMessage}
      />

      {done ? (
        <Card style={{ marginTop: spacing.lg }}>
          <Text variant="heading" weight="bold">Blast complete</Text>
          <Text tone="muted" style={{ marginTop: spacing.xs }}>
            {`${sent} of ${targets.length} sent and logged — each contact's grade just got +5.`}
          </Text>
          <Button title="Done" style={{ marginTop: spacing.lg }} onPress={() => router.back()} />
        </Card>
      ) : current ? (
        <Card style={{ marginTop: spacing.lg }}>
          <Text variant="label" tone="muted">
            {`SENDING ${index + 1} OF ${targets.length}`}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm }}>
            <Text variant="heading" weight="semibold">
              {`${current.contact.firstName} ${current.contact.lastName}`.trim()}
            </Text>
            <GradeBadge grade={gradeFor(current.contact.id)} variant="dot" />
          </View>
          <Text tone="muted">{current.address}</Text>
          {message.trim() ? (
            <Text variant="caption" tone="muted" style={{ marginTop: spacing.sm }}>
              {`Preview: ${personalize(message, current.contact)}`}
            </Text>
          ) : null}
          <Button
            title="Open text composer"
            loading={busy}
            disabled={!message.trim()}
            style={{ marginTop: spacing.lg }}
            onPress={() => void sendCurrent()}
          />
          <Button title="Skip" variant="ghost" style={{ marginTop: spacing.sm }} onPress={() => setIndex((i) => i + 1)} />
        </Card>
      ) : (
        <Text tone="muted" style={{ marginTop: spacing.lg }}>
          No contacts with phone numbers in this circle.
        </Text>
      )}
    </Screen>
  );
}
