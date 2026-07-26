// app/(app)/contact/edit.tsx
// Add/edit contact. With ?id= it edits an existing contact; without, it
// creates one. Includes editors for phones/emails, where-met, and premises
// (kind + label + tags).

import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import { Screen } from '../../../src/components/Screen';
import { Text } from '../../../src/components/Text';
import { Button } from '../../../src/components/Button';
import { TextField } from '../../../src/components/TextField';
import { Card } from '../../../src/components/Card';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { useContacts } from '../../../src/features/contacts/ContactsContext';
import {
  PREMISE_KINDS,
  type ContactInput,
  type EmailEntry,
  type PhoneEntry,
  type Premise,
  type PremiseKind,
} from '../../../src/features/contacts/types';
import { notify } from '../../../src/lib/notify';

interface PremiseDraft {
  id: string;
  kind: PremiseKind;
  label: string;
  tagsText: string;
}

export default function ContactEditScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const { colors, spacing, radius } = useTheme();
  const { contactById, createContact, updateContact } = useContacts();

  const existing = id ? contactById(id) : undefined;

  const [firstName, setFirstName] = useState(existing?.firstName ?? '');
  const [lastName, setLastName] = useState(existing?.lastName ?? '');
  const [nickname, setNickname] = useState(existing?.nickname ?? '');
  const [company, setCompany] = useState(existing?.company ?? '');
  const [title, setTitle] = useState(existing?.title ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [phones, setPhones] = useState<PhoneEntry[]>(
    existing?.phones.length ? existing.phones : [{ label: 'mobile', number: '' }],
  );
  const [emails, setEmails] = useState<EmailEntry[]>(
    existing?.emails.length ? existing.emails : [{ label: 'work', address: '' }],
  );
  const [metPlace, setMetPlace] = useState(existing?.whereMet?.placeName ?? '');
  const [metCity, setMetCity] = useState(existing?.whereMet?.city ?? '');
  const [metNote, setMetNote] = useState(existing?.whereMet?.note ?? '');
  const [premises, setPremises] = useState<PremiseDraft[]>(
    (existing?.premises ?? []).map((p) => ({
      id: p.id,
      kind: p.kind,
      label: p.label,
      tagsText: p.tags.join(', '),
    })),
  );
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!firstName.trim() && !lastName.trim()) {
      notify('Name required', 'Give the contact at least a first or last name.');
      return;
    }
    const input: ContactInput = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      nickname: nickname.trim() || undefined,
      company: company.trim() || undefined,
      title: title.trim() || undefined,
      phones: phones.filter((p) => p.number.trim() !== ''),
      emails: emails.filter((e) => e.address.trim() !== ''),
      avatarUrl: existing?.avatarUrl ?? null,
      whereMet: metPlace.trim()
        ? { placeName: metPlace.trim(), city: metCity.trim() || undefined, note: metNote.trim() || undefined }
        : null,
      premises: premises
        .filter((p) => p.label.trim() !== '')
        .map<Premise>((p) => ({
          id: p.id,
          kind: p.kind,
          label: p.label.trim(),
          tags: p.tagsText
            .split(',')
            .map((t) => t.trim().toLowerCase())
            .filter(Boolean),
        })),
      notes: notes.trim() || undefined,
      favorite: existing?.favorite ?? false,
      source: existing?.source ?? 'manual',
    };
    setSaving(true);
    try {
      if (existing) await updateContact(existing.id, input);
      else await createContact(input);
      router.back();
    } catch (e) {
      notify('Save failed', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const removeButton = (onPress: () => void) => (
    <Pressable accessibilityRole="button" accessibilityLabel="Remove" onPress={onPress} style={{ padding: spacing.sm }}>
      <Ionicons name="close-circle-outline" size={20} color={colors.danger} />
    </Pressable>
  );

  return (
    <Screen scroll>
      <Stack.Screen options={{ title: existing ? 'Edit Contact' : 'New Contact' }} />

      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <View style={{ flex: 1 }}>
          <TextField label="First name" value={firstName} onChangeText={setFirstName} />
        </View>
        <View style={{ flex: 1 }}>
          <TextField label="Last name" value={lastName} onChangeText={setLastName} />
        </View>
      </View>
      <TextField label="Nickname" value={nickname} onChangeText={setNickname} />
      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <View style={{ flex: 1 }}>
          <TextField label="Company" value={company} onChangeText={setCompany} />
        </View>
        <View style={{ flex: 1 }}>
          <TextField label="Title" value={title} onChangeText={setTitle} />
        </View>
      </View>

      <Card style={{ marginBottom: spacing.md }}>
        <Text variant="label" tone="muted" style={{ marginBottom: spacing.sm }}>PHONES</Text>
        {phones.map((p, i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}>
            <View style={{ width: 90 }}>
              <TextField
                placeholder="label"
                value={p.label}
                onChangeText={(v) => setPhones((prev) => prev.map((x, j) => (j === i ? { ...x, label: v } : x)))}
              />
            </View>
            <View style={{ flex: 1 }}>
              <TextField
                placeholder="+1 555 123 4567"
                keyboardType="phone-pad"
                value={p.number}
                onChangeText={(v) => setPhones((prev) => prev.map((x, j) => (j === i ? { ...x, number: v } : x)))}
              />
            </View>
            {removeButton(() => setPhones((prev) => prev.filter((_, j) => j !== i)))}
          </View>
        ))}
        <Button
          title="Add phone"
          variant="ghost"
          fullWidth={false}
          onPress={() => setPhones((prev) => [...prev, { label: 'other', number: '' }])}
        />
      </Card>

      <Card style={{ marginBottom: spacing.md }}>
        <Text variant="label" tone="muted" style={{ marginBottom: spacing.sm }}>EMAILS</Text>
        {emails.map((e, i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}>
            <View style={{ width: 90 }}>
              <TextField
                placeholder="label"
                value={e.label}
                onChangeText={(v) => setEmails((prev) => prev.map((x, j) => (j === i ? { ...x, label: v } : x)))}
              />
            </View>
            <View style={{ flex: 1 }}>
              <TextField
                placeholder="name@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                value={e.address}
                onChangeText={(v) => setEmails((prev) => prev.map((x, j) => (j === i ? { ...x, address: v } : x)))}
              />
            </View>
            {removeButton(() => setEmails((prev) => prev.filter((_, j) => j !== i)))}
          </View>
        ))}
        <Button
          title="Add email"
          variant="ghost"
          fullWidth={false}
          onPress={() => setEmails((prev) => [...prev, { label: 'other', address: '' }])}
        />
      </Card>

      <Card style={{ marginBottom: spacing.md }}>
        <Text variant="label" tone="muted" style={{ marginBottom: spacing.sm }}>WHERE WE MET</Text>
        <TextField label="Place" placeholder="e.g. Chamber of Commerce mixer" value={metPlace} onChangeText={setMetPlace} />
        <TextField label="City" value={metCity} onChangeText={setMetCity} />
        <TextField label="Note" placeholder="Anything worth remembering about the meeting" value={metNote} onChangeText={setMetNote} />
      </Card>

      <Card style={{ marginBottom: spacing.md }}>
        <Text variant="label" tone="muted" style={{ marginBottom: spacing.xs }}>PREMISES</Text>
        <Text variant="caption" tone="muted" style={{ marginBottom: spacing.sm }}>
          The event, topic, expertise, hobby, or interest you know them through. Tags power Circles.
        </Text>
        {premises.map((p, i) => (
          <View
            key={p.id}
            style={{
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: radius.md,
              padding: spacing.md,
              marginBottom: spacing.sm,
            }}
          >
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.sm }}>
              {PREMISE_KINDS.map((kind) => (
                <Pressable
                  key={kind}
                  accessibilityRole="button"
                  onPress={() => setPremises((prev) => prev.map((x, j) => (j === i ? { ...x, kind } : x)))}
                  style={{
                    borderRadius: radius.pill,
                    borderWidth: 1,
                    borderColor: p.kind === kind ? colors.primary : colors.border,
                    backgroundColor: p.kind === kind ? colors.primary : 'transparent',
                    paddingVertical: 3,
                    paddingHorizontal: spacing.sm,
                  }}
                >
                  <Text variant="caption" tone={p.kind === kind ? 'inverse' : 'muted'}>{kind}</Text>
                </Pressable>
              ))}
            </View>
            <TextField
              placeholder='Label — e.g. "real estate investing"'
              value={p.label}
              onChangeText={(v) => setPremises((prev) => prev.map((x, j) => (j === i ? { ...x, label: v } : x)))}
            />
            <TextField
              placeholder="Tags, comma-separated — e.g. real-estate, investing"
              autoCapitalize="none"
              value={p.tagsText}
              onChangeText={(v) => setPremises((prev) => prev.map((x, j) => (j === i ? { ...x, tagsText: v } : x)))}
            />
            <Button
              title="Remove premise"
              variant="ghost"
              fullWidth={false}
              onPress={() => setPremises((prev) => prev.filter((_, j) => j !== i))}
            />
          </View>
        ))}
        <Button
          title="Add premise"
          variant="secondary"
          fullWidth={false}
          onPress={() =>
            setPremises((prev) => [
              ...prev,
              { id: Crypto.randomUUID(), kind: 'topic', label: '', tagsText: '' },
            ])
          }
        />
      </Card>

      <TextField label="Notes" multiline numberOfLines={3} value={notes} onChangeText={setNotes} />

      <Button title={existing ? 'Save changes' : 'Add contact'} loading={saving} onPress={() => void save()} />
      <Button title="Cancel" variant="ghost" onPress={() => router.back()} style={{ marginTop: spacing.sm }} />
    </Screen>
  );
}
