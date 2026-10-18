// src/screens/circles/CircleEditScreen.tsx
// Circle builder. Pick premise kinds, tags (from your network's existing tags
// plus free entry), and free text — with a live preview of who matches while
// you edit. Mirrors the phone's app/(app)/circle/edit.tsx; `/circle/new`
// creates, `/circle/:id/edit` edits. Desktop puts the form and the live match
// preview side by side.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useContacts } from '@legend/features/contacts/ContactsContext';
import { collectTags, matchCircle } from '@legend/features/circles/circlesService';
import { PREMISE_KINDS, type Circle, type PremiseKind } from '@legend/features/contacts/types';
import { notify, confirm } from '@legend/lib/notify';
import { BackButton, matchPath, useRouter } from '../../app/router';
import { Button, Card, Chip, GradeBadge, Page, SectionLabel, TextField } from '../../ui/components';

const PREVIEW_LIMIT = 12;

export default function CircleEditScreen() {
  const { route, back, replace } = useRouter();
  const id = matchPath('/circle/:id/edit', route.path)?.id;
  const { circles, contacts, gradeFor, createCircle, updateCircle, deleteCircle } = useContacts();

  const existing = id ? circles.find((c) => c.id === id) : undefined;

  const [name, setName] = useState(existing?.name ?? '');
  const [kinds, setKinds] = useState<PremiseKind[]>(existing?.query.kinds ?? []);
  const [tags, setTags] = useState<string[]>(existing?.query.tags ?? []);
  const [tagEntry, setTagEntry] = useState('');
  const [text, setText] = useState(existing?.query.text ?? '');
  const [saving, setSaving] = useState(false);

  // Deep-linking straight here can render before circles load — fill the
  // form once the circle shows up.
  const hydrated = useRef(Boolean(existing));
  useEffect(() => {
    if (hydrated.current || !existing) return;
    hydrated.current = true;
    setName(existing.name);
    setKinds(existing.query.kinds);
    setTags(existing.query.tags);
    setText(existing.query.text ?? '');
  }, [existing]);

  const networkTags = useMemo(() => collectTags(contacts), [contacts]);

  const draft: Circle = useMemo(
    () => ({
      id: existing?.id ?? 'draft',
      ownerId: existing?.ownerId ?? 'draft',
      name,
      query: { kinds, tags, text: text.trim() || undefined },
      pinnedContactIds: existing?.pinnedContactIds ?? [],
      excludedContactIds: existing?.excludedContactIds ?? [],
      createdAt: existing?.createdAt ?? '',
      updatedAt: existing?.updatedAt ?? '',
    }),
    [existing, name, kinds, tags, text],
  );
  const preview = useMemo(() => matchCircle(draft, contacts, gradeFor), [draft, contacts, gradeFor]);

  const toggleTag = (tag: string) =>
    setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));

  const addTagEntry = () => {
    const cleaned = tagEntry
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    if (cleaned.length) setTags((prev) => [...new Set([...prev, ...cleaned])]);
    setTagEntry('');
  };

  const leave = () => back(existing ? `/circle/${existing.id}` : '/circles');

  const save = async () => {
    if (!name.trim()) {
      notify('Name required', 'Give the circle a name.');
      return;
    }
    setSaving(true);
    try {
      const input = {
        name: name.trim(),
        query: { kinds, tags, text: text.trim() || undefined },
      };
      if (existing) await updateCircle(existing.id, input);
      else await createCircle(input);
      leave();
    } catch (e) {
      notify('Save failed', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = () => {
    if (!existing) return;
    confirm('Delete circle?', `"${existing.name}" will be removed. Contacts are untouched.`, () => {
      // The detail page we came from no longer exists — land on the list.
      void deleteCircle(existing.id).then(() => replace('/circles'));
    });
  };

  if (id && !existing && circles.length > 0) {
    return (
      <Page title="Edit Circle" back={<BackButton fallback="/circles" />} narrow>
        <div className="empty">Circle not found.</div>
      </Page>
    );
  }

  return (
    <Page
      title={existing ? 'Edit Circle' : 'New Circle'}
      back={<BackButton fallback={existing ? `/circle/${existing.id}` : '/circles'} />}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 3fr) minmax(280px, 2fr)', gap: 'var(--s-xl)', alignItems: 'start' }}>
        {/* Form */}
        <div className="stack">
          <TextField
            label="Circle name"
            placeholder='e.g. "Real Estate People"'
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus={!existing}
          />

          <div>
            <SectionLabel style={{ marginBottom: 'var(--s-sm)' }}>Premise kinds</SectionLabel>
            <div className="row wrap">
              {PREMISE_KINDS.map((kind) => (
                <Chip
                  key={kind}
                  selected={kinds.includes(kind)}
                  onClick={() =>
                    setKinds((prev) => (prev.includes(kind) ? prev.filter((k) => k !== kind) : [...prev, kind]))
                  }
                >
                  {kind}
                </Chip>
              ))}
            </div>
          </div>

          <div>
            <SectionLabel style={{ marginBottom: 'var(--s-sm)' }}>Tags</SectionLabel>
            {networkTags.length > 0 || tags.length > 0 ? (
              <div className="row wrap" style={{ marginBottom: 'var(--s-sm)' }}>
                {networkTags.slice(0, 20).map((tag) => (
                  <Chip key={tag} selected={tags.includes(tag)} onClick={() => toggleTag(tag)}>
                    {`#${tag}`}
                  </Chip>
                ))}
                {tags
                  .filter((t) => !networkTags.slice(0, 20).includes(t))
                  .map((tag) => (
                    <Chip key={`own-${tag}`} selected onClick={() => toggleTag(tag)}>
                      {`#${tag}`}
                    </Chip>
                  ))}
              </div>
            ) : null}
            <div className="row" style={{ alignItems: 'flex-start' }}>
              <div className="grow">
                <TextField
                  placeholder="Add tags, comma-separated"
                  autoCapitalize="none"
                  value={tagEntry}
                  onChange={(e) => setTagEntry(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addTagEntry();
                    }
                  }}
                />
              </div>
              <Button title="Add" variant="secondary" onClick={addTagEntry} />
            </div>
          </div>

          <TextField
            label="Free text"
            placeholder="Matches premise labels, company, title, where met"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />

          <div className="row wrap" style={{ marginTop: 'var(--s-sm)' }}>
            <Button title={existing ? 'Save circle' : 'Create circle'} loading={saving} onClick={() => void save()} />
            <Button title="Cancel" variant="ghost" onClick={leave} />
            <span className="grow" />
            {existing ? <Button title="Delete circle" variant="danger" onClick={remove} /> : null}
          </div>
        </div>

        {/* Live preview */}
        <Card style={{ position: 'sticky', top: 0 }}>
          <SectionLabel>{`Live preview — ${preview.length} match${preview.length === 1 ? '' : 'es'}`}</SectionLabel>
          <div className="stack" style={{ marginTop: 'var(--s-sm)', gap: 'var(--s-xs)' }}>
            {preview.slice(0, PREVIEW_LIMIT).map((m) => (
              <div key={m.contact.id} className="row" style={{ padding: '4px 0' }}>
                <GradeBadge grade={m.grade} variant="dot" />
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="ellipsis" style={{ fontWeight: 600 }}>
                    {`${m.contact.firstName} ${m.contact.lastName}`.trim()}
                  </div>
                  <div className="muted small ellipsis">{m.reasons.join(', ')}</div>
                </div>
              </div>
            ))}
            {preview.length > PREVIEW_LIMIT ? (
              <span className="muted small">{`…and ${preview.length - PREVIEW_LIMIT} more`}</span>
            ) : null}
            {preview.length === 0 ? (
              <span className="muted small">No matches yet — pick tags or kinds that exist on your contacts.</span>
            ) : null}
          </div>
        </Card>
      </div>
    </Page>
  );
}
