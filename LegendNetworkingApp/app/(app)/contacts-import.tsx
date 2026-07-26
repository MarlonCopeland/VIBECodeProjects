// app/(app)/contacts-import.tsx
// Import preview + confirm. ?mode=device pulls the phone book (expo-contacts);
// ?mode=csv opens a file picker. Either way: dedupe against existing contacts,
// show what will happen, then import only on explicit confirmation.

import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '../../src/components/Screen';
import { Text } from '../../src/components/Text';
import { Button } from '../../src/components/Button';
import { Card } from '../../src/components/Card';
import { Banner } from '../../src/components/Banner';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useContacts } from '../../src/features/contacts/ContactsContext';
import {
  csvToContacts,
  dedupeAgainst,
  fetchDeviceContacts,
  pickCsvText,
} from '../../src/features/contacts/importExport';
import type { ContactInput } from '../../src/features/contacts/types';
import { notify } from '../../src/lib/notify';

export default function ContactsImportScreen() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const router = useRouter();
  const { spacing } = useTheme();
  const { contacts, importContacts } = useContacts();

  const [candidates, setCandidates] = useState<ContactInput[] | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [failure, setFailure] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (mode === 'device') {
          const inputs = await fetchDeviceContacts();
          if (!cancelled) setCandidates(inputs);
        } else {
          const text = await pickCsvText();
          if (text === null) {
            if (!cancelled) router.back();
            return;
          }
          const result = csvToContacts(text);
          if (!cancelled) {
            setCandidates(result.inputs);
            setErrors(result.errors);
          }
        }
      } catch (e) {
        if (!cancelled) setFailure(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
    // Run once for the screen's mode; contacts changing mid-preview is fine.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  if (failure) {
    return (
      <Screen center>
        <Banner kind="error" message={failure} />
        <Button title="Back" variant="secondary" onPress={() => router.back()} style={{ marginTop: spacing.lg }} />
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
