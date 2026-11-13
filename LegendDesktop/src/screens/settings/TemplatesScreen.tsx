// src/screens/settings/TemplatesScreen.tsx
// Manage saved outreach message templates — mirrors the phone's
// app/(app)/settings/templates.tsx. Text templates are body-only; email
// templates add a subject. {first}/{last}/{name} placeholders are filled per
// recipient at send time (see outreachService.personalize).

import { useState } from 'react';
import { ArrowLeft, Pencil, Plus, Trash2 } from 'lucide-react';
import { useAppSettings, type MessageTemplate } from '@legend/features/settings/AppSettingsContext';
import { confirm, notify } from '@legend/lib/notify';
import { BackButton } from '../../app/router';
import { Button, Card, Chip, IconButton, Page, Segmented, TextField } from '../../ui/components';

type Channel = 'text' | 'email';

interface Draft {
  id: string | null; // null = new
  name: string;
  channel: Channel;
  subject: string;
  body: string;
}

const EMPTY: Draft = { id: null, name: '', channel: 'text', subject: '', body: '' };

export default function TemplatesScreen() {
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
      <Page
        title={draft.id ? 'Edit Template' : 'New Template'}
        narrow
        back={
          <IconButton label="Back to templates" onClick={() => setDraft(null)}>
            <ArrowLeft size={20} />
          </IconButton>
        }
      >
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <Segmented
            value={draft.channel}
            options={[
              { id: 'text', label: 'Text' },
              { id: 'email', label: 'Email' },
            ]}
            onChange={(ch) => setDraft({ ...draft, channel: ch })}
          />
          <TextField
            label="Template name"
            placeholder="e.g. Check-in"
            autoFocus
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
          {draft.channel === 'email' ? (
            <TextField
              label="Subject"
              value={draft.subject}
              onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
            />
          ) : null}
          <TextField
            label="Message"
            hint="{first}, {last}, {name} are replaced per recipient."
            multiline
            rows={6}
            value={draft.body}
            onChange={(e) => setDraft({ ...draft, body: e.target.value })}
          />
          <div className="row">
            <Button type="submit" title="Save template" />
            <Button title="Cancel" variant="ghost" onClick={() => setDraft(null)} />
          </div>
        </form>
      </Page>
    );
  }

  return (
    <Page
      title="Message Templates"
      narrow
      back={<BackButton fallback="/settings" />}
      actions={<Button title="New template" icon={<Plus size={16} />} onClick={() => setDraft(EMPTY)} />}
    >
      <p className="muted" style={{ marginTop: 0, marginBottom: 'var(--s-lg)' }}>
        Reusable messages for text and email blasts. Pick one in the composer with "Use a template."
      </p>

      <div className="stack" style={{ gap: 'var(--s-sm)', marginBottom: 'var(--s-lg)' }}>
        {templates.length === 0 ? (
          <div className="muted">No templates yet — create your first with "New template".</div>
        ) : (
          templates.map((t) => (
            <Card key={t.id}>
              <div className="row">
                <Chip>{t.channel}</Chip>
                <div className="grow ellipsis" style={{ fontWeight: 600 }}>{t.name}</div>
                <IconButton label={`Edit ${t.name}`} onClick={() => startEdit(t)}>
                  <Pencil size={16} style={{ color: 'var(--primary)' }} />
                </IconButton>
                <IconButton
                  label={`Delete ${t.name}`}
                  onClick={() => confirm('Delete template?', `"${t.name}" will be removed.`, () => removeTemplate(t.id))}
                >
                  <Trash2 size={16} style={{ color: 'var(--danger)' }} />
                </IconButton>
              </div>
              {t.channel === 'email' && t.subject ? (
                <div className="small muted" style={{ marginTop: 'var(--s-xs)' }}>{`Subject: ${t.subject}`}</div>
              ) : null}
              <div
                className="small muted"
                style={{
                  marginTop: 2,
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {t.body}
              </div>
            </Card>
          ))
        )}
      </div>
    </Page>
  );
}
