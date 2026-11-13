// src/screens/contacts/ImportScreen.tsx
// CSV import — mirrors the phone's app/(app)/contacts-import.tsx (?mode=csv).
// Pick a file (native dialog), then a FIELD-MAPPING step — Legend's own
// exports auto-map 1:1, foreign CSVs (Google Contacts, Outlook, spreadsheets)
// get best-effort guesses the user can correct — then dedupe/preview/confirm.
// Nothing imports without explicit confirmation. The phone's phone-book
// import (expo-contacts) has no desktop equivalent, so only CSV lives here.
// After an import, re-added people may match removed contacts in Knows
// Connections; we point the user at the Contacts screen to review them.

import React, { useMemo, useState } from 'react';
import { Download, FileUp, Plus, X } from 'lucide-react';
import { useContacts, type ImportSummary } from '@legend/features/contacts/ContactsContext';
import {
  CSV_FIELD_DEFS,
  CSV_HEADER,
  csvRowsToContacts,
  dedupeAgainst,
  guessMapping,
  parseCsvTable,
  type CsvField,
  type CsvMapping,
  type CsvMultiField,
  type CsvSingleField,
} from '@legend/features/contacts/importExport';
import { countKnowsSuggestions } from '@legend/features/contacts/knows';
import type { ContactInput } from '@legend/features/contacts/types';
import { serializeCsv } from '@legend/lib/csv';
import { notify } from '@legend/lib/notify';
import { BackButton, useRouter } from '../../app/router';
import { Banner, Button, Card, Page, SectionLabel } from '../../ui/components';
import { openCsvText, saveTextFile } from '../../platform/files';

interface CsvTable {
  header: string[];
  rows: string[][];
}

/** One example row in Legend's own format, for the help card + sample file. */
const SAMPLE_ROW = [
  'Ada',
  'Lovelace',
  'Ada',
  'Analytical Engines',
  'Founder',
  'mobile:+1 555 123 4567;work:+1 555 765 4321',
  'work:ada@example.com',
  'Chamber of Commerce mixer',
  'Austin',
  'Talked about compilers',
  'topic:real estate investing:real-estate|investing;hobby:chess:chess',
  'Met through Grace',
  'true',
];

