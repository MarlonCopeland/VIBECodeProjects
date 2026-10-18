// src/screens/contacts/ContactDetail.tsx
// Detail pane of the Contacts view — the phone's app/(app)/contact/[id].tsx:
// grade hero, quick actions that open the channel AND log the touch (with a
// chooser when there are several numbers/emails), where-met, premises, Knows
// Connections, notes, a manual interaction logger and the full history.

import React, { useState } from 'react';
import {
  MessageSquare,
  Mail,
  NotebookPen,
  Pencil,
  Phone,
  Sparkles,
  Users,
  Network,
  Star,
  type LucideIcon,
} from 'lucide-react';
import { useContacts } from '@legend/features/contacts/ContactsContext';
import { useAppSettings } from '@legend/features/settings/AppSettingsContext';
import { pointsToNextTier } from '@legend/features/contacts/grading';
import type { InteractionKind } from '@legend/features/contacts/types';
import { notify, confirm } from '@legend/lib/notify';
import { useRouter } from '../../app/router';
import { Button, Card, GradeBadge, Modal, SectionLabel, Avatar } from '../../ui/components';
import { openExternal } from '../../platform/bridge';
import { KnowsPanel } from './KnowsPanel';

const KIND_META: Record<InteractionKind, { label: string; Icon: LucideIcon }> = {
  call: { label: 'Call', Icon: Phone },
  text: { label: 'Text', Icon: MessageSquare },
  email: { label: 'Email', Icon: Mail },
  visit: { label: 'Visit', Icon: Users },
  premise: { label: 'Premise', Icon: Sparkles },
  note: { label: 'Note', Icon: NotebookPen },
};

const URL_PREFIX = { call: 'tel', text: 'sms', email: 'mailto' } as const;
type ChannelKind = keyof typeof URL_PREFIX;

