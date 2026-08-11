// app/(app)/contacts-import.tsx
// Import flow. ?mode=device pulls the phone book (expo-contacts) straight to
// the preview. ?mode=csv opens a file picker, then a FIELD-MAPPING step —
// Legend's own exports auto-map 1:1, foreign CSVs (Google Contacts, Outlook,
// spreadsheets) get best-effort guesses the user can correct — then the same
// dedupe/preview/confirm as device import. Nothing imports without explicit
// confirmation.

import React, { useEffect, useMemo, useState } from 'react';
import { Linking, Platform, Pressable, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../src/components/Screen';
import { Text } from '../../src/components/Text';
import { Button } from '../../src/components/Button';
import { Card } from '../../src/components/Card';
import { Banner } from '../../src/components/Banner';
import { OptionSheet, type OptionSheetOption } from '../../src/components/OptionSheet';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useContacts } from '../../src/features/contacts/ContactsContext';
import {
  CSV_FIELD_DEFS,
  csvRowsToContacts,
  dedupeAgainst,
  fetchDeviceContacts,
  guessMapping,
  parseCsvTable,
  pickCsvText,
  presentContactAccessPicker,
  type ContactsAccess,
  type CsvField,
  type CsvMapping,
} from '../../src/features/contacts/importExport';
import type { ContactInput } from '../../src/features/contacts/types';
import { notify } from '../../src/lib/notify';

interface CsvTable {
  header: string[];
  rows: string[][];
}

