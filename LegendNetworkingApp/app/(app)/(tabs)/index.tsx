// app/(app)/(tabs)/index.tsx
// The Contacts tab — Legend's home. Alphabetized SectionList with sticky
// letter headers, an A–Z fast-scroll rail, search across name/company/
// premise/tags, a grade dot on every row, and import/export entry points.

import React, { useMemo, useRef, useState } from 'react';
import { Pressable, SectionList, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../../src/components/Screen';
import { Text } from '../../../src/components/Text';
import { TextField } from '../../../src/components/TextField';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { useContacts, type GradedContact } from '../../../src/features/contacts/ContactsContext';
import { GradeBadge } from '../../../src/features/contacts/components/GradeBadge';
import { describeFreshness } from '../../../src/features/contacts/grading';
import { contactsToCsv, interactionsToCsv, shareCsv } from '../../../src/features/contacts/importExport';
import { notify } from '../../../src/lib/notify';

const ALPHABET = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', '#'];

interface Section {
  title: string;
  data: GradedContact[];
}

function sortName(gc: GradedContact): string {
  const c = gc.contact;
  return (c.lastName || c.firstName || '').trim();
}

function sectionLetter(gc: GradedContact): string {
  const ch = sortName(gc).charAt(0).toUpperCase();
  return ch >= 'A' && ch <= 'Z' ? ch : '#';
}

export default function ContactsScreen() {
  const router = useRouter();
  const { colors, spacing, radius } = useTheme();
  const { graded, contacts, interactions, loading } = useContacts();
  const [query, setQuery] = useState('');
  const listRef = useRef<SectionList<GradedContact, Section>>(null);

  const sections = useMemo<Section[]>(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? graded.filter(({ contact: c }) => {
          const hay = [
            c.firstName,
            c.lastName,
            c.nickname ?? '',
            c.company ?? '',
            c.title ?? '',
            c.whereMet?.placeName ?? '',
            ...c.premises.flatMap((p) => [p.label, ...p.tags]),
          ]
            .join(' ')
            .toLowerCase();
          return hay.includes(q);
        })
      : graded;

    const buckets = new Map<string, GradedContact[]>();
    for (const gc of filtered) {
      const letter = sectionLetter(gc);
      const list = buckets.get(letter);
      if (list) list.push(gc);
      else buckets.set(letter, [gc]);
    }
    return [...buckets.entries()]
      .sort(([a], [b]) => (a === '#' ? 1 : b === '#' ? -1 : a.localeCompare(b)))
      .map(([title, data]) => ({
        title,
        data: data.sort((x, y) =>
          sortName(x).localeCompare(sortName(y)) ||
          x.contact.firstName.localeCompare(y.contact.firstName),
        ),
      }));
  }, [graded, query]);

  const jumpTo = (letter: string) => {
    const idx = sections.findIndex((s) => s.title === letter);
    if (idx === -1 || !listRef.current) return;
    listRef.current.scrollToLocation({
      sectionIndex: idx,
      itemIndex: 0,
      viewPosition: 0,
      animated: false,
    });
  };

  const exportCsv = async () => {
    try {
      await shareCsv('contacts.csv', contactsToCsv(contacts));
      await shareCsv('interactions.csv', interactionsToCsv(contacts, interactions));
      notify('Export complete', 'contacts.csv and interactions.csv were shared.');
    } catch (e) {
      notify('Export failed', e instanceof Error ? e.message : String(e));
    }
  };

  const headerAction = (icon: keyof typeof Ionicons.glyphMap, label: string, onPress: () => void) => (
    <Pressable
      key={label}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: 'center',
        gap: 2,
        paddingVertical: spacing.xs,
        paddingHorizontal: spacing.sm,
        borderRadius: radius.sm,
        backgroundColor: pressed ? colors.surfaceAlt : 'transparent',
      })}
    >
      <Ionicons name={icon} size={20} color={colors.primary} />
      <Text variant="caption" tone="muted">{label}</Text>
    </Pressable>
  );

  return (
    <Screen padded={false} edges={['top']}>
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text variant="title" weight="bold">Contacts</Text>
          <View style={{ flexDirection: 'row' }}>
            {headerAction('person-add-outline', 'Add', () => router.push('/contact/edit'))}
            {headerAction('phone-portrait-outline', 'Phone', () => router.push('/contacts-import?mode=device'))}
            {headerAction('download-outline', 'CSV in', () => router.push('/contacts-import?mode=csv'))}
            {headerAction('share-outline', 'CSV out', () => void exportCsv())}
          </View>
        </View>
        <TextField
          placeholder="Search name, company, premise, tag…"
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      <View style={{ flex: 1, flexDirection: 'row' }}>
        <SectionList
          ref={listRef}
          sections={sections}
          keyExtractor={(gc) => gc.contact.id}
          stickySectionHeadersEnabled
          onScrollToIndexFailed={() => undefined}
          contentContainerStyle={{ paddingBottom: spacing.xxl }}
          style={{ flex: 1 }}
          ListEmptyComponent={
            <View style={{ padding: spacing.xl, alignItems: 'center' }}>
              <Text tone="muted">
                {loading ? 'Loading your network…' : query ? 'No contacts match that search.' : 'No contacts yet — add one or import your phone book.'}
              </Text>
            </View>
          }
          renderSectionHeader={({ section }) => (
            <View style={{ backgroundColor: colors.background, paddingHorizontal: spacing.lg, paddingVertical: spacing.xs }}>
              <Text variant="label" tone="muted" weight="semibold">{section.title}</Text>
            </View>
          )}
          renderItem={({ item }) => {
            const c = item.contact;
            const name = `${c.firstName} ${c.lastName}`.trim() || c.nickname || 'Unnamed';
            const premise = c.premises[0]?.label;
            const sub = [c.company, premise ? `· ${premise}` : ''].filter(Boolean).join(' ');
            return (
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/contact/[id]', params: { id: c.id } })}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.md,
                  paddingVertical: spacing.md,
                  paddingHorizontal: spacing.lg,
                  backgroundColor: pressed ? colors.surfaceAlt : colors.background,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border,
                })}
              >
                <GradeBadge grade={item.grade} variant="dot" />
                <View style={{ flex: 1 }}>
                  <Text weight="semibold">{name}</Text>
                  {sub ? (
                    <Text variant="caption" tone="muted" numberOfLines={1}>{sub}</Text>
                  ) : null}
                </View>
                <Text variant="caption" tone="muted">
                  {describeFreshness(item.grade.freshnessDays)}
                </Text>
              </Pressable>
            );
          }}
        />

        {/* A–Z fast-scroll rail */}
        <View style={{ justifyContent: 'center', paddingHorizontal: 2 }}>
          {ALPHABET.map((letter) => (
            <Pressable
              key={letter}
              accessibilityRole="button"
              accessibilityLabel={`Jump to ${letter}`}
              onPress={() => jumpTo(letter)}
              hitSlop={{ left: 6, right: 6 }}
            >
              <Text
                variant="caption"
                style={{
                  color: sections.some((s) => s.title === letter) ? colors.primary : colors.textMuted,
                  fontSize: 10,
                  lineHeight: 13,
                  textAlign: 'center',
                }}
              >
                {letter}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </Screen>
  );
}
