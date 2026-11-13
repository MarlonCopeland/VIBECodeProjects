// src/screens/circles/CirclesScreen.tsx
// Circles of Influence: saved premise queries that surface matching contacts.
// Mirrors the phone's app/(app)/(tabs)/circles.tsx — on desktop the circles
// lay out as a card grid with "New circle" in the page header.

import { Plus, Users } from 'lucide-react';
import { useContacts } from '@legend/features/contacts/ContactsContext';
import { matchCircle } from '@legend/features/circles/circlesService';
import { useRouter } from '../../app/router';
import { Button, Page } from '../../ui/components';

export default function CirclesScreen() {
  const { navigate } = useRouter();
  const { circles, contacts, gradeFor } = useContacts();

  return (
    <Page
      title="Circles"
      actions={<Button title="New circle" icon={<Plus size={16} />} onClick={() => navigate('/circle/new')} />}
    >
      <p className="muted" style={{ marginTop: 0, marginBottom: 'var(--s-lg)', maxWidth: 720 }}>
        A circle is a premise — an event, topic, expertise, hobby, or interest. Legend surfaces everyone who
        matches it, ready to text, email, or call.
      </p>

      {circles.length === 0 ? (
        <div className="empty card">
          <p style={{ marginTop: 0 }}>No circles yet — create your first one.</p>
          <Button title="New circle" icon={<Plus size={16} />} onClick={() => navigate('/circle/new')} />
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 'var(--s-md)',
          }}
        >
          {circles.map((circle) => {
            const members = matchCircle(circle, contacts, gradeFor);
            const summary = [
              circle.query.tags.length ? `#${circle.query.tags.join(' #')}` : '',
              circle.query.kinds.join(', '),
              circle.query.text ? `"${circle.query.text}"` : '',
            ]
              .filter(Boolean)
              .join(' · ');
            return (
              <button
                key={circle.id}
                type="button"
                className="card"
                onClick={() => navigate(`/circle/${circle.id}`)}
                style={{ textAlign: 'left', cursor: 'pointer', font: 'inherit', color: 'inherit' }}
              >
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <strong className="ellipsis">{circle.name}</strong>
                  <span className="row muted small" style={{ gap: 4 }} title={`${members.length} members`}>
                    <Users size={14} />
                    {members.length}
                  </span>
                </div>
                {summary ? (
                  <div className="muted small" style={{ marginTop: 'var(--s-xs)' }}>
                    {summary}
                  </div>
                ) : null}
              </button>
            );
          })}
        </div>
      )}
    </Page>
  );
}
