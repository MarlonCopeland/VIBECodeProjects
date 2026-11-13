// src/screens/outreach/EmailBlastScreen.tsx
// Email blast: one BCC message to the whole circle (recipients stay private
// from each other), or an individual stepper for personalized emails. Sends
// log `email` interactions. Mirrors the phone's app/(app)/outreach/email.tsx
// (?circleId= scopes it to a circle). mailto: links open the OS mail client.

import { useEffect, useMemo, useState } from 'react';
import { FileText } from 'lucide-react';
import { useContacts } from '@legend/features/contacts/ContactsContext';
import { matchCircle } from '@legend/features/circles/circlesService';
import { composeBccEmail, composeEmail, emailTargets, personalize } from '@legend/features/outreach/outreachService';
import { useAppSettings, type MessageTemplate } from '@legend/features/settings/AppSettingsContext';
import { notify } from '@legend/lib/notify';
import { BackButton, useRouter } from '../../app/router';
import { Button, Card, Modal, Page, Segmented, SectionLabel, TextField } from '../../ui/components';

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

type Mode = 'bcc' | 'stepper';

export default function EmailBlastScreen() {
  const { route, navigate, back } = useRouter();
  const circleId = route.query.circleId;
  const { circles, contacts, gradeFor, logInteraction } = useContacts();
  const { applyMeExclusion } = useAppSettings();

  const circle = circles.find((c) => c.id === circleId);
  const matched = useMemo(() => {
    const members = circle ? matchCircle(circle, contacts, gradeFor).map((m) => m.contact) : contacts;
    return emailTargets(applyMeExclusion(members));
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

  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [mode, setMode] = useState<Mode>('bcc');
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);

  const current = targets[index];
  // (Phone shows "All done" for an empty list; desktop shows the empty state.)
  const done = mode === 'stepper' && targets.length > 0 && index >= targets.length;
  const fallback = circle ? `/circle/${circle.id}` : '/circles';

  const sendBcc = async () => {
    setBusy(true);
    try {
      await composeBccEmail(targets, subject, body);
      await Promise.all(
        targets.map((t) => logInteraction({ contactId: t.contact.id, kind: 'email', note: 'Email blast (BCC)' })),
      );
      notify('Logged', `Email interaction logged for ${targets.length} contacts.`);
      back(fallback);
    } catch (e) {
      notify('Email failed', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const sendCurrent = async () => {
    if (!current) return;
    setBusy(true);
    try {
      await composeEmail(current, subject, personalize(body, current.contact));
      await logInteraction({ contactId: current.contact.id, kind: 'email', note: 'Email blast' });
      setIndex((i) => i + 1);
    } catch (e) {
      notify('Email failed', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page title="Email blast" back={<BackButton fallback={fallback} />}>
      <p className="muted" style={{ marginTop: 0, marginBottom: 'var(--s-lg)' }}>
        {circle ? `Circle: ${circle.name} · ` : ''}
        {`${targets.length} contact${targets.length === 1 ? '' : 's'} with an email address.`}
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 'var(--s-xl)', alignItems: 'start' }}>
        {/* Composer */}
        <div className="stack">
          <div>
            <Segmented<Mode>
              value={mode}
              options={[
                { id: 'bcc', label: 'One BCC email' },
                { id: 'stepper', label: 'One-by-one' },
              ]}
              onChange={setMode}
            />
          </div>
          <TemplatePicker
            channel="email"
            onPick={(t) => {
              if (t.subject !== undefined) setSubject(t.subject);
              setBody(t.body);
            }}
          />
          <TextField label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
          <TextField
            label="Body"
            placeholder={mode === 'stepper' ? 'Hi {first}, …' : 'Hi everyone, …'}
            hint={
              mode === 'stepper'
                ? '{first}, {last}, {name} personalize each email.'
                : 'Recipients are BCC’d — they never see each other.'
            }
            multiline
            rows={8}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </div>

        {/* Send panel */}
        {mode === 'bcc' ? (
          <Card>
            <SectionLabel>{`BCC · ${targets.length} recipient${targets.length === 1 ? '' : 's'}`}</SectionLabel>
            {targets.length > 0 ? (
              <div className="muted small" style={{ marginTop: 'var(--s-sm)', maxHeight: 160, overflow: 'auto' }}>
                {targets.map((t) => `${t.contact.firstName} ${t.contact.lastName}`.trim()).join(', ')}
              </div>
            ) : (
              <div className="muted small" style={{ marginTop: 'var(--s-sm)' }}>
                No contacts with email addresses in this circle.
              </div>
            )}
            <div style={{ marginTop: 'var(--s-lg)' }}>
              <Button
                title={`Open email to ${targets.length} recipients`}
                loading={busy}
                disabled={targets.length === 0 || !subject.trim()}
                onClick={() => void sendBcc()}
              />
            </div>
          </Card>
        ) : done ? (
          <Card>
            <h2 style={{ margin: 0 }}>All done</h2>
            <div style={{ marginTop: 'var(--s-lg)' }}>
              <Button title="Back" onClick={() => back(fallback)} />
            </div>
          </Card>
        ) : current ? (
          <Card>
            <SectionLabel>{`Email ${index + 1} of ${targets.length}`}</SectionLabel>
            <button
              type="button"
              onClick={() => navigate(`/contacts/${current.contact.id}`)}
              style={{ marginTop: 'var(--s-xs)', padding: 0, border: 'none', background: 'none', font: 'inherit', color: 'inherit', cursor: 'pointer', textAlign: 'left' }}
            >
              <h2 style={{ margin: 0 }}>{`${current.contact.firstName} ${current.contact.lastName}`.trim()}</h2>
            </button>
            <div className="muted">{current.address}</div>
            {body.trim() ? (
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
                {personalize(body, current.contact)}
              </div>
            ) : null}
            <div className="row" style={{ marginTop: 'var(--s-lg)' }}>
              <Button
                title="Open email composer"
                loading={busy}
                disabled={!subject.trim()}
                onClick={() => void sendCurrent()}
              />
              <Button title="Skip" variant="ghost" onClick={() => setIndex((i) => i + 1)} />
            </div>
          </Card>
        ) : (
          <div className="empty card">No contacts with email addresses in this circle.</div>
        )}
      </div>
    </Page>
  );
}
