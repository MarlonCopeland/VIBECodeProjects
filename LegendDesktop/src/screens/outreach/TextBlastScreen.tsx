// src/screens/outreach/TextBlastScreen.tsx
// Text blast: compose once, send as INDIVIDUAL texts one at a time (no OS
// provides a mass-SMS API by design — the stepper pre-fills each compose).
// Every send logs a `text` interaction, feeding the grade. Mirrors the
// phone's app/(app)/outreach/text.tsx (?circleId= scopes it to a circle).
//
// Desktop: composeSms finds no expo-sms (shimmed) and falls back to an
// `sms:` link, which the OS hands to its texting app (e.g. Windows Phone Link).

import { useEffect, useMemo, useState } from 'react';
import { FileText } from 'lucide-react';
import { useContacts } from '@legend/features/contacts/ContactsContext';
import { matchCircle } from '@legend/features/circles/circlesService';
import { composeSms, personalize, smsTargets } from '@legend/features/outreach/outreachService';
import { useAppSettings, type MessageTemplate } from '@legend/features/settings/AppSettingsContext';
import { notify } from '@legend/lib/notify';
import { BackButton, useRouter } from '../../app/router';
import { Button, Card, GradeBadge, Modal, Page, SectionLabel, TextField } from '../../ui/components';

/** Desktop "Use a template" picker (phone: src/features/outreach/TemplateButton). */
function TemplatePicker({ channel, onPick }: { channel: 'text' | 'email'; onPick: (t: MessageTemplate) => void }) {
  const { templates } = useAppSettings();
  const [open, setOpen] = useState(false);
  const mine = templates.filter((t) => t.channel === channel);
  if (mine.length === 0) return null;
  return (
    <>
      <div>
        <Button title="Use a template" variant="ghost" size="sm" icon={<FileText size={14} />} onClick={() => setOpen(true)} />
      </div>
      <Modal open={open} title="Use a template" onClose={() => setOpen(false)}>
        <div className="stack" style={{ gap: 'var(--s-xs)' }}>
          {mine.map((t) => (
            <button
              key={t.id}
              type="button"
              className="list-row"
              onClick={() => {
                onPick(t);
                setOpen(false);
              }}
              style={{ border: 'none', background: 'transparent', font: 'inherit', color: 'inherit', textAlign: 'left', width: '100%' }}
            >
              <FileText size={18} color="var(--text-muted)" />
              <div className="grow" style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{t.name}</div>
                <div className="muted small ellipsis">
                  {t.channel === 'email' && t.subject ? `${t.subject} — ${t.body}` : t.body}
                </div>
              </div>
            </button>
          ))}
        </div>
      </Modal>
    </>
  );
}

export default function TextBlastScreen() {
  const { route, navigate, back } = useRouter();
  const circleId = route.query.circleId;
  const { circles, contacts, gradeFor, logInteraction } = useContacts();
  const { applyMeExclusion } = useAppSettings();

  const circle = circles.find((c) => c.id === circleId);
  const matched = useMemo(() => {
    const members = circle ? matchCircle(circle, contacts, gradeFor).map((m) => m.contact) : contacts;
    return smsTargets(applyMeExclusion(members));
  }, [circle, contacts, gradeFor, applyMeExclusion]);

  // Freeze the order once it's known: logging a send bumps that contact's
  // grade, and circle members re-sort by grade — which would skip someone.
  const [order, setOrder] = useState<string[] | null>(null);
  useEffect(() => {
    if (order === null && matched.length > 0) setOrder(matched.map((t) => t.contact.id));
  }, [order, matched]);
  const targets = useMemo(() => {
    if (!order) return matched;
    const byId = new Map(matched.map((t) => [t.contact.id, t] as const));
    return order.flatMap((id) => byId.get(id) ?? []);
  }, [order, matched]);

  const [message, setMessage] = useState('');
  const [index, setIndex] = useState(0);
  const [sent, setSent] = useState(0);
  const [busy, setBusy] = useState(false);

  const current = targets[index];
  // (Phone shows "Blast complete" for an empty list; desktop shows the empty state.)
  const done = targets.length > 0 && index >= targets.length;
  const fallback = circle ? `/circle/${circle.id}` : '/circles';

  const sendCurrent = async () => {
    if (!current || !message.trim()) return;
    setBusy(true);
    try {
      const ok = await composeSms(current, personalize(message, current.contact));
      if (ok) {
        await logInteraction({ contactId: current.contact.id, kind: 'text', note: 'Text blast' });
        setSent((n) => n + 1);
      }
      setIndex((i) => i + 1);
    } catch (e) {
      notify('Send failed', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page title="Text blast" back={<BackButton fallback={fallback} />}>
      <p className="muted" style={{ marginTop: 0, marginBottom: 'var(--s-lg)' }}>
        {circle ? `Circle: ${circle.name} · ` : ''}
        {`${targets.length} contact${targets.length === 1 ? '' : 's'} with a phone number. Each gets an individual text — nobody sees a group thread.`}
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 'var(--s-xl)', alignItems: 'start' }}>
        {/* Composer */}
        <div className="stack">
          <TemplatePicker channel="text" onPick={(t) => setMessage(t.body)} />
          <TextField
            label="Message"
            placeholder="Hey {first} — it's been a minute! …"
            hint="{first}, {last}, and {name} personalize each text."
            multiline
            rows={6}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        </div>

        {/* Stepper */}
        {done ? (
          <Card>
            <h2 style={{ margin: 0 }}>Blast complete</h2>
            <p className="muted" style={{ marginBottom: 0 }}>
              {`${sent} of ${targets.length} sent and logged — each contact's grade just got +5.`}
            </p>
            <div style={{ marginTop: 'var(--s-lg)' }}>
              <Button title="Done" onClick={() => back(fallback)} />
            </div>
          </Card>
        ) : current ? (
          <Card>
            <SectionLabel>{`Sending ${index + 1} of ${targets.length}`}</SectionLabel>
            <div className="row" style={{ marginTop: 'var(--s-sm)' }}>
              <button
                type="button"
                onClick={() => navigate(`/contacts/${current.contact.id}`)}
                style={{ padding: 0, border: 'none', background: 'none', font: 'inherit', color: 'inherit', cursor: 'pointer' }}
              >
                <h2 style={{ margin: 0 }}>{`${current.contact.firstName} ${current.contact.lastName}`.trim()}</h2>
              </button>
              <GradeBadge grade={gradeFor(current.contact.id)} variant="dot" />
            </div>
            <div className="muted">{current.address}</div>
            {message.trim() ? (
              <div
                className="small"
                style={{
                  marginTop: 'var(--s-md)',
                  padding: 'var(--s-md)',
                  borderRadius: 'var(--r-md)',
                  background: 'var(--surface-alt)',
                  whiteSpace: 'pre-wrap',
                }}
              >
                <span className="muted">Preview: </span>
                {personalize(message, current.contact)}
              </div>
            ) : null}
            <div className="row" style={{ marginTop: 'var(--s-lg)' }}>
              <Button
                title="Open text composer"
                loading={busy}
                disabled={!message.trim()}
                onClick={() => void sendCurrent()}
              />
              <Button title="Skip" variant="ghost" onClick={() => setIndex((i) => i + 1)} />
            </div>
          </Card>
        ) : (
          <div className="empty card">No contacts with phone numbers in this circle.</div>
        )}
      </div>
    </Page>
  );
}
