// src/screens/contacts/KnowsPanel.tsx
// Knows Connections on a contact — desktop counterpart of the phone's
// src/features/contacts/components/KnowsSection.tsx + contact/knows.tsx
// picker. Strong links (by contact id), loose suggestions for links whose
// other person was deleted and re-imported (matched by name + phone; accept
// = relink by id), and lost links with nothing to match.

import React, { useMemo, useState } from 'react';
import { CheckCircle2, ChevronRight, Circle, Link2Off, Plus } from 'lucide-react';
import { useContacts } from '@legend/features/contacts/ContactsContext';
import { describeMatch, displayNameOf } from '@legend/features/contacts/knows';
import type { Contact } from '@legend/features/contacts/types';
import { notify, confirm } from '@legend/lib/notify';
import { useRouter } from '../../app/router';
import { Avatar, Button, Card, Modal, SectionLabel } from '../../ui/components';

const fail = (title: string) => (e: unknown) => notify(title, e instanceof Error ? e.message : String(e));

export function KnowsPanel({ contact }: { contact: Contact }) {
  const { navigate } = useRouter();
  const { knowsFor, relinkKnows, removeKnows } = useContacts();
  const { linked, suggested, lost } = knowsFor(contact.id);
  const [picking, setPicking] = useState(false);
  const firstName = contact.firstName || displayNameOf(contact) || 'them';

  return (
    <Card>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <SectionLabel>{`Knows (${linked.length})`}</SectionLabel>
        <Button size="sm" variant="ghost" title="Add" icon={<Plus size={14} />} onClick={() => setPicking(true)} />
      </div>

      {linked.length === 0 && suggested.length === 0 && lost.length === 0 ? (
        <div className="small muted" style={{ marginTop: 'var(--s-xs)' }}>
          {`Link the people ${firstName} knows — it maps who can introduce you to whom, and draws the lines in the Network view.`}
        </div>
      ) : null}

      {linked.length > 0 ? (
        <div style={{ marginTop: 'var(--s-xs)' }}>
          {linked.map(({ link, other }) => (
            <button key={link.id} type="button" className="list-row" style={{ padding: '6px 8px' }} onClick={() => navigate(`/contacts/${other.id}`)}>
              <Avatar uri={other.avatarUrl} name={displayNameOf(other)} size={28} />
              <div className="grow">
                <div className="ellipsis">{displayNameOf(other) || 'Unnamed'}</div>
                {link.note ? <div className="small muted ellipsis">{link.note}</div> : null}
              </div>
              <ChevronRight size={14} className="muted" />
            </button>
          ))}
        </div>
      ) : null}

      {suggested.length > 0 ? (
        <div className="stack" style={{ gap: 'var(--s-sm)', marginTop: 'var(--s-sm)' }}>
          <div className="small" style={{ color: 'var(--warning)', fontWeight: 600 }}>POSSIBLE MATCHES</div>
          {suggested.map((s) => {
            const isMe = s.candidate.contact.id === contact.id;
            const headline = isMe
              ? `${displayNameOf(s.anchor)} knew a “${s.was.name || 'contact'}” — is that ${firstName}?`
              : `Was “${s.was.name || 'a contact'}” → ${displayNameOf(s.candidate.contact)}?`;
            return (
              <div
                key={`${s.link.id}-${s.candidate.contact.id}`}
                style={{ border: '1px dashed var(--border-strong)', borderRadius: 'var(--r-md)', padding: 'var(--s-sm) var(--s-md)' }}
              >
                <div style={{ fontWeight: 500, fontSize: 'var(--fs-sm)' }}>{headline}</div>
                <div className="small muted" style={{ margin: '2px 0 6px' }}>
                  {`Matched on ${describeMatch(s.candidate)}. The original contact was removed, so this link is only a suggestion until you confirm it.`}
                </div>
                <div className="row">
                  <Button
                    size="sm"
                    title={isMe ? `Yes, link to ${displayNameOf(s.anchor)}` : 'Relink'}
                    onClick={() => void relinkKnows(s.link.id, s.missingSide, s.candidate.contact.id).catch(fail('Could not relink'))}
                  />
                  {!isMe ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      title="Remove link"
                      onClick={() => void removeKnows(s.link.id).catch(fail('Could not remove'))}
                    />
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {lost.map((l) => (
        <div key={l.link.id} className="row" style={{ padding: '6px 8px', gap: 'var(--s-md)' }}>
          <Link2Off size={16} className="muted" />
          <div className="grow">
            <div className="muted">{l.was.name || 'Removed contact'}</div>
            <div className="small muted">Removed — re-add or re-import them to relink.</div>
          </div>
          <Button
            size="sm"
            variant="ghost"
            title="Forget"
            onClick={() =>
              confirm('Forget this connection?', `${firstName} will no longer be linked to ${l.was.name || 'this person'}.`, () => {
                void removeKnows(l.link.id).catch(fail('Could not remove'));
              })
            }
          />
        </div>
      ))}

      <KnowsPicker contact={contact} open={picking} onClose={() => setPicking(false)} />
    </Card>
  );
}

/** Search the network and toggle who `contact` knows (phone: contact/knows.tsx). */
function KnowsPicker({ contact, open, onClose }: { contact: Contact; open: boolean; onClose: () => void }) {
  const { contacts, knowsFor, addKnows, removeKnows } = useContacts();
  const [query, setQuery] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const linkByOther = useMemo(() => {
    const map = new Map<string, string>();
    for (const l of knowsFor(contact.id).linked) map.set(l.other.id, l.link.id);
    return map;
  }, [contact.id, knowsFor]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return contacts
      .filter((c) => c.id !== contact.id)
      .filter(
        (c) =>
          !q ||
          [displayNameOf(c), c.company ?? '', c.title ?? '', ...c.phones.map((p) => p.number)].some((s) =>
            s.toLowerCase().includes(q),
          ),
      )
      .sort(
        (a, b) =>
          Number(linkByOther.has(b.id)) - Number(linkByOther.has(a.id)) ||
          displayNameOf(a).localeCompare(displayNameOf(b)),
      );
  }, [contacts, contact.id, query, linkByOther]);

  const toggle = async (otherId: string) => {
    setBusy(otherId);
    try {
      const linkId = linkByOther.get(otherId);
      if (linkId) await removeKnows(linkId);
      else await addKnows(contact.id, otherId, note || undefined);
    } catch (e) {
      fail('Could not update')(e);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal open={open} title={`${contact.firstName || displayNameOf(contact)} knows…`} onClose={onClose} width={520}>
      <input
        className="input"
        autoFocus
        placeholder="Search name, company, phone"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <input
        className="input"
        placeholder="Optional note for new links (e.g. “college roommates”)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        style={{ marginTop: 'var(--s-sm)' }}
      />
      <div className="small muted" style={{ margin: 'var(--s-sm) 0' }}>
        {`${linkByOther.size} linked · click to link or unlink. Links show on both people.`}
      </div>
      <div style={{ maxHeight: '50vh', overflowY: 'auto' }}>
        {rows.length === 0 ? <div className="muted">No other contacts match.</div> : null}
        {rows.map((c) => {
          const isLinked = linkByOther.has(c.id);
          return (
            <button
              key={c.id}
              type="button"
              role="checkbox"
              aria-checked={isLinked}
              className="list-row"
              disabled={busy !== null}
              style={{ opacity: busy === c.id ? 0.5 : 1 }}
              onClick={() => void toggle(c.id)}
            >
              <Avatar uri={c.avatarUrl} name={displayNameOf(c)} size={32} />
              <div className="grow">
                <div className="ellipsis">{displayNameOf(c) || 'Unnamed'}</div>
                {c.company || c.title ? (
                  <div className="small muted ellipsis">{[c.title, c.company].filter(Boolean).join(' · ')}</div>
                ) : null}
              </div>
              {isLinked ? <CheckCircle2 size={20} color="var(--primary)" /> : <Circle size={20} className="muted" />}
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
