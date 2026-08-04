// app/(app)/outreach/email.tsx
// Email blast: one BCC message to the whole circle (recipients stay private
// from each other), or an individual stepper for personalized emails.
// Sends log `email` interactions.

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
import {
  composeBccEmail,
  composeEmail,
  emailTargets,
  personalize,
} from '../../../src/features/outreach/outreachService';
import { notify } from '../../../src/lib/notify';
import { useAppSettings } from '../../../src/features/settings/AppSettingsContext';
import { TemplateButton } from '../../../src/features/outreach/TemplateButton';

export default function EmailBlastScreen() {
  const { circleId } = useLocalSearchParams<{ circleId?: string }>();
  const router = useRouter();
  const { spacing } = useTheme();
  const { circles, contacts, gradeFor, logInteraction } = useContacts();
  const { applyMeExclusion } = useAppSettings();

  const circle = circles.find((c) => c.id === circleId);
  const targets = useMemo(() => {
    const members = circle
      ? matchCircle(circle, contacts, gradeFor).map((m) => m.contact)
      : contacts;
    return emailTargets(applyMeExclusion(members));
  }, [circle, contacts, gradeFor, applyMeExclusion]);

  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [mode, setMode] = useState<'bcc' | 'stepper'>('bcc');
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);

  const current = targets[index];
  const done = mode === 'stepper' && index >= targets.length;

  const sendBcc = async () => {
    setBusy(true);
    try {
      await composeBccEmail(targets, subject, body);
      await Promise.all(
        targets.map((t) =>
          logInteraction({ contactId: t.contact.id, kind: 'email', note: 'Email blast (BCC)' }),
        ),
      );
      notify('Logged', `Email interaction logged for ${targets.length} contacts.`);
      router.back();
    } catch (e) {
      notify('Email failed', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const sendCurrent = async () => {
    if (!current) return;
    setBusy(true);
    try {
      await composeEmail(current, subject, personalize(body, current.contact));
      await logInteraction({ contactId: current.contact.id, kind: 'email', note: 'Email blast' });
      setIndex((i) => i + 1);
    } catch (e) {
      notify('Email failed', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll>
      <Text tone="muted" style={{ marginBottom: spacing.md }}>
        {circle ? `Circle: ${circle.name} · ` : ''}
        {`${targets.length} contact${targets.length === 1 ? '' : 's'} with an email address.`}
      </Text>

      <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md }}>
        <View style={{ flex: 1 }}>
          <Button
            title="One BCC email"
            variant={mode === 'bcc' ? 'primary' : 'secondary'}
            onPress={() => setMode('bcc')}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            title="One-by-one"
            variant={mode === 'stepper' ? 'primary' : 'secondary'}
            onPress={() => setMode('stepper')}
          />
        </View>
      </View>

      <TemplateButton
        channel="email"
        onPick={(t) => {
          if (t.subject !== undefined) setSubject(t.subject);
          setBody(t.body);
        }}
      />
      <TextField label="Subject" value={subject} onChangeText={setSubject} />
      <TextField
        label="Body"
        placeholder={mode === 'stepper' ? 'Hi {first}, …' : 'Hi everyone, …'}
        helper={mode === 'stepper' ? '{first}, {last}, {name} personalize each email.' : 'Recipients are BCC’d — they never see each other.'}
        multiline
        numberOfLines={6}
        value={body}
        onChangeText={setBody}
      />

      {mode === 'bcc' ? (
        <Button
          title={`Open email to ${targets.length} recipients`}
          loading={busy}
          disabled={targets.length === 0 || !subject.trim()}
          onPress={() => void sendBcc()}
        />
      ) : done ? (
        <Card>
          <Text variant="heading" weight="bold">All done</Text>
          <Button title="Back" style={{ marginTop: spacing.lg }} onPress={() => router.back()} />
        </Card>
      ) : current ? (
        <Card>
          <Text variant="label" tone="muted">{`EMAIL ${index + 1} OF ${targets.length}`}</Text>
          <Text variant="heading" weight="semibold" style={{ marginTop: spacing.xs }}>
            {`${current.contact.firstName} ${current.contact.lastName}`.trim()}
          </Text>
          <Text tone="muted">{current.address}</Text>
          <Button
            title="Open email composer"
            loading={busy}
            disabled={!subject.trim()}
            style={{ marginTop: spacing.lg }}
            onPress={() => void sendCurrent()}
          />
          <Button title="Skip" variant="ghost" style={{ marginTop: spacing.sm }} onPress={() => setIndex((i) => i + 1)} />
        </Card>
      ) : (
        <Text tone="muted">No contacts with email addresses in this circle.</Text>
      )}
    </Screen>
  );
}
