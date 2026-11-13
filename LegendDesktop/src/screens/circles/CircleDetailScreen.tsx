// src/screens/circles/CircleDetailScreen.tsx
// Circle detail: matched members with grades + match reasons, pin/exclude
// overrides, and the three outreach launchers (text blast, email, call list).
// Mirrors the phone's app/(app)/circle/[id].tsx. Member rows open the
// desktop contact view at /contacts/:id.

import { Mail, MessageSquare, MinusCircle, Pencil, Phone, Star } from 'lucide-react';
import { useContacts } from '@legend/features/contacts/ContactsContext';
import { matchCircle } from '@legend/features/circles/circlesService';
import { isFeatureEnabled } from '@legend/config/features';
import { BackButton, matchPath, useRouter } from '../../app/router';
import { Avatar, Button, GradeBadge, IconButton, Page } from '../../ui/components';

export default function CircleDetailScreen() {
  const { route, navigate } = useRouter();
  const id = matchPath('/circle/:id', route.path)?.id;
  const { circles, contacts, gradeFor, updateCircle } = useContacts();

  const circle = circles.find((c) => c.id === id);
  if (!circle) {
    return (
      <Page title="Circle" back={<BackButton fallback="/circles" />}>
        <div className="empty">Circle not found.</div>
      </Page>
    );
  }

  const members = matchCircle(circle, contacts, gradeFor);
  const outreach = isFeatureEnabled('outreach');

  const togglePin = (contactId: string) => {
    const pinned = circle.pinnedContactIds.includes(contactId)
      ? circle.pinnedContactIds.filter((x) => x !== contactId)
      : [...circle.pinnedContactIds, contactId];
    void updateCircle(circle.id, { pinnedContactIds: pinned });
  };

  const exclude = (contactId: string) => {
    void updateCircle(circle.id, {
      excludedContactIds: [...circle.excludedContactIds, contactId],
      pinnedContactIds: circle.pinnedContactIds.filter((x) => x !== contactId),
    });
  };

  return (
    <Page
      title={circle.name}
      back={<BackButton fallback="/circles" />}
      actions={
        <Button
          title="Edit"
          variant="secondary"
          icon={<Pencil size={16} />}
          aria-label="Edit circle"
          onClick={() => navigate(`/circle/${circle.id}/edit`)}
        />
      }
    >
      <div className="row wrap" style={{ justifyContent: 'space-between', marginBottom: 'var(--s-lg)', gap: 'var(--s-md)' }}>
        <div>
          <div className="muted">{`${members.length} member${members.length === 1 ? '' : 's'} match this premise.`}</div>
          {circle.excludedContactIds.length > 0 ? (
            <button
              type="button"
              onClick={() => void updateCircle(circle.id, { excludedContactIds: [] })}
              className="small"
              style={{
                marginTop: 'var(--s-xs)',
                padding: 0,
                border: 'none',
                background: 'none',
                color: 'var(--primary)',
                cursor: 'pointer',
                font: 'inherit',
              }}
            >
              {`${circle.excludedContactIds.length} excluded — click to restore all`}
            </button>
          ) : null}
        </div>

        {outreach ? (
          <div className="row">
            <Button
              title="Text all"
              icon={<MessageSquare size={16} />}
              onClick={() => navigate('/outreach/text', { circleId: circle.id })}
            />
            <Button
              title="Email all"
              variant="secondary"
              icon={<Mail size={16} />}
              onClick={() => navigate('/outreach/email', { circleId: circle.id })}
            />
            <Button
              title="Call list"
              variant="secondary"
              icon={<Phone size={16} />}
              onClick={() => navigate('/outreach/calls', { circleId: circle.id })}
            />
          </div>
        ) : null}
      </div>

      {members.length === 0 ? (
        <div className="empty card">
          No matches. Edit the circle to broaden its premise, or add premises/tags to your contacts.
        </div>
      ) : (
        <div className="card" style={{ padding: 'var(--s-xs)' }}>
          {members.map((m, i) => {
            const name = `${m.contact.firstName} ${m.contact.lastName}`.trim();
            return (
              <div
                key={m.contact.id}
                className="row"
                style={{
                  gap: 'var(--s-sm)',
                  borderTop: i === 0 ? undefined : '1px solid var(--border)',
                  paddingRight: 'var(--s-sm)',
                }}
              >
                <button
                  type="button"
                  className="list-row grow"
                  onClick={() => navigate(`/contacts/${m.contact.id}`)}
                  style={{ border: 'none', background: 'transparent', font: 'inherit', color: 'inherit', textAlign: 'left', minWidth: 0 }}
                >
                  <Avatar uri={m.contact.avatarUrl} name={name} size={36} />
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="row">
                      <strong className="ellipsis">{name}</strong>
                      <GradeBadge grade={m.grade} variant="dot" />
                    </div>
                    <div className="muted small ellipsis">{m.reasons.join(' · ')}</div>
                  </div>
                  {[m.contact.title, m.contact.company].filter(Boolean).length ? (
                    <span className="muted small ellipsis" style={{ maxWidth: 260 }}>
                      {[m.contact.title, m.contact.company].filter(Boolean).join(' · ')}
                    </span>
                  ) : null}
                </button>
                <IconButton label={m.pinned ? `Unpin ${name}` : `Pin ${name}`} onClick={() => togglePin(m.contact.id)}>
                  <Star
                    size={18}
                    color={m.pinned ? 'var(--warning)' : 'var(--text-muted)'}
                    fill={m.pinned ? 'var(--warning)' : 'none'}
                  />
                </IconButton>
                <IconButton label={`Exclude ${name}`} onClick={() => exclude(m.contact.id)}>
                  <MinusCircle size={18} color="var(--text-muted)" />
                </IconButton>
              </div>
            );
          })}
        </div>
      )}
    </Page>
  );
}
