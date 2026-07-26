// app/(app)/contact/[id].tsx
// Contact detail: grade hero, where-met + premises, quick actions that log
// interactions automatically, a manual "log interaction" composer, and the
// full interaction history.

import React, { useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../../src/components/Screen';
import { Text } from '../../../src/components/Text';
import { Card } from '../../../src/components/Card';
import { Button } from '../../../src/components/Button';
import { TextField } from '../../../src/components/TextField';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { useContacts } from '../../../src/features/contacts/ContactsContext';
import { GradeBadge } from '../../../src/features/contacts/components/GradeBadge';
import { pointsToNextTier, INTERACTION_WEIGHTS } from '../../../src/features/contacts/grading';
import type { InteractionKind } from '../../../src/features/contacts/types';
import { notify, confirm } from '../../../src/lib/notify';

const KIND_META: Record<InteractionKind, { label: string; icon: keyof typeof Ionicons.glyphMap }> = {
  call: { label: 'Call', icon: 'call-outline' },
  text: { label: 'Text', icon: 'chatbubble-outline' },
  email: { label: 'Email', icon: 'mail-outline' },
  visit: { label: 'Visit', icon: 'people-outline' },
  premise: { label: 'Premise', icon: 'sparkles-outline' },
  note: { label: 'Note', icon: 'create-outline' },
};

export default function ContactDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors, spacing, radius } = useTheme();
  const { contactById, gradeFor, interactionsFor, logInteraction, deleteContact } = useContacts();
  const [logKind, setLogKind] = useState<InteractionKind>('note');
  const [logNote, setLogNote] = useState('');
  const [saving, setSaving] = useState(false);

  const contact = id ? contactById(id) : undefined;
  if (!contact) {
    return (
      <Screen center>
        <Text tone="muted">Contact not found.</Text>
      </Screen>
    );
  }

  const grade = gradeFor(contact.id);
  const history = interactionsFor(contact.id);
  const name = `${contact.firstName} ${contact.lastName}`.trim();
  const next = pointsToNextTier(grade.score);
  const phone = contact.phones[0]?.number;
  const email = contact.emails[0]?.address;

  const act = async (kind: InteractionKind, open?: () => Promise<unknown>) => {
    try {
      if (open) await open();
      await logInteraction({ contactId: contact.id, kind });
    } catch (e) {
      notify('Action failed', e instanceof Error ? e.message : String(e));
    }
  };

  const quick = (
    kind: InteractionKind,
    enabled: boolean,
    open?: () => Promise<unknown>,
  ) => (
    <Pressable
      key={kind}
      accessibilityRole="button"
      disabled={!enabled}
      onPress={() => void act(kind, open)}
      style={({ pressed }) => ({
        flex: 1,
        alignItems: 'center',
        gap: 4,
        paddingVertical: spacing.md,
        borderRadius: radius.md,
        backgroundColor: pressed ? colors.surfaceAlt : colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        opacity: enabled ? 1 : 0.4,
      })}
    >
      <Ionicons name={KIND_META[kind].icon} size={20} color={colors.primary} />
      <Text variant="caption">{KIND_META[kind].label}</Text>
    </Pressable>
  );

  return (
    <Screen scroll>
      <Stack.Screen
        options={{
          title: name || 'Contact',
          headerRight: () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Edit contact"
              onPress={() => router.push({ pathname: '/contact/edit', params: { id: contact.id } })}
            >
              <Text tone="primary" weight="semibold">Edit</Text>
            </Pressable>
          ),
        }}
      />

      <GradeBadge grade={grade} variant="hero" />
      {next ? (
        <Text variant="caption" tone="muted" style={{ marginTop: spacing.xs }}>
          {`${next.points} points to ${next.next.label} — a call is +${INTERACTION_WEIGHTS.call}, a visit +${INTERACTION_WEIGHTS.visit}.`}
        </Text>
      ) : null}

      <Text variant="title" weight="bold" style={{ marginTop: spacing.lg }}>
        {name}
      </Text>
      {(contact.title || contact.company) ? (
        <Text tone="muted">{[contact.title, contact.company].filter(Boolean).join(' · ')}</Text>
      ) : null}

      {/* Quick actions — each opens the channel AND logs the touch. */}
      <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg }}>
        {quick('call', !!phone, () => Linking.openURL(`tel:${encodeURIComponent(phone ?? '')}`))}
        {quick('text', !!phone, () => Linking.openURL(`sms:${encodeURIComponent(phone ?? '')}`))}
        {quick('email', !!email, () => Linking.openURL(`mailto:${encodeURIComponent(email ?? '')}`))}
        {quick('visit', true)}
      </View>

      {contact.whereMet ? (
        <Card style={{ marginTop: spacing.lg }}>
          <Text variant="label" tone="muted">WHERE WE MET</Text>
          <Text weight="semibold" style={{ marginTop: spacing.xs }}>
            {contact.whereMet.placeName}
            {contact.whereMet.city ? ` — ${contact.whereMet.city}` : ''}
          </Text>
          {contact.whereMet.note ? <Text tone="muted">{contact.whereMet.note}</Text> : null}
        </Card>
      ) : null}

      {contact.premises.length > 0 ? (
        <Card style={{ marginTop: spacing.md }}>
          <Text variant="label" tone="muted">PREMISES</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm }}>
            {contact.premises.map((p) => (
              <View
                key={p.id}
                style={{
                  borderRadius: radius.pill,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.surfaceAlt,
                  paddingVertical: 4,
                  paddingHorizontal: spacing.md,
                }}
              >
                <Text variant="caption">
                  <Text variant="caption" tone="muted">{`${p.kind} · `}</Text>
                  {p.label}
                  {p.tags.length ? <Text variant="caption" tone="muted">{`  #${p.tags.join(' #')}`}</Text> : null}
                </Text>
              </View>
            ))}
          </View>
        </Card>
      ) : null}

      {contact.notes ? (
        <Card style={{ marginTop: spacing.md }}>
          <Text variant="label" tone="muted">NOTES</Text>
          <Text style={{ marginTop: spacing.xs }}>{contact.notes}</Text>
        </Card>
      ) : null}

      {/* Manual interaction logger */}
      <Card style={{ marginTop: spacing.lg }}>
        <Text variant="label" tone="muted">LOG AN INTERACTION</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginVertical: spacing.sm }}>
          {(Object.keys(KIND_META) as InteractionKind[]).map((kind) => (
            <Pressable
              key={kind}
              accessibilityRole="button"
              onPress={() => setLogKind(kind)}
              style={{
                borderRadius: radius.pill,
                borderWidth: 1,
                borderColor: logKind === kind ? colors.primary : colors.border,
                backgroundColor: logKind === kind ? colors.primary : 'transparent',
                paddingVertical: 4,
                paddingHorizontal: spacing.md,
              }}
            >
              <Text variant="caption" tone={logKind === kind ? 'inverse' : 'default'}>
                {`${KIND_META[kind].label} +${INTERACTION_WEIGHTS[kind]}`}
              </Text>
            </Pressable>
          ))}
        </View>
        <TextField
          placeholder="Optional note (what did you talk about?)"
          value={logNote}
          onChangeText={setLogNote}
        />
        <Button
          title="Log it"
          loading={saving}
          onPress={() => {
            setSaving(true);
            void logInteraction({ contactId: contact.id, kind: logKind, note: logNote || undefined })
              .then(() => setLogNote(''))
              .catch((e) => notify('Could not log', e instanceof Error ? e.message : String(e)))
              .finally(() => setSaving(false));
          }}
        />
      </Card>

      {/* History */}
      <Text variant="label" tone="muted" style={{ marginTop: spacing.xl, marginBottom: spacing.sm }}>
        {`HISTORY (${history.length})`}
      </Text>
      <View style={{ gap: spacing.sm }}>
        {history.length === 0 ? (
          <Text tone="muted">No interactions yet — the grade starts climbing with the first one.</Text>
        ) : (
          history.map((i) => (
            <View
              key={i.id}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.md,
                paddingVertical: spacing.sm,
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
              }}
            >
              <Ionicons name={KIND_META[i.kind].icon} size={16} color={colors.textMuted} />
              <View style={{ flex: 1 }}>
                <Text variant="label">{KIND_META[i.kind].label}</Text>
                {i.note ? <Text variant="caption" tone="muted">{i.note}</Text> : null}
              </View>
              <Text variant="caption" tone="muted">
                {new Date(i.occurredAt).toLocaleDateString()}
              </Text>
            </View>
          ))
        )}
      </View>

      <Button
        title="Delete contact"
        variant="danger"
        style={{ marginTop: spacing.xxl }}
        onPress={() =>
          confirm('Delete contact?', `${name} and their interaction history will be removed.`, () => {
            void deleteContact(contact.id).then(() => router.back());
          })
        }
      />
    </Screen>
  );
}
