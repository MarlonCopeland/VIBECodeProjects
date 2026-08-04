// app/(app)/settings/templates.tsx
// Manage saved outreach message templates. Text templates are body-only;
// email templates add a subject. {first}/{last}/{name} placeholders are
// filled per recipient at send time (see outreachService.personalize).

import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../../src/components/Screen';
import { Text } from '../../../src/components/Text';
import { Card } from '../../../src/components/Card';
import { Button } from '../../../src/components/Button';
import { TextField } from '../../../src/components/TextField';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { useAppSettings, type MessageTemplate } from '../../../src/features/settings/AppSettingsContext';
import { confirm, notify } from '../../../src/lib/notify';

type Channel = 'text' | 'email';

interface Draft {
  id: string | null; // null = new
  name: string;
  channel: Channel;
  subject: string;
  body: string;
}

const EMPTY: Draft = { id: null, name: '', channel: 'text', subject: '', body: '' };

export default function TemplatesSettingsScreen() {
  const { spacing, colors, radius } = useTheme();
  const { templates, addTemplate, updateTemplate, removeTemplate } = useAppSettings();
  const [draft, setDraft] = useState<Draft | null>(null);

  const startEdit = (t: MessageTemplate) =>
    setDraft({ id: t.id, name: t.name, channel: t.channel, subject: t.subject ?? '', body: t.body });

  const save = () => {
    if (!draft) return;
    if (!draft.name.trim() || !draft.body.trim()) {
      notify('Missing fields', 'Give the template a name and a message body.');
      return;
    }
    const payload = {
      name: draft.name.trim(),
      channel: draft.channel,
      body: draft.body,
      subject: draft.channel === 'email' ? draft.subject.trim() || undefined : undefined,
    };
    if (draft.id) updateTemplate(draft.id, payload);
    else addTemplate(payload);
    setDraft(null);
  };

  if (draft) {
    return (
      <Screen scroll>
        <Stack.Screen options={{ title: draft.id ? 'Edit Template' : 'New Template' }} />
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md }}>
          {(['text', 'email'] as Channel[]).map((ch) => (
            <View key={ch} style={{ flex: 1 }}>
              <Button
                title={ch === 'text' ? 'Text' : 'Email'}
                variant={draft.channel === ch ? 'primary' : 'secondary'}
                onPress={() => setDraft({ ...draft, channel: ch })}
              />
            </View>
          ))}
        </View>
        <TextField
          label="Template name"
          placeholder="e.g. Check-in"
          value={draft.name}
          onChangeText={(v) => setDraft({ ...draft, name: v })}
        />
        {draft.channel === 'email' ? (
          <TextField
            label="Subject"
            value={draft.subject}
            onChangeText={(v) => setDraft({ ...draft, subject: v })}
          />
        ) : null}
        <TextField
          label="Message"
          helper="{first}, {last}, {name} are replaced per recipient."
          multiline
          numberOfLines={6}
          value={draft.body}
          onChangeText={(v) => setDraft({ ...draft, body: v })}
        />
        <Button title="Save template" onPress={save} />
        <Button title="Cancel" variant="ghost" style={{ marginTop: spacing.sm }} onPress={() => setDraft(null)} />
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <Stack.Screen options={{ title: 'Message Templates' }} />
      <Text tone="muted" style={{ marginBottom: spacing.lg }}>
        Reusable messages for text and email blasts. Pick one in the composer with "Use a template."
      </Text>

      <View style={{ gap: spacing.sm, marginBottom: spacing.lg }}>
        {templates.length === 0 ? (
          <Text tone="muted">No templates yet — create your first below.</Text>
        ) : (
          templates.map((t) => (
            <Card key={t.id}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <View
                  style={{
                    borderRadius: radius.pill,
                    backgroundColor: colors.surfaceAlt,
                    paddingHorizontal: spacing.sm,
                    paddingVertical: 2,
                  }}
                >
                  <Text variant="caption" tone="muted">{t.channel}</Text>
                </View>
                <Text weight="semibold" style={{ flex: 1 }}>{t.name}</Text>
                <Pressable accessibilityLabel={`Edit ${t.name}`} onPress={() => startEdit(t)} hitSlop={8}>
                  <Ionicons name="pencil" size={18} color={colors.primary} />
                </Pressable>
                <Pressable
                  accessibilityLabel={`Delete ${t.name}`}
                  onPress={() => confirm('Delete template?', `"${t.name}" will be removed.`, () => removeTemplate(t.id))}
                  hitSlop={8}
                >
                  <Ionicons name="trash-outline" size={18} color={colors.danger} />
                </Pressable>
              </View>
              {t.channel === 'email' && t.subject ? (
                <Text variant="caption" tone="muted" style={{ marginTop: spacing.xs }}>{`Subject: ${t.subject}`}</Text>
              ) : null}
              <Text variant="caption" tone="muted" numberOfLines={2} style={{ marginTop: 2 }}>{t.body}</Text>
            </Card>
          ))
        )}
      </View>

      <Button title="New template" onPress={() => setDraft(EMPTY)} />
    </Screen>
  );
}
