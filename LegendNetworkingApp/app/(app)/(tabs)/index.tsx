// app/(app)/(tabs)/index.tsx
// The Contacts tab — Legend's home. Alphabetized SectionList with sticky
// letter headers, an A–Z fast-scroll rail, search across name/company/
// premise/tags, a grade dot on every row, and import/export entry points.

import React, { useMemo, useRef, useState } from 'react';
import { Linking, Pressable, SectionList, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../../src/components/Screen';
import { Text } from '../../../src/components/Text';
import { TextField } from '../../../src/components/TextField';
import { OptionSheet } from '../../../src/components/OptionSheet';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { useContacts, type GradedContact } from '../../../src/features/contacts/ContactsContext';
import { GradeBadge } from '../../../src/features/contacts/components/GradeBadge';
import { describeFreshness, type TierId } from '../../../src/features/contacts/grading';
import { useAppSettings, type ContactsDefaultView } from '../../../src/features/settings/AppSettingsContext';
import type { Contact } from '../../../src/features/contacts/types';

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

type SortMode = 'name' | 'grade' | 'stalest' | 'newest';

const SORT_OPTIONS: { id: SortMode; label: string }[] = [
  { id: 'name', label: 'Name' },
  { id: 'grade', label: 'Grade' },
  { id: 'stalest', label: 'Stalest' },
  { id: 'newest', label: 'Newest' },
];

/** Flat comparator for the non-alphabetical sort modes. */
function compareBy(mode: SortMode, a: GradedContact, b: GradedContact): number {
  switch (mode) {
    case 'grade':
      return b.grade.score - a.grade.score || sortName(a).localeCompare(sortName(b));
    case 'stalest': {
      // Never-contacted first (∞ stale), then oldest touch → newest.
      const fa = a.grade.freshnessDays ?? Number.POSITIVE_INFINITY;
      const fb = b.grade.freshnessDays ?? Number.POSITIVE_INFINITY;
      return fb - fa || sortName(a).localeCompare(sortName(b));
    }
    case 'newest':
      // createdAt is an HLC stamp (local backend) or ISO (supabase) — both
      // sort correctly as plain strings, so no Date.parse (HLC would NaN).
      return b.contact.createdAt.localeCompare(a.contact.createdAt);
    default:
      return sortName(a).localeCompare(sortName(b));
  }
}

export default function ContactsScreen() {
  const router = useRouter();
  const { colors, spacing, radius } = useTheme();
  const { graded, loading, logInteraction } = useContacts();
  const { meContactId, contactsDefaultView, gradingConfig } = useAppSettings();
  // null = follow the setting; a value = the user tapped a segment this session.
  const [viewOverride, setViewOverride] = useState<ContactsDefaultView | null>(null);
  const view = viewOverride ?? contactsDefaultView;
  const [query, setQuery] = useState('');
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [sortBy, setSortBy] = useState<SortMode>('name');
  const [tierFilter, setTierFilter] = useState<ReadonlySet<TierId>>(new Set());
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const listRef = useRef<SectionList<GradedContact, Section>>(null);

  const filtersActive = sortBy !== 'name' || tierFilter.size > 0 || favoritesOnly;

  const toggleTier = (id: TierId) =>
    setTierFilter((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const sections = useMemo<Section[]>(() => {
    const q = query.trim().toLowerCase();
    let filtered = q
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
    if (tierFilter.size > 0) filtered = filtered.filter((gc) => tierFilter.has(gc.grade.tier.id));
    if (favoritesOnly) filtered = filtered.filter((gc) => gc.contact.favorite);

    // Recent view: most recently touched first, never-contacted last.
    if (view === 'recent') {
      return [
        {
          title: '',
          data: [...filtered].sort((a, b) => {
            const fa = a.grade.freshnessDays ?? Number.POSITIVE_INFINITY;
            const fb = b.grade.freshnessDays ?? Number.POSITIVE_INFINITY;
            return fa - fb || b.grade.score - a.grade.score;
          }),
        },
      ];
    }

    // Non-alphabetical sorts render as one flat, unlabeled section.
    if (sortBy !== 'name') {
      return [{ title: '', data: [...filtered].sort((a, b) => compareBy(sortBy, a, b)) }];
    }

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
  }, [graded, query, sortBy, tierFilter, favoritesOnly, view]);

  // Quick channel action for a Recent row: opens the channel with the
  // contact's first number/email and logs the interaction (the contact
  // detail screen offers the full multi-number chooser).
  const rowAct = (c: Contact, kind: 'call' | 'text' | 'email') => {
    const address = kind === 'email' ? c.emails[0]?.address : c.phones[0]?.number;
    if (!address) return;
    const scheme = kind === 'call' ? 'tel' : kind === 'text' ? 'sms' : 'mailto';
    void Linking.openURL(`${scheme}:${encodeURIComponent(address)}`)
      .then(() => logInteraction({ contactId: c.id, kind }))
      .catch(() => undefined);
  };

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

  return (
    <Screen padded={false} edges={['top']}>
      <OptionSheet
        visible={addMenuOpen}
        title="Add contacts"
        onClose={() => setAddMenuOpen(false)}
        options={[
          {
            key: 'new',
            label: 'New contact',
            icon: 'person-add-outline',
            onPress: () => router.push('/contact/edit'),
          },
          {
            key: 'device',
            label: 'Import from phone',
            detail: 'Pull contacts from this device’s address book',
            icon: 'phone-portrait-outline',
            onPress: () => router.push('/contacts-import?mode=device'),
          },
          {
            key: 'csv',
            label: 'Import from CSV',
            detail: 'Pick a .csv file in Legend’s format',
            icon: 'download-outline',
            onPress: () => router.push('/contacts-import?mode=csv'),
          },
        ]}
      />
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <Text variant="title" weight="bold">Contacts</Text>
            <View
              style={{
                flexDirection: 'row',
                borderRadius: radius.pill,
                borderWidth: 1,
                borderColor: colors.border,
                overflow: 'hidden',
              }}
            >
              {(['all', 'recent'] as const).map((v) => (
                <Pressable
                  key={v}
                  accessibilityRole="button"
                  accessibilityState={{ selected: view === v }}
                  onPress={() => setViewOverride(v)}
                  style={{
                    paddingVertical: 4,
                    paddingHorizontal: spacing.md,
                    backgroundColor: view === v ? colors.primary : 'transparent',
                  }}
                >
                  <Text variant="caption" tone={view === v ? 'inverse' : 'muted'} weight="semibold">
                    {v === 'all' ? 'All' : 'Recent'}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add or import contacts"
            onPress={() => setAddMenuOpen(true)}
            style={({ pressed }) => ({
              width: 36,
              height: 36,
              borderRadius: radius.pill,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: pressed ? colors.primaryPressed : colors.primary,
            })}
          >
            <Ionicons name="add" size={24} color={colors.onPrimary} />
          </Pressable>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <TextField
              placeholder="Search name, company, premise, tag…"
              value={query}
              onChangeText={setQuery}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Sort and filter"
            accessibilityState={{ selected: panelOpen || filtersActive }}
            onPress={() => setPanelOpen((v) => !v)}
            style={({ pressed }) => ({
              width: 40,
              height: 40,
              borderRadius: radius.md,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: panelOpen || filtersActive ? colors.primary : colors.border,
              backgroundColor: pressed
                ? colors.surfaceAlt
                : filtersActive
                  ? colors.surfaceAlt
                  : colors.surface,
            })}
          >
            <Ionicons
              name={filtersActive ? 'funnel' : 'funnel-outline'}
              size={18}
              color={panelOpen || filtersActive ? colors.primary : colors.textMuted}
            />
          </Pressable>
        </View>

        {panelOpen ? (
          <View style={{ paddingTop: spacing.sm, gap: spacing.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
              <Text variant="caption" tone="muted">Sort</Text>
              {SORT_OPTIONS.map((opt) => {
                const active = sortBy === opt.id;
                return (
                  <Pressable
                    key={opt.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    onPress={() => setSortBy(opt.id)}
                    style={{
                      borderRadius: radius.pill,
                      borderWidth: 1,
                      borderColor: active ? colors.primary : colors.border,
                      backgroundColor: active ? colors.primary : 'transparent',
                      paddingVertical: 4,
                      paddingHorizontal: spacing.md,
                    }}
                  >
                    <Text variant="caption" tone={active ? 'inverse' : 'default'}>{opt.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
              <Text variant="caption" tone="muted">Show</Text>
              {gradingConfig.tiers.map((tier) => {
                const active = tierFilter.has(tier.id);
                return (
                  <Pressable
                    key={tier.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${tier.label} tier`}
                    accessibilityState={{ selected: active }}
                    onPress={() => toggleTier(tier.id)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 5,
                      borderRadius: radius.pill,
                      borderWidth: 1,
                      borderColor: active ? tier.color : colors.border,
                      backgroundColor: active ? `${tier.color}22` : 'transparent',
                      paddingVertical: 4,
                      paddingHorizontal: spacing.md,
                    }}
                  >
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: tier.color }} />
                    <Text variant="caption">{tier.label}</Text>
                  </Pressable>
                );
              })}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Favorites only"
                accessibilityState={{ selected: favoritesOnly }}
                onPress={() => setFavoritesOnly((v) => !v)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 5,
                  borderRadius: radius.pill,
                  borderWidth: 1,
                  borderColor: favoritesOnly ? colors.primary : colors.border,
                  backgroundColor: favoritesOnly ? colors.primary : 'transparent',
                  paddingVertical: 4,
                  paddingHorizontal: spacing.md,
                }}
              >
                <Ionicons name="star" size={10} color={favoritesOnly ? colors.onPrimary : colors.textMuted} />
                <Text variant="caption" tone={favoritesOnly ? 'inverse' : 'default'}>Favorites</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
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
          renderSectionHeader={({ section }) =>
            section.title ? (
              <View style={{ backgroundColor: colors.background, paddingHorizontal: spacing.lg, paddingVertical: spacing.xs }}>
                <Text variant="label" tone="muted" weight="semibold">{section.title}</Text>
              </View>
            ) : null
          }
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
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                    <Text weight="semibold">{name}</Text>
                    {c.id === meContactId ? (
                      <View
                        style={{
                          borderRadius: radius.pill,
                          backgroundColor: colors.primary,
                          paddingHorizontal: 6,
                          paddingVertical: 1,
                        }}
                      >
                        <Text variant="caption" tone="inverse" weight="bold" style={{ fontSize: 9 }}>
                          ME
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  {sub ? (
                    <Text variant="caption" tone="muted" numberOfLines={1}>{sub}</Text>
                  ) : null}
                </View>
                {view === 'recent' ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                    <Text variant="caption" tone="muted" style={{ marginRight: spacing.xs }}>
                      {describeFreshness(item.grade.freshnessDays)}
                    </Text>
                    {(
                      [
                        ['call', 'call-outline', c.phones.length > 0],
                        ['text', 'chatbubble-outline', c.phones.length > 0],
                        ['email', 'mail-outline', c.emails.length > 0],
                      ] as const
                    ).map(([kind, iconName, enabled]) => (
                      <Pressable
                        key={kind}
                        accessibilityRole="button"
                        accessibilityLabel={`${kind} ${name}`}
                        disabled={!enabled}
                        onPress={() => rowAct(c, kind)}
                        hitSlop={4}
                        style={({ pressed }) => ({
                          width: 32,
                          height: 32,
                          borderRadius: 16,
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderWidth: 1,
                          borderColor: colors.border,
                          backgroundColor: pressed ? colors.surfaceAlt : colors.surface,
                          opacity: enabled ? 1 : 0.35,
                        })}
                      >
                        <Ionicons name={iconName} size={15} color={colors.primary} />
                      </Pressable>
                    ))}
                  </View>
                ) : (
                  <Text variant="caption" tone="muted">
                    {describeFreshness(item.grade.freshnessDays)}
                  </Text>
                )}
              </Pressable>
            );
          }}
        />

        {/* A–Z fast-scroll rail (only meaningful for the alphabetical sort) */}
        <View style={{ justifyContent: 'center', paddingHorizontal: 2, display: sortBy === 'name' && view === 'all' ? 'flex' : 'none' }}>
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