export default function ContactsImportScreen() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const router = useRouter();
  const { colors, spacing, radius } = useTheme();
  const { contacts, importContacts } = useContacts();

  const [candidates, setCandidates] = useState<ContactInput[] | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [failure, setFailure] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  // CSV mapping phase state (unused for device import).
  const [table, setTable] = useState<CsvTable | null>(null);
  const [mapping, setMapping] = useState<CsvMapping | null>(null);
  const [sheetField, setSheetField] = useState<CsvField | null>(null);

  // Device-import state. `access` distinguishes "your phone book is empty"
  // from iOS 18's "you granted access but shared no contacts", and bumping
  // `reloadKey` re-runs the whole fetch for a clean retry.
  const [access, setAccess] = useState<ContactsAccess>('unknown');
  const [reloadKey, setReloadKey] = useState(0);
  const [pickerBusy, setPickerBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (mode === 'device') {
          if (!cancelled) setCandidates(null);
          const result = await fetchDeviceContacts();
          if (!cancelled) {
            setCandidates(result.inputs);
            setAccess(result.access);
          }
        } else {
          const text = await pickCsvText();
          if (text === null) {
            if (!cancelled) router.back();
            return;
          }
          const parsed = parseCsvTable(text);
          if (!cancelled) {
            if (!parsed) {
              setFailure('File is empty.');
              return;
            }
            setTable(parsed);
            setMapping(guessMapping(parsed.header));
          }
        }
      } catch (e) {
        if (!cancelled) setFailure(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
    // Re-runs for the screen's mode and on an explicit retry; contacts
    // changing mid-preview is fine.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, reloadKey]);

  /** Reopen iOS's contact picker, then re-read whatever is now shared. */
  const chooseSharedContacts = async () => {
    setPickerBusy(true);
    try {
      const shown = await presentContactAccessPicker();
      if (shown) {
        setReloadKey((k) => k + 1);
      } else {
        notify(
          'Not available here',
          Platform.OS === 'ios'
            ? 'Choosing contacts in-app needs iOS 18. Open Settings › Privacy & Security › Contacts to change access.'
            : 'Manage contacts access from system settings.',
        );
      }
    } finally {
      setPickerBusy(false);
    }
  };

  // First non-empty value per column (among the first 20 rows) — shown as the
  // sample under each column name in the mapping sheet.
  const samples = useMemo<string[]>(() => {
    if (!table) return [];
    return table.header.map((_, col) => {
      for (const row of table.rows.slice(0, 20)) {
        const v = (row[col] ?? '').trim();
        if (v) return v;
      }
      return '';
    });
  }, [table]);

  if (failure) {
    return (
      <Screen center>
        <Banner kind="error" message={failure} />
        <Button title="Back" variant="secondary" onPress={() => router.back()} style={{ marginTop: spacing.lg }} />
      </Screen>
    );
  }

  // -------------------------------------------------------------------------
  // CSV field-mapping phase
  // -------------------------------------------------------------------------
  if (mode !== 'device' && table && mapping && !candidates) {
    const columnName = (idx: number) => table.header[idx] ?? `Column ${idx + 1}`;
    const nameMapped = mapping.first_name !== -1 || mapping.last_name !== -1;

    const sheetDef = sheetField ? CSV_FIELD_DEFS.find((d) => d.id === sheetField) : undefined;
    const sheetOptions: OptionSheetOption[] = [];
    if (sheetField && sheetDef) {
      const taken = sheetDef.multi ? new Set(mapping[sheetField as 'phones' | 'emails']) : null;
      table.header.forEach((h, idx) => {
        if (taken?.has(idx)) return;
        sheetOptions.push({
          key: `col-${idx}`,
          label: h || `Column ${idx + 1}`,
          detail: samples[idx] ? `e.g. ${samples[idx]}` : 'no values in first rows',
          onPress: () =>
            setMapping((prev) => {
              if (!prev) return prev;
              if (sheetDef.multi) {
                const field = sheetField as 'phones' | 'emails';
                return { ...prev, [field]: [...prev[field], idx] };
              }
              return { ...prev, [sheetField]: idx };
            }),
        });
      });
      if (!sheetDef.multi) {
        sheetOptions.push({
          key: 'none',
          label: "Don't import",
          icon: 'close-circle-outline',
          destructive: true,
          onPress: () => setMapping((prev) => (prev ? { ...prev, [sheetField]: -1 } : prev)),
        });
      }
    }

    const removeMulti = (field: 'phones' | 'emails', idx: number) =>
      setMapping((prev) =>
        prev ? { ...prev, [field]: prev[field].filter((i) => i !== idx) } : prev,
      );

    const continueToPreview = () => {
      const result = csvRowsToContacts(table.header, table.rows, mapping);
      setErrors(result.errors);
      setCandidates(result.inputs);
    };

    return (
      <Screen scroll>
        <Stack.Screen options={{ title: 'Match CSV Columns' }} />
        <OptionSheet
          visible={sheetField !== null}
          title={sheetDef ? `Column for ${sheetDef.label}` : undefined}
          options={sheetOptions}
          onClose={() => setSheetField(null)}
        />

        <Text tone="muted" style={{ marginBottom: spacing.lg }}>
          {`${table.rows.length} row${table.rows.length === 1 ? '' : 's'} found. Match your file's columns to Legend's fields — good guesses are pre-filled.`}
        </Text>

        <Card padded={false} style={{ marginBottom: spacing.lg }}>
          {CSV_FIELD_DEFS.map((def, i) => {
            const isLast = i === CSV_FIELD_DEFS.length - 1;
            const rowStyle = {
              padding: spacing.md,
              borderBottomWidth: isLast ? 0 : 1,
              borderBottomColor: colors.border,
            } as const;

            if (def.multi) {
              const field = def.id as 'phones' | 'emails';
              return (
                <View key={def.id} style={rowStyle}>
                  <Text variant="label" weight="semibold">{def.label}</Text>
                  {def.hint ? (
                    <Text variant="caption" tone="muted">{def.hint}</Text>
                  ) : null}
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm }}>
                    {mapping[field].map((idx) => (
                      <Pressable
                        key={idx}
                        accessibilityRole="button"
                        accessibilityLabel={`Remove ${columnName(idx)}`}
                        onPress={() => removeMulti(field, idx)}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 4,
                          borderRadius: radius.pill,
                          backgroundColor: colors.primary,
                          paddingVertical: 4,
                          paddingHorizontal: spacing.md,
                        }}
                      >
                        <Text variant="caption" tone="inverse">{columnName(idx)}</Text>
                        <Ionicons name="close" size={12} color={colors.onPrimary} />
                      </Pressable>
                    ))}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Add column for ${def.label}`}
                      onPress={() => setSheetField(def.id)}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 4,
                        borderRadius: radius.pill,
                        borderWidth: 1,
                        borderColor: colors.primary,
                        paddingVertical: 4,
                        paddingHorizontal: spacing.md,
                      }}
                    >
                      <Ionicons name="add" size={12} color={colors.primary} />
                      <Text variant="caption" tone="primary">Add column</Text>
                    </Pressable>
                  </View>
                </View>
              );
            }

            const idx = mapping[def.id as Exclude<CsvField, 'phones' | 'emails'>];
            return (
              <Pressable
                key={def.id}
                accessibilityRole="button"
                accessibilityLabel={`Map ${def.label}`}
                onPress={() => setSheetField(def.id)}
                style={({ pressed }) => ({
                  ...rowStyle,
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: pressed ? colors.surfaceAlt : 'transparent',
                })}
              >
                <View style={{ flex: 1 }}>
                  <Text variant="label" weight="semibold">{def.label}</Text>
                  {def.hint ? (
                    <Text variant="caption" tone="muted">{def.hint}</Text>
                  ) : null}
                </View>
                <Text variant="label" tone={idx === -1 ? 'muted' : 'primary'}>
                  {idx === -1 ? 'Not imported' : columnName(idx)}
                </Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} style={{ marginLeft: spacing.xs }} />
              </Pressable>
            );
          })}
        </Card>

        {!nameMapped ? (
          <Banner kind="warning" message="Map at least a first-name or last-name column to continue." />
        ) : null}

        <Button
          title="Continue to preview"
          disabled={!nameMapped}
          style={{ marginTop: spacing.md }}
          onPress={continueToPreview}
        />
        <Button title="Cancel" variant="ghost" onPress={() => router.back()} style={{ marginTop: spacing.sm }} />
      </Screen>
    );
  }

  if (!candidates) {
    return (
      <Screen center>
        <Text tone="muted">{mode === 'device' ? 'Reading your phone book…' : 'Waiting for a CSV file…'}</Text>
      </Screen>
    );
  }

  // -------------------------------------------------------------------------
  // Device import that came back with nothing. Never a dead end: the usual
  // cause is an iOS 18 limited grant where no contacts were selected, and the
  // OS will not re-prompt, so re-entering this screen would fail identically
  // forever without an explicit way back into the picker.
  // -------------------------------------------------------------------------
  if (mode === 'device' && candidates.length === 0) {
    const limited = access === 'limited';
    return (
      <Screen scroll>
        <Stack.Screen options={{ title: 'Import from Phone' }} />
        <Banner
          kind="warning"
          message={
            limited
              ? 'No contacts are shared with Legend yet.'
              : 'No contacts were found on this device.'
          }
        />
        <Text tone="muted" style={{ marginVertical: spacing.md }}>
          {limited
            ? 'You chose to share only selected contacts, and none were picked. Nothing was imported — pick the people you want and try again.'
            : 'Your phone book looks empty, or access is limited to contacts that have since been removed. Nothing was imported.'}
        </Text>

        {Platform.OS === 'ios' ? (
          <Button
            title="Choose contacts to share"
            loading={pickerBusy}
            onPress={() => void chooseSharedContacts()}
          />
        ) : null}
        <Button
          title="Try again"
          variant="secondary"
          style={{ marginTop: spacing.sm }}
          onPress={() => setReloadKey((k) => k + 1)}
        />
        <Button
          title="Open Settings"
          variant="ghost"
          style={{ marginTop: spacing.sm }}
          onPress={() => void Linking.openSettings()}
        />
        <Button
          title="Cancel"
          variant="ghost"
          style={{ marginTop: spacing.sm }}
          onPress={() => router.back()}
        />
      </Screen>
    );
  }

  // -------------------------------------------------------------------------
  // Preview + confirm (shared by device and CSV paths)
  // -------------------------------------------------------------------------
  const { fresh, duplicates } = dedupeAgainst(contacts, candidates);
  const preview = fresh.slice(0, 8);

  return (
    <Screen scroll>
      <Stack.Screen options={{ title: mode === 'device' ? 'Import from Phone' : 'Import from CSV' }} />

      <Text variant="title" weight="bold">{`${fresh.length} new`}</Text>
      <Text tone="muted" style={{ marginBottom: spacing.lg }}>
        {`${candidates.length} found · ${duplicates.length} already in Legend (matched by phone, email, or name)`}
      </Text>

      {errors.length > 0 ? (
        <Banner kind="warning" message={`${errors.length} row(s) skipped: ${errors.slice(0, 3).join(' ')}`} />
      ) : null}

      {preview.length > 0 ? (
        <Card style={{ marginVertical: spacing.md }}>
          <Text variant="label" tone="muted" style={{ marginBottom: spacing.sm }}>PREVIEW</Text>
          <View style={{ gap: spacing.xs }}>
            {preview.map((c, i) => (
              <Text key={i} variant="label">
                {`${c.firstName} ${c.lastName}`.trim()}
                <Text variant="caption" tone="muted">
                  {c.phones[0] ? `  ${c.phones[0].number}` : c.emails[0] ? `  ${c.emails[0].address}` : ''}
                </Text>
              </Text>
            ))}
            {fresh.length > preview.length ? (
              <Text variant="caption" tone="muted">{`…and ${fresh.length - preview.length} more`}</Text>
            ) : null}
          </View>
        </Card>
      ) : (
        <Text tone="muted" style={{ marginVertical: spacing.md }}>
          Nothing new to import — everyone here is already in Legend.
        </Text>
      )}

      {mode === 'device' && access === 'limited' ? (
        <>
          <Text variant="caption" tone="muted" style={{ marginBottom: spacing.sm }}>
            iOS is sharing only the contacts you selected. Missing someone? Widen the selection
            and Legend will re-read your phone book.
          </Text>
          <Button
            title="Choose more contacts"
            variant="secondary"
            loading={pickerBusy}
            style={{ marginBottom: spacing.sm }}
            onPress={() => void chooseSharedContacts()}
          />
        </>
      ) : null}

      {mode !== 'device' && table ? (
        <Button
          title="Back to column matching"
          variant="secondary"
          style={{ marginBottom: spacing.sm }}
          onPress={() => {
            setCandidates(null);
            setErrors([]);
          }}
        />
      ) : null}

      <Button
        title={`Import ${fresh.length} contact${fresh.length === 1 ? '' : 's'}`}
        disabled={fresh.length === 0}
        loading={importing}
        onPress={() => {
          setImporting(true);
          void importContacts(candidates)
            .then((summary) => {
              notify(
                'Import complete',
                `${summary.added} added, ${summary.skippedDuplicates} duplicates skipped.`,
              );
              router.back();
            })
            .catch((e) => notify('Import failed', e instanceof Error ? e.message : String(e)))
            .finally(() => setImporting(false));
        }}
      />
      <Button title="Cancel" variant="ghost" onPress={() => router.back()} style={{ marginTop: spacing.sm }} />
    </Screen>
  );
}