export default function ImportScreen() {
  const { navigate, back } = useRouter();
  const { contacts, importContacts, resolvedKnows } = useContacts();

  const [fileName, setFileName] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [table, setTable] = useState<CsvTable | null>(null);
  const [mapping, setMapping] = useState<CsvMapping | null>(null);
  const [candidates, setCandidates] = useState<ContactInput[] | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  const reset = () => {
    setFileName(null);
    setFailure(null);
    setTable(null);
    setMapping(null);
    setCandidates(null);
    setErrors([]);
    setSummary(null);
  };

  const pick = async () => {
    setPicking(true);
    try {
      const file = await openCsvText();
      if (!file) return; // canceled — stay on the pick step
      reset();
      setFileName(file.name);
      const parsed = parseCsvTable(file.content);
      if (!parsed) {
        setFailure('File is empty.');
        return;
      }
      setTable(parsed);
      setMapping(guessMapping(parsed.header));
    } catch (e) {
      setFailure(e instanceof Error ? e.message : String(e));
    } finally {
      setPicking(false);
    }
  };

  const saveSample = async () => {
    try {
      await saveTextFile('legend-contacts-sample.csv', serializeCsv([CSV_HEADER, SAMPLE_ROW]));
    } catch (e) {
      notify('Save failed', e instanceof Error ? e.message : String(e));
    }
  };

  // First non-empty value per column (among the first 20 rows) — shown as the
  // sample beside each column name in the mapping step.
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

  const cancel = () => back('/contacts');
  const backBtn = <BackButton fallback="/contacts" />;

  // -------------------------------------------------------------------------
  // Done
  // -------------------------------------------------------------------------
  if (summary) {
    const knowsToReview = countKnowsSuggestions(resolvedKnows);
    return (
      <Page narrow title="Import complete" back={backBtn}>
        <div className="stack">
          <Banner tone="success">{`${summary.added} added, ${summary.skippedDuplicates} duplicates skipped.`}</Banner>
          {knowsToReview > 0 ? (
            <Banner tone="info">
              {`There ${knowsToReview === 1 ? 'is' : 'are'} ${knowsToReview} Knows Connection${knowsToReview === 1 ? '' : 's'} to review — some imported people may be contacts you removed earlier. Review the possible matches on the Contacts screen.`}
            </Banner>
          ) : null}
          <div className="row">
            <Button title="Go to Contacts" onClick={() => navigate('/contacts')} />
            <Button title="Import another file" variant="secondary" onClick={reset} />
          </div>
        </div>
      </Page>
    );
  }

  // -------------------------------------------------------------------------
  // Failure
  // -------------------------------------------------------------------------
  if (failure) {
    return (
      <Page narrow title="Import from CSV" back={backBtn}>
        <div className="stack">
          <Banner tone="error">{fileName ? `${fileName}: ${failure}` : failure}</Banner>
          <div className="row">
            <Button title="Choose another file" loading={picking} onClick={() => void pick()} />
            <Button title="Back" variant="secondary" onClick={cancel} />
          </div>
        </div>
      </Page>
    );
  }

  // -------------------------------------------------------------------------
  // Pick a file (+ format help)
  // -------------------------------------------------------------------------
  if (!table || !mapping) {
    return (
      <Page narrow title="Import from CSV" back={backBtn}>
        <div className="stack">
          <Card>
            <div className="stack">
              <div>
                Pick a <strong>.csv</strong> file. Legend’s own export (contacts.csv) maps automatically; files from
                Google Contacts, Outlook or a spreadsheet get best-guess column matches you can correct before
                anything is imported.
              </div>
              <div className="row">
                <Button title="Choose CSV file" icon={<FileUp size={16} />} loading={picking} onClick={() => void pick()} />
                <Button title="Cancel" variant="ghost" onClick={cancel} />
              </div>
            </div>
          </Card>

          <Card>
            <SectionLabel style={{ marginBottom: 'var(--s-sm)' }}>Legend’s CSV format</SectionLabel>
            <div className="muted small stack" style={{ gap: 'var(--s-xs)' }}>
              <div>One header row, then one contact per row. Columns:</div>
              <code style={codeStyle}>{CSV_HEADER.join(',')}</code>
              <div>
                <strong>phones</strong> / <strong>emails</strong>: <code>label:value</code> pairs joined by{' '}
                <code>;</code> — e.g. <code>mobile:+1 555 123 4567;work:+1 555 765 4321</code>
              </div>
              <div>
                <strong>premises</strong>: <code>kind:label:tag|tag</code> entries joined by <code>;</code> — kind is
                one of event, topic, expertise, hobby, interest, place.
              </div>
              <div>
                <strong>favorite</strong>: true / yes / 1 to star the contact.
              </div>
              <div>Example row:</div>
              <code style={codeStyle}>{serializeCsv([SAMPLE_ROW]).trim()}</code>
              <div>
                Phone-book import is only in the Legend phone app — on desktop, export from your contacts app as CSV
                and import that file here.
              </div>
            </div>
            <div style={{ marginTop: 'var(--s-md)' }}>
              <Button
                title="Save sample CSV"
                variant="secondary"
                size="sm"
                icon={<Download size={14} />}
                onClick={() => void saveSample()}
              />
            </div>
          </Card>
        </div>
      </Page>
    );
  }

  const columnName = (idx: number) => table.header[idx] || `Column ${idx + 1}`;
  const columnOption = (idx: number) =>
    `${columnName(idx)}${samples[idx] ? ` — e.g. ${truncate(samples[idx]!, 40)}` : ' — no values in first rows'}`;

  // -------------------------------------------------------------------------
  // CSV field-mapping phase
  // -------------------------------------------------------------------------
  if (!candidates) {
    const nameMapped = mapping.first_name !== -1 || mapping.last_name !== -1;

    const setSingle = (field: CsvSingleField, idx: number) =>
      setMapping((prev) => (prev ? { ...prev, [field]: idx } : prev));
    const addMulti = (field: CsvMultiField, idx: number) =>
      setMapping((prev) => (prev ? { ...prev, [field]: [...prev[field], idx] } : prev));
    const removeMulti = (field: CsvMultiField, idx: number) =>
      setMapping((prev) => (prev ? { ...prev, [field]: prev[field].filter((i) => i !== idx) } : prev));

    const continueToPreview = () => {
      const result = csvRowsToContacts(table.header, table.rows, mapping);
      setErrors(result.errors);
      setCandidates(result.inputs);
    };

    return (
      <Page
        title="Match CSV Columns"
        back={backBtn}
        actions={
          <div className="row">
            <Button title="Cancel" variant="ghost" onClick={cancel} />
            <Button title="Continue to preview" disabled={!nameMapped} onClick={continueToPreview} />
          </div>
        }
      >
        <div className="stack">
          <div className="muted">
            {`${fileName ? `${fileName}: ` : ''}${table.rows.length} row${table.rows.length === 1 ? '' : 's'} found. Match your file's columns to Legend's fields — good guesses are pre-filled.`}
          </div>

          <Card style={{ padding: 0 }}>
            {CSV_FIELD_DEFS.map((def, i) => {
              const rowStyle: React.CSSProperties = {
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--s-md)',
                padding: 'var(--s-md) var(--s-lg)',
                borderBottom: i === CSV_FIELD_DEFS.length - 1 ? undefined : '1px solid var(--border)',
              };
              const labelCol = (
                <div style={{ width: 260, flexShrink: 0 }}>
                  <div style={{ fontWeight: 600 }}>{def.label}</div>
                  {def.hint ? <div className="muted small">{def.hint}</div> : null}
                </div>
              );

              if (def.multi) {
                const field = def.id as CsvMultiField;
                const taken = new Set(mapping[field]);
                const free = table.header.map((_, idx) => idx).filter((idx) => !taken.has(idx));
                return (
                  <div key={def.id} style={rowStyle}>
                    {labelCol}
                    <div className="row wrap grow" style={{ gap: 'var(--s-xs)' }}>
                      {mapping[field].map((idx) => (
                        <button
                          key={idx}
                          type="button"
                          className="chip selected"
                          aria-label={`Remove ${columnName(idx)}`}
                          title={samples[idx] ? `e.g. ${samples[idx]}` : undefined}
                          onClick={() => removeMulti(field, idx)}
                        >
                          {columnName(idx)}
                          <X size={12} />
                        </button>
                      ))}
                      {free.length > 0 ? (
                        <label className="chip" style={{ position: 'relative', cursor: 'pointer' }}>
                          <Plus size={12} />
                          Add column
                          <select
                            aria-label={`Add column for ${def.label}`}
                            value=""
                            onChange={(e) => {
                              if (e.target.value !== '') addMulti(field, Number(e.target.value));
                            }}
                            style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
                          >
                            <option value="">Add column…</option>
                            {free.map((idx) => (
                              <option key={idx} value={idx}>
                                {columnOption(idx)}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : null}
                    </div>
                  </div>
                );
              }

              const field = def.id as Exclude<CsvField, CsvMultiField>;
              const idx = mapping[field];
              return (
                <div key={def.id} style={rowStyle}>
                  {labelCol}
                  <div className="grow">
                    <select
                      className="input"
                      aria-label={`Map ${def.label}`}
                      value={idx}
                      onChange={(e) => setSingle(field, Number(e.target.value))}
                      style={{ color: idx === -1 ? 'var(--text-muted)' : undefined }}
                    >
                      <option value={-1}>Not imported</option>
                      {table.header.map((_, col) => (
                        <option key={col} value={col}>
                          {columnOption(col)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              );
            })}
          </Card>

          {!nameMapped ? <Banner tone="error">Map at least a first-name or last-name column to continue.</Banner> : null}

          <div className="row">
            <Button title="Continue to preview" disabled={!nameMapped} onClick={continueToPreview} />
            <Button title="Choose a different file" variant="secondary" loading={picking} onClick={() => void pick()} />
            <Button title="Cancel" variant="ghost" onClick={cancel} />
          </div>
        </div>
      </Page>
    );
  }

  // -------------------------------------------------------------------------
  // Preview + confirm
  // -------------------------------------------------------------------------
  const { fresh, duplicates } = dedupeAgainst(contacts, candidates);
  const preview = fresh.slice(0, 50);

  const runImport = () => {
    setImporting(true);
    void importContacts(candidates)
      .then((s) => setSummary(s))
      .catch((e) => notify('Import failed', e instanceof Error ? e.message : String(e)))
      .finally(() => setImporting(false));
  };

  return (
    <Page
      title="Import from CSV"
      back={backBtn}
      actions={
        <div className="row">
          <Button
            title="Back to column matching"
            variant="secondary"
            onClick={() => {
              setCandidates(null);
              setErrors([]);
            }}
          />
          <Button
            title={`Import ${fresh.length} contact${fresh.length === 1 ? '' : 's'}`}
            disabled={fresh.length === 0}
            loading={importing}
            onClick={runImport}
          />
        </div>
      }
    >
      <div className="stack">
        <div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{`${fresh.length} new`}</div>
          <div className="muted">
            {`${candidates.length} found · ${duplicates.length} already in Legend (matched by phone, email, or name)`}
          </div>
        </div>

        {errors.length > 0 ? (
          <Banner tone="error">{`${errors.length} row(s) skipped: ${errors.slice(0, 3).join(' ')}`}</Banner>
        ) : null}

        {preview.length > 0 ? (
          <Card style={{ padding: 0 }}>
            <div style={{ padding: 'var(--s-md) var(--s-lg) var(--s-sm)' }}>
              <SectionLabel>Preview</SectionLabel>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }} className="small">
              <thead>
                <tr className="muted" style={{ textAlign: 'left' }}>
                  <th style={cellStyle}>Name</th>
                  <th style={cellStyle}>Company</th>
                  <th style={cellStyle}>Phone</th>
                  <th style={cellStyle}>Email</th>
                  <th style={cellStyle}>Where met</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((c, i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ ...cellStyle, fontWeight: 600 }}>{`${c.firstName} ${c.lastName}`.trim()}</td>
                    <td style={cellStyle} className="muted">{[c.title, c.company].filter(Boolean).join(' · ')}</td>
                    <td style={cellStyle} className="muted">{c.phones[0]?.number ?? ''}</td>
                    <td style={cellStyle} className="muted">{c.emails[0]?.address ?? ''}</td>
                    <td style={cellStyle} className="muted">{c.whereMet?.placeName ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {fresh.length > preview.length ? (
              <div className="muted small" style={{ padding: 'var(--s-sm) var(--s-lg) var(--s-md)' }}>
                {`…and ${fresh.length - preview.length} more`}
              </div>
            ) : null}
          </Card>
        ) : (
          <div className="empty">Nothing new to import — everyone here is already in Legend.</div>
        )}

        <div className="row">
          <Button
            title={`Import ${fresh.length} contact${fresh.length === 1 ? '' : 's'}`}
            disabled={fresh.length === 0}
            loading={importing}
            onClick={runImport}
          />
          <Button title="Cancel" variant="ghost" onClick={cancel} />
        </div>
      </div>
    </Page>
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

const codeStyle: React.CSSProperties = {
  display: 'block',
  padding: 'var(--s-sm) var(--s-md)',
  background: 'var(--surface-alt)',
  borderRadius: 'var(--r-sm)',
  fontFamily: 'ui-monospace, Consolas, monospace',
  fontSize: 12,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-all',
};

const cellStyle: React.CSSProperties = {
  padding: '6px var(--s-lg)',
  fontWeight: 'inherit',
};
