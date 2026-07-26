// app/(app)/circle/edit.tsx
// Circle builder. Pick premise kinds, tags (from your network's existing
// tags plus free entry), and free text — with a live preview of who matches
// while you edit. ?id= edits an existing circle.

import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '../../../src/components/Screen';
import { Text } from '../../../src/components/Text';
import { Button } from '../../../src/components/Button';
import { TextField } from '../../../src/components/TextField';
import { Card } from '../../../src/components/Card';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { useContacts } from '../../../src/features/contacts/ContactsContext';
import { collectTags, matchCircle } from '../../../src/features/circles/circlesService';
import { PREMISE_KINDS, type Circle, type PremiseKind } from '../../../src/features/contacts/types';
import { notify, confirm } from '../../../src/lib/notify';

export default function CircleEditScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const { colors, spacing, radius } = useTheme();
  const { circles, contacts, gradeFor, createCircle, updateCircle, deleteCircle } = useContacts();

  const existing = id ? circles.find((c) => c.id === id) : undefined;

  const [name, setName] = useState(existing?.name ?? '');
  const [kinds, setKinds] = useState<PremiseKind[]>(existing?.query.kinds ?? []);
  const [tags, setTags] = useState<string[]>(existing?.query.tags ?? []);
  const [tagEntry, setTagEntry] = useState('');
  const [text, setText] = useState(existing?.query.text ?? '');
  const [saving, setSaving] = useState(false);

  const networkTags = useMemo(() => collectTags(contacts), [contacts]);

  const draft: Circle = useMemo(
    () => ({
      id: existing?.id ?? 'draft',
      ownerId: existing?.ownerId ?? 'draft',
      name,
      query: { kinds, tags, text: text.trim() || undefined },
      pinnedContactIds: existing?.pinnedContactIds ?? [],
      excludedContactIds: existing?.excludedContactIds ?? [],
      createdAt: existing?.createdAt ?? '',
      updatedAt: existing?.updatedAt ?? '',
    }),
    [existing, name, kinds, tags, text],
  );
  const preview = useMemo(() => matchCircle(draft, contacts, gradeFor), [draft, contacts, gradeFor]);

  const toggleTag = (tag: string) =>
    setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));

  const addTagEntry = () => {
    const cleaned = tagEntry
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    if (cleaned.length) setTags((prev) => [...new Set([...prev, ...cleaned])]);
    setTagEntry('');
  };

  const save = async () => {
    if (!name.trim()) {
      notify('Name required', 'Give the circle a name.');
      return;
    }
    setSaving(true);
    try {
      const input = {
        name: name.trim(),
        query: { kinds, tags, text: text.trim() || undefined },
      };
      if (existing) await updateCircle(existing.id, input);
      else await createCircle(input);
      router.back();
    } catch (e) {
      notify('Save failed', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const chip = (label: string, active: boolean, onPress: () => void) => (
    <Pressable
      key={label}
      accessibilityRole="button"
      onPress={onPress}
      style={{
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: active ? colors.primary : colors.border,
        backgroundColor: active ? colors.primary : 'transparent',
        paddingVertical: 4,
        paddingHorizontal: spacing.md,
      }}
    >
      <Text variant="caption" tone={active ? 'inverse' : 'default'}>{label}</Text>
    </Pressable>
  );

  return (
    <Screen scroll>
      <Stack.Screen options={{ title: existing ? 'Edit Circle' : 'New Circle' }} />

      <TextField label="Circle name" placeholder='e.g. "Real Estate People"' value={name} onChangeText={setName} />

      <Text variant="label" tone="muted" style={{ marginBottom: spacing.sm }}>PREMISE KINDS</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg }}>
        {PREMISE_KINDS.map((kind) =>
          chip(kind, kinds.includes(kind), () =>
            setKinds((prev) => (prev.includes(kind) ? prev.filter((k) => k !== kind) : [...prev, kind])),
          ),
        )}
      </View>

      <Text variant="label" tone="muted" style={{ marginBottom: spacing.sm }}>TAGS</Text>
      {networkTags.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm }}>
          {networkTags.slice(0, 20).map((tag) => chip(`#${tag}`, tags.includes(tag), () => toggleTag(tag)))}
          {tags
            .filter((t) => !networkTags.includes(t))
            .map((tag) => chip(`#${tag}`, true, () => toggleTag(tag)))}
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <TextField
            placeholder="Add tags, comma-separated"
            autoCapitalize="none"
            value={tagEntry}
            onChangeText={setTagEntry}
            onSubmitEditing={addTagEntry}
          />
        </View>
        <Button title="Add" variant="secondary" fullWidth={false} onPress={addTagEntry} />
      </View>

      <TextField
        label="Free text"
        placeholder="Matches premise labels, company, title, where met"
        value={text}
        onChangeText={setText}
      />

      <Card style={{ marginVertical: spacing.lg }}>
        <Text variant="label" tone="muted">{`LIVE PREVIEW — ${preview.length} MATCH${preview.length === 1 ? '' : 'ES'}`}</Text>
        <View style={{ marginTop: spacing.sm, gap: spacing.xs }}>
          {preview.slice(0, 6).map((m) => (
            <Text key={m.contact.id} variant="label">
              {`${m.contact.firstName} ${m.contact.lastName}`.trim()}
              <Text variant="caption" tone="muted">{`  ${m.reasons.join(', ')}`}</Text>
            </Text>
          ))}
          {preview.length > 6 ? (
            <Text variant="caption" tone="muted">{`…and ${preview.length - 6} more`}</Text>
          ) : null}
          {preview.length === 0 ? (
            <Text variant="caption" tone="muted">No matches yet — pick tags or kinds that exist on your contacts.</Text>
          ) : null}
        </View>
      </Card>

      <Button title={existing ? 'Save circle' : 'Create circle'} loading={saving} onPress={() => void save()} />
      {existing ? (
        <Button
          title="Delete circle"
          variant="danger"
          style={{ marginTop: spacing.sm }}
          onPress={() =>
            confirm('Delete circle?', `"${existing.name}" will be removed. Contacts are untouched.`, () => {
              void deleteCircle(existing.id).then(() => router.back());
            })
          }
        />
      ) : null}
      <Button title="Cancel" variant="ghost" onPress={() => router.back()} style={{ marginTop: spacing.sm }} />
    </Screen>
  );
}
