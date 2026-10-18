// src/screens/outreach/CallListScreen.tsx
// Call list: a working phone queue ordered stalest-first (never-contacted at
// the top — they need the touch most). Dial, log the call, move on. Mirrors
// the phone's app/(app)/outreach/calls.tsx (?circleId= scopes it to a
// circle). `tel:` hands the call to the OS (Phone Link, FaceTime, Skype...).

import { useEffect, useMemo, useState } from 'react';
import { Phone } from 'lucide-react';
import { useContacts } from '@legend/features/contacts/ContactsContext';
import { matchCircle } from '@legend/features/circles/circlesService';
import { callTargets, dial, type OutreachTarget } from '@legend/features/outreach/outreachService';
import { describeFreshness } from '@legend/features/contacts/grading';
import { useAppSettings } from '@legend/features/settings/AppSettingsContext';
import { notify } from '@legend/lib/notify';
import { BackButton, useRouter } from '../../app/router';
import { Button, Card, GradeBadge, Page, SectionLabel } from '../../ui/components';

const UP_NEXT = 8;

export default function CallListScreen() {
  const { route, navigate, back } = useRouter();
  const circleId = route.query.circleId;
  const { circles, contacts, gradeFor, logInteraction } = useContacts();
  const { applyMeExclusion } = useAppSettings();

  const circle = circles.find((c) => c.id === circleId);

  // Stalest first: never-contacted, then longest-since-touch.
  const sorted = useMemo<OutreachTarget[]>(() => {
    const members = circle ? matchCircle(circle, contacts, gradeFor).map((m) => m.contact) : contacts;
    return callTargets(applyMeExclusion(members)).sort((a, b) => {
      const fa = gradeFor(a.contact.id).freshnessDays;
      const fb = gradeFor(b.contact.id).freshnessDays;
      if (fa === null && fb === null) return 0;
      if (fa === null) return -1;
      if (fb === null) return 1;
      return fb - fa;
    });
  }, [circle, contacts, gradeFor, applyMeExclusion]);

  // Freeze the order once it's known: logging a call makes that contact the
  // freshest, and re-sorting under the stepper would skip the next person.
  const [order, setOrder] = useState<string[] | null>(null);
  useEffect(() => {
    if (order === null && sorted.length > 0) setOrder(sorted.map((t) => t.contact.id));
  }, [order, sorted]);
  const queue = useMemo<OutreachTarget[]>(() => {
    if (!order) return sorted;
    const byId = new Map(sorted.map((t) => [t.contact.id, t] as const));
    return order.flatMap((id) => byId.get(id) ?? []);
  }, [order, sorted]);

  const [index, setIndex] = useState(0);
  const [calledIds, setCalledIds] = useState<string[]>([]);
  const current = queue[index];
  // (Phone shows "finished" for an empty list; desktop shows the empty state.)
  const done = queue.length > 0 && index >= queue.length;
  const fallback = circle ? `/circle/${circle.id}` : '/circles';

  const logAndNext = async () => {
    if (!current) return;
    try {
      await logInteraction({ contactId: current.contact.id, kind: 'call', note: 'Call list' });
      setCalledIds((prev) => [...prev, current.contact.id]);
      setIndex((i) => i + 1);
    } catch (e) {
      notify('Could not log', e instanceof Error ? e.message : String(e));
    }
  };

  const name = (t: OutreachTarget) => `${t.contact.firstName} ${t.contact.lastName}`.trim();
  const upcoming = done ? [] : queue.slice(index + 1, index + 1 + UP_NEXT);

  return (
    <Page title="Call list" back={<BackButton fallback={fallback} />}>
      <p className="muted" style={{ marginTop: 0, marginBottom: 'var(--s-lg)' }}>
        {circle ? `Circle: ${circle.name} · ` : ''}
        {`${queue.length} callable contact${queue.length === 1 ? '' : 's'}, stalest first.`}
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 3fr) minmax(240px, 2fr)', gap: 'var(--s-xl)', alignItems: 'start' }}>
        {done ? (
          <Card>
            <h2 style={{ margin: 0 }}>Call list finished</h2>
            <p className="muted" style={{ marginBottom: 0 }}>
              {`${calledIds.length} call${calledIds.length === 1 ? '' : 's'} logged — grades updated (+10 each).`}
            </p>
            <div style={{ marginTop: 'var(--s-lg)' }}>
              <Button title="Done" onClick={() => back(fallback)} />
            </div>
          </Card>
        ) : current ? (
          <Card>
            <SectionLabel>{`Call ${index + 1} of ${queue.length}`}</SectionLabel>
            <button
              type="button"
              onClick={() => navigate(`/contacts/${current.contact.id}`)}
              style={{ marginTop: 'var(--s-xs)', padding: 0, border: 'none', background: 'none', font: 'inherit', color: 'inherit', cursor: 'pointer', textAlign: 'left' }}
            >
              <h1 style={{ margin: 0 }}>{name(current)}</h1>
            </button>
            <div className="muted">{current.address}</div>
            <div style={{ marginTop: 'var(--s-sm)' }}>
              <GradeBadge grade={gradeFor(current.contact.id)} variant="pill" />
            </div>
            <div className="muted small" style={{ marginTop: 'var(--s-sm)' }}>
              {`Last touch: ${describeFreshness(gradeFor(current.contact.id).freshnessDays)}`}
              {current.contact.premises[0] ? ` · Premise: ${current.contact.premises[0].label}` : ''}
              {current.contact.whereMet ? ` · Met at ${current.contact.whereMet.placeName}` : ''}
            </div>

            <div className="row wrap" style={{ marginTop: 'var(--s-lg)' }}>
              <Button
                title="Call now"
                icon={<Phone size={16} />}
                onClick={() => void dial(current).catch((e: unknown) => notify('Could not dial', String(e)))}
              />
              <Button title="Log call & next" variant="secondary" onClick={() => void logAndNext()} />
              <Button title="Skip" variant="ghost" onClick={() => setIndex((i) => i + 1)} />
            </div>
          </Card>
        ) : (
          <div className="empty card">No contacts with phone numbers.</div>
        )}

        {/* Upcoming queue */}
        {upcoming.length > 0 ? (
          <div>
            <SectionLabel style={{ marginBottom: 'var(--s-sm)' }}>Up next</SectionLabel>
            <div className="card" style={{ padding: 'var(--s-xs)' }}>
              {upcoming.map((t, i) => (
                <button
                  key={t.contact.id}
                  type="button"
                  className="list-row"
                  onClick={() => navigate(`/contacts/${t.contact.id}`)}
                  style={{
                    border: 'none',
                    borderTop: i === 0 ? 'none' : '1px solid var(--border)',
                    borderRadius: 0,
                    background: 'transparent',
                    font: 'inherit',
                    color: 'inherit',
                    textAlign: 'left',
                    width: '100%',
                  }}
                >
                  <GradeBadge grade={gradeFor(t.contact.id)} variant="dot" />
                  <span className="grow ellipsis">{name(t)}</span>
                  <span className="muted small">{describeFreshness(gradeFor(t.contact.id).freshnessDays)}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </Page>
  );
}
