// src/screens/contacts/ContactEditScreen.tsx
// Add/edit contact — mirrors the phone's app/(app)/contact/edit.tsx.
// `/contact/new` creates (with `?me=1` it also becomes the user's own card,
// as from the ME tab's "Create my card"); `/contact/:id/edit` edits. Editors
// for names, phones/emails, where-met, premises (kind + label + tags), notes
// and favorite. The phone's location-based where-met prefill (expo-location)
// is phone-only and skipped here.

import React, { useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { useContacts } from '@legend/features/contacts/ContactsContext';
import {
  PREMISE_KINDS,
  type Contact,
  type ContactInput,
  type EmailEntry,
  type PhoneEntry,
  type Premise,
  type PremiseKind,
} from '@legend/features/contacts/types';
import { confirm, notify } from '@legend/lib/notify';
import { useAppSettings } from '@legend/features/settings/AppSettingsContext';
import { BackButton, matchPath, useRouter } from '../../app/router';
import { Avatar, Button, Card, Chip, IconButton, Page, SectionLabel, TextField, Toggle } from '../../ui/components';

interface PremiseDraft {
  id: string;
  kind: PremiseKind;
  label: string;
  tagsText: string;
}

export default function ContactEditScreen() {
  const { route } = useRouter();
  const { loading, contactById } = useContacts();
  const id = matchPath('/contact/:id/edit', route.path)?.id;

  if (id) {
    const existing = contactById(id);
    if (!existing) {
      return (
        <Page title="Edit Contact" narrow back={<BackButton fallback="/contacts" />}>
          <div className="empty">{loading ? 'Loading…' : 'This contact no longer exists.'}</div>
        </Page>
      );
    }
    // Keyed so the form re-seeds if the route switches to another contact.
    return <ContactForm key={existing.id} existing={existing} asMe={false} />;
  }
  return <ContactForm key="new" asMe={route.query.me === '1'} />;
}

function ContactForm({ existing, asMe }: { existing?: Contact; asMe: boolean }) {
  const { navigate, back } = useRouter();
  const { createContact, updateContact, deleteContact } = useContacts();
  const { setMeContactId } = useAppSettings();

  const [firstName, setFirstName] = useState(existing?.firstName ?? '');
  const [lastName, setLastName] = useState(existing?.lastName ?? '');
  const [nickname, setNickname] = useState(existing?.nickname ?? '');
  const [company, setCompany] = useState(existing?.company ?? '');
  const [title, setTitle] = useState(existing?.title ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [favorite, setFavorite] = useState(existing?.favorite ?? false);
  const [phones, setPhones] = useState<PhoneEntry[]>(
    existing?.phones.length ? existing.phones : [{ label: 'mobile', number: '' }],
  );
  const [emails, setEmails] = useState<EmailEntry[]>(
    existing?.emails.length ? existing.emails : [{ label: 'work', address: '' }],
  );
  const [metPlace, setMetPlace] = useState(existing?.whereMet?.placeName ?? '');
  const [metCity, setMetCity] = useState(existing?.whereMet?.city ?? '');
  const [metNote, setMetNote] = useState(existing?.whereMet?.note ?? '');
  const [premises, setPremises] = useState<PremiseDraft[]>(
    (existing?.premises ?? []).map((p) => ({
      id: p.id,
      kind: p.kind,
      label: p.label,
      tagsText: p.tags.join(', '),
    })),
  );
  const [saving, setSaving] = useState(false);

  const done = (contactId?: string) => {
    if (existing) back(`/contacts/${existing.id}`);
    else if (contactId) navigate(`/contacts/${contactId}`);
    else back('/contacts');
  };

  const save = async () => {
    if (!firstName.trim() && !lastName.trim()) {
      notify('Name required', 'Give the contact at least a first or last name.');
      return;
    }
    const input: ContactInput = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      nickname: nickname.trim() || undefined,
      company: company.trim() || undefined,
      title: title.trim() || undefined,
      phones: phones.filter((p) => p.number.trim() !== ''),
      emails: emails.filter((e) => e.address.trim() !== ''),
      avatarUrl: existing?.avatarUrl ?? null,
      whereMet: metPlace.trim()
        ? { placeName: metPlace.trim(), city: metCity.trim() || undefined, note: metNote.trim() || undefined }
        : null,
      premises: premises
        .filter((p) => p.label.trim() !== '')
        .map<Premise>((p) => ({
          id: p.id,
          kind: p.kind,
          label: p.label.trim(),
          tags: p.tagsText
            .split(',')
            .map((t) => t.trim().toLowerCase())
            .filter(Boolean),
        })),
      notes: notes.trim() || undefined,
      favorite,
      source: existing?.source ?? 'manual',
    };
    setSaving(true);
    try {
      if (existing) {
        await updateContact(existing.id, input);
        done();
      } else {
        const created = await createContact(input);
        // Arrived via the ME tab's "Create my card" → designate as me.
        if (asMe) setMeContactId(created.id);
        done(created.id);
      }
    } catch (e) {
      notify('Save failed', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = () => {
    if (!existing) return;
    const name = `${existing.firstName} ${existing.lastName}`.trim() || 'This contact';
    confirm(
      'Delete contact?',
      `${name} and their interaction history will be removed from Legend.\n\n` +
        `Legend never touches other sources: if ${existing.firstName || 'they'} is also in your phone's contacts ` +
        `or another synced source you import from, remove them there too or they may come back on the next import.`,
      () => {
        void deleteContact(existing.id)
          .then(() => navigate('/contacts'))
          .catch((e) => notify('Delete failed', e instanceof Error ? e.message : String(e)));
      },
    );
  };

  const updatePhone = (i: number, patch: Partial<PhoneEntry>) =>
    setPhones((prev) => prev.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const updateEmail = (i: number, patch: Partial<EmailEntry>) =>
    setEmails((prev) => prev.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const updatePremise = (i: number, patch: Partial<PremiseDraft>) =>
    setPremises((prev) => prev.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const displayName = `${firstName} ${lastName}`.trim();
  const removeIcon = (label: string, onClick: () => void) => (
    <IconButton label={label} onClick={onClick} style={{ color: 'var(--danger)', marginTop: 4 }}>
      <X size={18} />
    </IconButton>
  );

  return (
    <Page
      title={existing ? 'Edit Contact' : asMe ? 'Create My Card' : 'New Contact'}
      back={<BackButton fallback={existing ? `/contacts/${existing.id}` : '/contacts'} />}
      actions={
        <div className="row">
          <Button title="Cancel" variant="ghost" onClick={() => done()} />
          <Button title={existing ? 'Save changes' : 'Add contact'} loading={saving} onClick={() => void save()} />
        </div>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
          gap: 'var(--s-lg)',
          alignItems: 'start',
        }}
      >
        {/* Left column: identity + contact info */}
        <div className="stack">
          <Card>
            <div className="row" style={{ marginBottom: 'var(--s-md)' }}>
              <Avatar uri={existing?.avatarUrl} name={displayName || nickname} size={56} />
              <div className="grow">
                <div style={{ fontWeight: 600 }}>{displayName || nickname || 'Unnamed contact'}</div>
                {company || title ? (
                  <div className="muted small">{[title, company].filter(Boolean).join(' · ')}</div>
                ) : null}
              </div>
              <label className="row small" style={{ cursor: 'pointer' }}>
                <span className="muted">Favorite</span>
                <Toggle on={favorite} onChange={setFavorite} label="Favorite" />
              </label>
            </div>
            <div className="row" style={{ alignItems: 'flex-start', gap: 'var(--s-md)' }}>
              <div className="grow">
                <TextField label="First name" value={firstName} onChange={(e) => setFirstName(e.target.value)} autoFocus={!existing} />
              </div>
              <div className="grow">
                <TextField label="Last name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </div>
            </div>
            <TextField label="Nickname" value={nickname} onChange={(e) => setNickname(e.target.value)} />
            <div className="row" style={{ alignItems: 'flex-start', gap: 'var(--s-md)' }}>
              <div className="grow">
                <TextField label="Company" value={company} onChange={(e) => setCompany(e.target.value)} />
              </div>
              <div className="grow">
                <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
            </div>
          </Card>

          <Card>
            <SectionLabel style={{ marginBottom: 'var(--s-sm)' }}>Phones</SectionLabel>
            {phones.map((p, i) => (
              <div key={i} className="row" style={{ alignItems: 'flex-start' }}>
                <div style={{ width: 110 }}>
                  <TextField placeholder="label" aria-label="Phone label" value={p.label} onChange={(e) => updatePhone(i, { label: e.target.value })} />
                </div>
                <div className="grow">
                  <TextField
                    type="tel"
                    placeholder="+1 555 123 4567"
                    aria-label="Phone number"
                    value={p.number}
                    onChange={(e) => updatePhone(i, { number: e.target.value })}
                  />
                </div>
                {removeIcon('Remove phone', () => setPhones((prev) => prev.filter((_, j) => j !== i)))}
              </div>
            ))}
            <Button
              title="Add phone"
              variant="ghost"
              size="sm"
              icon={<Plus size={14} />}
              onClick={() => setPhones((prev) => [...prev, { label: 'other', number: '' }])}
            />
          </Card>

          <Card>
            <SectionLabel style={{ marginBottom: 'var(--s-sm)' }}>Emails</SectionLabel>
            {emails.map((e, i) => (
              <div key={i} className="row" style={{ alignItems: 'flex-start' }}>
                <div style={{ width: 110 }}>
                  <TextField placeholder="label" aria-label="Email label" value={e.label} onChange={(ev) => updateEmail(i, { label: ev.target.value })} />
                </div>
                <div className="grow">
                  <TextField
                    type="email"
                    placeholder="name@example.com"
                    aria-label="Email address"
                    autoCapitalize="none"
                    spellCheck={false}
                    value={e.address}
                    onChange={(ev) => updateEmail(i, { address: ev.target.value })}
                  />
                </div>
                {removeIcon('Remove email', () => setEmails((prev) => prev.filter((_, j) => j !== i)))}
              </div>
            ))}
            <Button
              title="Add email"
              variant="ghost"
              size="sm"
              icon={<Plus size={14} />}
              onClick={() => setEmails((prev) => [...prev, { label: 'other', address: '' }])}
            />
          </Card>
        </div>

        {/* Right column: context — where met, premises, notes */}
        <div className="stack">
          <Card>
            <SectionLabel style={{ marginBottom: 'var(--s-sm)' }}>Where we met</SectionLabel>
            <TextField label="Place" placeholder="e.g. Chamber of Commerce mixer" value={metPlace} onChange={(e) => setMetPlace(e.target.value)} />
            <TextField label="City" value={metCity} onChange={(e) => setMetCity(e.target.value)} />
            <TextField
              label="Note"
              placeholder="Anything worth remembering about the meeting"
              value={metNote}
              onChange={(e) => setMetNote(e.target.value)}
            />
          </Card>

          <Card>
            <SectionLabel style={{ marginBottom: 'var(--s-xs)' }}>Premises</SectionLabel>
            <div className="muted small" style={{ marginBottom: 'var(--s-sm)' }}>
              The event, topic, expertise, hobby, or interest you know them through. Tags power Circles.
            </div>
            {premises.map((p, i) => (
              <div
                key={p.id}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--r-md)',
                  padding: 'var(--s-md)',
                  marginBottom: 'var(--s-sm)',
                }}
              >
                <div className="row wrap" style={{ gap: 'var(--s-xs)', marginBottom: 'var(--s-sm)' }}>
                  {PREMISE_KINDS.map((kind) => (
                    <Chip key={kind} selected={p.kind === kind} onClick={() => updatePremise(i, { kind })}>
                      {kind}
                    </Chip>
                  ))}
                </div>
                <TextField
                  placeholder='Label — e.g. "real estate investing"'
                  aria-label="Premise label"
                  value={p.label}
                  onChange={(e) => updatePremise(i, { label: e.target.value })}
                />
                <TextField
                  placeholder="Tags, comma-separated — e.g. real-estate, investing"
                  aria-label="Premise tags"
                  autoCapitalize="none"
                  value={p.tagsText}
                  onChange={(e) => updatePremise(i, { tagsText: e.target.value })}
                />
                <Button
                  title="Remove premise"
                  variant="ghost"
                  size="sm"
                  onClick={() => setPremises((prev) => prev.filter((_, j) => j !== i))}
                />
              </div>
            ))}
            <Button
              title="Add premise"
              variant="secondary"
              size="sm"
              icon={<Plus size={14} />}
              onClick={() =>
                setPremises((prev) => [...prev, { id: crypto.randomUUID(), kind: 'topic', label: '', tagsText: '' }])
              }
            />
          </Card>

          <Card>
            <TextField label="Notes" multiline rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Card>

          <div className="row">
            <Button title={existing ? 'Save changes' : 'Add contact'} type="submit" loading={saving} />
            <Button title="Cancel" variant="ghost" onClick={() => done()} />
            <span className="grow" />
            {existing ? (
              <Button title="Delete contact" variant="danger" icon={<Trash2 size={14} />} onClick={remove} />
            ) : null}
          </div>
        </div>
      </form>
    </Page>
  );
}