export function ContactDetail({ contactId }: { contactId: string }) {
  const { navigate } = useRouter();
  const { contactById, gradeFor, interactionsFor, logInteraction, deleteContact, updateContact } = useContacts();
  const { gradingConfig, meContactId } = useAppSettings();
  const weights = gradingConfig.weights;
  const [logKind, setLogKind] = useState<InteractionKind>('note');
  const [logNote, setLogNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [chooser, setChooser] = useState<ChannelKind | null>(null);

  const contact = contactById(contactId);
  if (!contact) {
    return <div className="empty">Contact not found.</div>;
  }

  const grade = gradeFor(contact.id);
  const history = interactionsFor(contact.id);
  const name = `${contact.firstName} ${contact.lastName}`.trim() || contact.nickname || 'Unnamed';
  const next = pointsToNextTier(grade.score, gradingConfig.tiers);

  const act = async (kind: InteractionKind, open?: () => Promise<unknown>) => {
    try {
      if (open) await open();
      await logInteraction({ contactId: contact.id, kind });
    } catch (e) {
      notify('Action failed', e instanceof Error ? e.message : String(e));
    }
  };

  const channelEntries = (kind: ChannelKind): { label: string; value: string }[] =>
    kind === 'email'
      ? contact.emails.map((e) => ({ label: e.label, value: e.address }))
      : contact.phones.map((p) => ({ label: p.label, value: p.number }));

  const openChannel = (kind: ChannelKind, value: string) =>
    void act(kind, async () => {
      const ok = await openExternal(`${URL_PREFIX[kind]}:${encodeURIComponent(value)}`);
      if (!ok) throw new Error('No app on this computer handles that link.');
    });

  const runChannel = (kind: ChannelKind) => {
    const entries = channelEntries(kind);
    if (entries.length === 1) openChannel(kind, entries[0]!.value);
    else if (entries.length > 1) setChooser(kind);
  };

  const quickButton = (kind: InteractionKind, enabled: boolean, onClick: () => void) => {
    const { Icon, label } = KIND_META[kind];
    return (
      <button
        key={kind}
        type="button"
        disabled={!enabled}
        onClick={onClick}
        className="card"
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 4,
          padding: 'var(--s-md)',
          cursor: enabled ? 'pointer' : 'default',
          opacity: enabled ? 1 : 0.4,
          borderRadius: 'var(--r-md)',
        }}
      >
        <Icon size={20} color="var(--primary)" />
        <span className="small">{label}</span>
      </button>
    );
  };

  return (
    <div style={{ padding: 'var(--s-xl) var(--s-xxl)', maxWidth: 980 }}>
      <Modal
        open={chooser !== null}
        title={chooser ? `${KIND_META[chooser].label} ${contact.firstName || name}` : undefined}
        onClose={() => setChooser(null)}
        width={400}
      >
        {chooser
          ? channelEntries(chooser).map((e, i) => {
              const Icon = KIND_META[chooser].Icon;
              return (
                <button
                  key={`${e.value}-${i}`}
                  type="button"
                  className="list-row"
                  onClick={() => {
                    setChooser(null);
                    openChannel(chooser, e.value);
                  }}
                >
                  <Icon size={18} color="var(--primary)" />
                  <div className="grow">
                    <div>{e.label || 'other'}</div>
                    <div className="small muted">{e.value}</div>
                  </div>
                </button>
              );
            })
          : null}
      </Modal>

      <div className="row" style={{ alignItems: 'flex-start', gap: 'var(--s-lg)' }}>
        <Avatar uri={contact.avatarUrl} name={name} size={64} />
        <div className="grow">
          <div className="row">
            <h1 style={{ margin: 0, fontSize: 'var(--fs-xxl)' }} className="ellipsis">{name}</h1>
            {contact.id === meContactId ? (
              <span className="grade-pill" style={{ background: 'var(--primary)', color: 'var(--on-primary)' }}>ME</span>
            ) : null}
          </div>
          {contact.title || contact.company ? (
            <div className="muted">{[contact.title, contact.company].filter(Boolean).join(' · ')}</div>
          ) : null}
          {contact.nickname ? <div className="small muted">{`“${contact.nickname}”`}</div> : null}
        </div>
        <div className="row">
          <Button
            variant="ghost"
            size="sm"
            title={contact.favorite ? 'Favorite' : 'Favorite'}
            icon={<Star size={14} fill={contact.favorite ? 'var(--warning)' : 'none'} color={contact.favorite ? 'var(--warning)' : undefined} />}
            onClick={() => void updateContact(contact.id, { favorite: !contact.favorite })}
            aria-pressed={contact.favorite}
          />
          <Button
            variant="ghost"
            size="sm"
            title="Show in network"
            icon={<Network size={14} />}
            onClick={() => navigate('/network', { focus: contact.id })}
          />
          <Button variant="secondary" size="sm" title="Edit" icon={<Pencil size={14} />} onClick={() => navigate(`/contact/${contact.id}/edit`)} />
        </div>
      </div>

      <div className="row" style={{ marginTop: 'var(--s-lg)', alignItems: 'center', gap: 'var(--s-lg)' }}>
        <GradeBadge grade={grade} variant="hero" />
        {next ? (
          <span className="small muted">
            {`${next.points} points to ${next.next.label} — a call is +${weights.call}, a visit +${weights.visit}.`}
          </span>
        ) : null}
      </div>

      <div className="row" style={{ marginTop: 'var(--s-lg)', gap: 'var(--s-sm)', maxWidth: 560 }}>
        {quickButton('call', contact.phones.length > 0, () => runChannel('call'))}
        {quickButton('text', contact.phones.length > 0, () => runChannel('text'))}
        {quickButton('email', contact.emails.length > 0, () => runChannel('email'))}
        {quickButton('visit', true, () => void act('visit'))}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 'var(--s-md)',
          marginTop: 'var(--s-lg)',
          alignItems: 'start',
        }}
      >
        <div className="stack">
          {contact.phones.length || contact.emails.length ? (
            <Card>
              <SectionLabel>Contact info</SectionLabel>
              <div className="stack" style={{ gap: 6, marginTop: 'var(--s-sm)' }}>
                {contact.phones.map((p, i) => (
                  <div key={`p${i}`} className="row">
                    <Phone size={14} className="muted" />
                    <span className="small muted" style={{ width: 56 }}>{p.label}</span>
                    <span>{p.number}</span>
                  </div>
                ))}
                {contact.emails.map((e, i) => (
                  <div key={`e${i}`} className="row">
                    <Mail size={14} className="muted" />
                    <span className="small muted" style={{ width: 56 }}>{e.label}</span>
                    <span className="ellipsis">{e.address}</span>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}

          {contact.whereMet ? (
            <Card>
              <SectionLabel>Where we met</SectionLabel>
              <div style={{ fontWeight: 600, marginTop: 'var(--s-xs)' }}>
                {contact.whereMet.placeName}
                {contact.whereMet.city ? ` — ${contact.whereMet.city}` : ''}
              </div>
              {contact.whereMet.note ? <div className="muted">{contact.whereMet.note}</div> : null}
            </Card>
          ) : null}

          {contact.premises.length > 0 ? (
            <Card>
              <SectionLabel>Premises</SectionLabel>
              <div className="row wrap" style={{ marginTop: 'var(--s-sm)' }}>
                {contact.premises.map((p) => (
                  <span key={p.id} className="chip">
                    <span className="muted">{`${p.kind} · `}</span>
                    {p.label}
                    {p.tags.length ? <span className="muted">{`  #${p.tags.join(' #')}`}</span> : null}
                  </span>
                ))}
              </div>
            </Card>
          ) : null}

          {contact.notes ? (
            <Card>
              <SectionLabel>Notes</SectionLabel>
              <div style={{ marginTop: 'var(--s-xs)', whiteSpace: 'pre-wrap' }}>{contact.notes}</div>
            </Card>
          ) : null}
        </div>

        <div className="stack">
          <KnowsPanel contact={contact} />

          <Card>
            <SectionLabel>Log an interaction</SectionLabel>
            <div className="row wrap" style={{ margin: 'var(--s-sm) 0' }}>
              {(Object.keys(KIND_META) as InteractionKind[]).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  className={`chip${logKind === kind ? ' selected' : ''}`}
                  aria-pressed={logKind === kind}
                  onClick={() => setLogKind(kind)}
                >
                  {`${KIND_META[kind].label} +${weights[kind]}`}
                </button>
              ))}
            </div>
            <input
              className="input"
              placeholder="Optional note (what did you talk about?)"
              value={logNote}
              onChange={(e) => setLogNote(e.target.value)}
              style={{ marginBottom: 'var(--s-sm)' }}
            />
            <Button
              title="Log it"
              loading={saving}
              onClick={() => {
                setSaving(true);
                void logInteraction({ contactId: contact.id, kind: logKind, note: logNote || undefined })
                  .then(() => setLogNote(''))
                  .catch((e) => notify('Could not log', e instanceof Error ? e.message : String(e)))
                  .finally(() => setSaving(false));
              }}
            />
          </Card>
        </div>
      </div>

      <SectionLabel style={{ marginTop: 'var(--s-xl)', marginBottom: 'var(--s-sm)' }}>{`History (${history.length})`}</SectionLabel>
      {history.length === 0 ? (
        <div className="muted">No interactions yet — the grade starts climbing with the first one.</div>
      ) : (
        <div>
          {history.map((i) => {
            const { Icon, label } = KIND_META[i.kind];
            return (
              <div key={i.id} className="row" style={{ gap: 'var(--s-md)', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <Icon size={16} color="var(--text-muted)" />
                <div className="grow">
                  <div style={{ fontWeight: 500, fontSize: 'var(--fs-sm)' }}>{label}</div>
                  {i.note ? <div className="small muted">{i.note}</div> : null}
                </div>
                <span className="small muted">{new Date(i.occurredAt).toLocaleDateString()}</span>
              </div>
            );
          })}
        </div>
      )}

      <Button
        title="Delete contact"
        variant="danger"
        style={{ marginTop: 'var(--s-xxl)' }}
        onClick={() =>
          confirm(
            'Delete contact?',
            `${name} and their interaction history will be removed from Legend.\n\n` +
              `Legend never touches other sources: if ${contact.firstName || 'they'} is also in your phone's contacts ` +
              `or another synced source you import from, remove them there too or they may come back on the next import.\n\n` +
              `Their Knows Connections are kept: if you re-import ${contact.firstName || 'them'}, Legend will suggest relinking.`,
            () => {
              void deleteContact(contact.id).then(() => navigate('/contacts'));
            },
          )
        }
      />
    </div>
  );
}
