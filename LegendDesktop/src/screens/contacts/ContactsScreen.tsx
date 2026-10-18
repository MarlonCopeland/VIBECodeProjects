// src/screens/contacts/ContactsScreen.tsx
// The Contacts tab as a desktop master/detail: the phone's alphabetized list
// (app/(app)/(tabs)/index.tsx — search, All/Recent, sort + tier/favorite
// filters, A–Z rail, quick channel actions) on the left, and the selected
// contact (app/(app)/contact/[id].tsx) on the right. Routes: /contacts and
// /contacts/:id.

import React, { useMemo, useRef, useState } from 'react';
import { Filter, Mail, MessageSquare, Phone, Plus, Star, UserPlus, FileDown } from 'lucide-react';
import { useContacts, type GradedContact } from '@legend/features/contacts/ContactsContext';
import { describeFreshness, type TierId } from '@legend/features/contacts/grading';
import { useAppSettings, type ContactsDefaultView } from '@legend/features/settings/AppSettingsContext';
import type { Contact } from '@legend/features/contacts/types';
import { matchPath, useRouter } from '../../app/router';
import { GradeBadge, IconButton, Modal, Segmented } from '../../ui/components';
import { openExternal } from '../../platform/bridge';
import { ContactDetail } from './ContactDetail';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ#'.split('');

interface Section {
  title: string;
  data: GradedContact[];
}

function sortName(gc: GradedContact): string {
  const c = gc.contact;
  return (c.lastName || c.firstName || '').trim();
}

function sectionLetter(gc: GradedContact): string {
  const ch = sortName(gc).charAt(0).toUpperCase();
  return ch >= 'A' && ch <= 'Z' ? ch : '#';
}

type SortMode = 'name' | 'grade' | 'stalest' | 'newest';

const SORT_OPTIONS: { id: SortMode; label: string }[] = [
  { id: 'name', label: 'Name' },
  { id: 'grade', label: 'Grade' },
  { id: 'stalest', label: 'Stalest' },
  { id: 'newest', label: 'Newest' },
];

function compareBy(mode: SortMode, a: GradedContact, b: GradedContact): number {
  switch (mode) {
    case 'grade':
      return b.grade.score - a.grade.score || sortName(a).localeCompare(sortName(b));
    case 'stalest': {
      const fa = a.grade.freshnessDays ?? Number.POSITIVE_INFINITY;
      const fb = b.grade.freshnessDays ?? Number.POSITIVE_INFINITY;
      return fb - fa || sortName(a).localeCompare(sortName(b));
    }
    case 'newest':
      // createdAt is an HLC stamp or ISO — both sort correctly as strings.
      return b.contact.createdAt.localeCompare(a.contact.createdAt);
    default:
      return sortName(a).localeCompare(sortName(b));
  }
}

export default function ContactsScreen() {
  const { route, navigate } = useRouter();
  const selectedId = matchPath('/contacts/:id', route.path)?.id ?? null;
  const { graded, loading, logInteraction, knowsFor } = useContacts();
  const { meContactId, contactsDefaultView, gradingConfig } = useAppSettings();
  const [viewOverride, setViewOverride] = useState<ContactsDefaultView | null>(null);
  const view = viewOverride ?? contactsDefaultView;
  const [query, setQuery] = useState('');
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [sortBy, setSortBy] = useState<SortMode>('name');
  const [tierFilter, setTierFilter] = useState<ReadonlySet<TierId>>(new Set());
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const sectionRefs = useRef(new Map<string, HTMLDivElement>());

  const filtersActive = sortBy !== 'name' || tierFilter.size > 0 || favoritesOnly;

  const toggleTier = (id: TierId) =>
    setTierFilter((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const sections = useMemo<Section[]>(() => {
    const q = query.trim().toLowerCase();
    let filtered = q
      ? graded.filter(({ contact: c }) => {
          const hay = [
            c.firstName,
            c.lastName,
            c.nickname ?? '',
            c.company ?? '',
            c.title ?? '',
            c.whereMet?.placeName ?? '',
            ...c.premises.flatMap((p) => [p.label, ...p.tags]),
          ]
            .join(' ')
            .toLowerCase();
          return hay.includes(q);
        })
      : graded;
    if (tierFilter.size > 0) filtered = filtered.filter((gc) => tierFilter.has(gc.grade.tier.id));
    if (favoritesOnly) filtered = filtered.filter((gc) => gc.contact.favorite);

    if (view === 'recent') {
      return [
        {
          title: '',
          data: [...filtered].sort((a, b) => {
            const fa = a.grade.freshnessDays ?? Number.POSITIVE_INFINITY;
            const fb = b.grade.freshnessDays ?? Number.POSITIVE_INFINITY;
            return fa - fb || b.grade.score - a.grade.score;
          }),
        },
      ];
    }
    if (sortBy !== 'name') {
      return [{ title: '', data: [...filtered].sort((a, b) => compareBy(sortBy, a, b)) }];
    }
    const buckets = new Map<string, GradedContact[]>();
    for (const gc of filtered) {
      const letter = sectionLetter(gc);
      const list = buckets.get(letter);
      if (list) list.push(gc);
      else buckets.set(letter, [gc]);
    }
    return [...buckets.entries()]
      .sort(([a], [b]) => (a === '#' ? 1 : b === '#' ? -1 : a.localeCompare(b)))
      .map(([title, data]) => ({
        title,
        data: data.sort(
          (x, y) => sortName(x).localeCompare(sortName(y)) || x.contact.firstName.localeCompare(y.contact.firstName),
        ),
      }));
  }, [graded, query, sortBy, tierFilter, favoritesOnly, view]);

  const rowAct = (c: Contact, kind: 'call' | 'text' | 'email') => {
    const address = kind === 'email' ? c.emails[0]?.address : c.phones[0]?.number;
    if (!address) return;
    const scheme = kind === 'call' ? 'tel' : kind === 'text' ? 'sms' : 'mailto';
    void openExternal(`${scheme}:${encodeURIComponent(address)}`)
      .then((ok) => (ok ? logInteraction({ contactId: c.id, kind }) : undefined))
      .catch(() => undefined);
  };

  const jumpTo = (letter: string) => {
    sectionRefs.current.get(letter)?.scrollIntoView({ block: 'start' });
  };

  const showRail = sortBy === 'name' && view === 'all';

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 380px) 1fr', height: '100%', minHeight: 0 }}>
      <Modal open={addMenuOpen} title="Add contacts" onClose={() => setAddMenuOpen(false)} width={420}>
        <div className="stack" style={{ gap: 4 }}>
          <button
            type="button"
            className="list-row"
            onClick={() => {
              setAddMenuOpen(false);
              navigate('/contact/new');
            }}
          >
            <UserPlus size={18} />
            <div className="grow">
              <div>New contact</div>
            </div>
          </button>
          <button
            type="button"
            className="list-row"
            onClick={() => {
              setAddMenuOpen(false);
              navigate('/import');
            }}
          >
            <FileDown size={18} />
            <div className="grow">
              <div>Import from CSV</div>
              <div className="small muted">Pick a .csv file in Legend’s format (or Google/Outlook exports)</div>
            </div>
          </button>
          <div className="small muted" style={{ padding: '8px 12px' }}>
            Phone-book import lives in the Legend phone app — with Legend Sync on, those contacts appear here too.
          </div>
        </div>
      </Modal>

      {/* ---- master: the list ---------------------------------------- */}
      <section
        aria-label="Contacts"
        style={{ borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', minHeight: 0 }}
      >
        <div style={{ padding: 'var(--s-lg) var(--s-lg) var(--s-sm)' }}>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 'var(--s-md)' }}>
            <div className="row" style={{ gap: 'var(--s-md)' }}>
              <h1 style={{ margin: 0, fontSize: 'var(--fs-xl)' }}>Contacts</h1>
              <Segmented<ContactsDefaultView>
                value={view}
                onChange={setViewOverride}
                options={[
                  { id: 'all', label: 'All' },
                  { id: 'recent', label: 'Recent' },
                ]}
              />
            </div>
            <button
              type="button"
              className="btn btn-primary"
              style={{ width: 34, height: 34, padding: 0, borderRadius: '50%' }}
              aria-label="Add or import contacts"
              title="Add or import contacts"
              onClick={() => setAddMenuOpen(true)}
            >
              <Plus size={20} />
            </button>
          </div>
          <div className="row">
            <input
              className="input"
              placeholder="Search name, company, premise, tag…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              spellCheck={false}
            />
            <button
              type="button"
              className="icon-btn"
              aria-label="Sort and filter"
              aria-pressed={panelOpen || filtersActive}
              title="Sort and filter"
              onClick={() => setPanelOpen((v) => !v)}
              style={{
                width: 38,
                height: 38,
                border: `1px solid ${panelOpen || filtersActive ? 'var(--primary)' : 'var(--border-strong)'}`,
                color: panelOpen || filtersActive ? 'var(--primary)' : undefined,
              }}
            >
              <Filter size={16} fill={filtersActive ? 'currentColor' : 'none'} />
            </button>
          </div>

          {panelOpen ? (
            <div className="stack" style={{ gap: 'var(--s-sm)', paddingTop: 'var(--s-sm)' }}>
              <div className="row wrap">
                <span className="small muted">Sort</span>
                {SORT_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    className={`chip${sortBy === opt.id ? ' selected' : ''}`}
                    aria-pressed={sortBy === opt.id}
                    onClick={() => setSortBy(opt.id)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <div className="row wrap">
                <span className="small muted">Show</span>
                {gradingConfig.tiers.map((tier) => {
                  const active = tierFilter.has(tier.id);
                  return (
                    <button
                      key={tier.id}
                      type="button"
                      className="chip"
                      aria-pressed={active}
                      onClick={() => toggleTier(tier.id)}
                      style={{
                        borderColor: active ? tier.color : undefined,
                        background: active ? `${tier.color}22` : 'transparent',
                      }}
                    >
                      <span className="grade-dot" style={{ width: 8, height: 8, background: tier.color }} />
                      {tier.label}
                    </button>
                  );
                })}
                <button
                  type="button"
                  className={`chip${favoritesOnly ? ' selected' : ''}`}
                  aria-pressed={favoritesOnly}
                  onClick={() => setFavoritesOnly((v) => !v)}
                >
                  <Star size={10} fill="currentColor" /> Favorites
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 var(--s-sm) var(--s-xl)' }}>
            {sections.length === 0 || sections.every((s) => s.data.length === 0) ? (
              <div className="empty">
                {loading
                  ? 'Loading your network…'
                  : query
                    ? 'No contacts match that search.'
                    : 'No contacts yet — add one or import a CSV.'}
              </div>
            ) : (
              sections.map((section) => (
                <div
                  key={section.title || 'all'}
                  ref={(el) => {
                    if (el) sectionRefs.current.set(section.title, el);
                    else sectionRefs.current.delete(section.title);
                  }}
                >
                  {section.title ? (
                    <div
                      className="label"
                      style={{ position: 'sticky', top: 0, background: 'var(--bg)', padding: '4px 12px', zIndex: 1 }}
                    >
                      {section.title}
                    </div>
                  ) : null}
                  {section.data.map((item) => {
                    const c = item.contact;
                    const name = `${c.firstName} ${c.lastName}`.trim() || c.nickname || 'Unnamed';
                    const premise = c.premises[0]?.label;
                    const sub = [c.company, premise ? `· ${premise}` : ''].filter(Boolean).join(' ');
                    const pending = knowsFor(c.id).suggested.length;
                    return (
                      <div
                        key={c.id}
                        role="button"
                        tabIndex={0}
                        className={`list-row${selectedId === c.id ? ' active' : ''}`}
                        onClick={() => navigate(`/contacts/${c.id}`)}
                        onKeyDown={(e) => e.key === 'Enter' && navigate(`/contacts/${c.id}`)}
                      >
                        <GradeBadge grade={item.grade} variant="dot" />
                        <div className="grow">
                          <div className="row" style={{ gap: 6 }}>
                            <span className="ellipsis" style={{ fontWeight: 600 }}>{name}</span>
                            {c.favorite ? <Star size={11} fill="var(--warning)" color="var(--warning)" /> : null}
                            {c.id === meContactId ? (
                              <span className="grade-pill" style={{ background: 'var(--primary)', color: 'var(--on-primary)', fontSize: 9, padding: '0 6px' }}>
                                ME
                              </span>
                            ) : null}
                            {pending ? (
                              <span
                                className="grade-pill"
                                title="Possible Knows Connection matches to review"
                                style={{ background: 'color-mix(in srgb, var(--warning) 25%, transparent)', color: 'var(--warning)', fontSize: 10, padding: '0 6px' }}
                              >
                                {pending} match{pending === 1 ? '' : 'es'}
                              </span>
                            ) : null}
                          </div>
                          {sub ? <div className="small muted ellipsis">{sub}</div> : null}
                        </div>
                        {view === 'recent' ? (
                          <div className="row" style={{ gap: 2 }} onClick={(e) => e.stopPropagation()}>
                            <span className="small muted" style={{ marginRight: 4 }}>
                              {describeFreshness(item.grade.freshnessDays)}
                            </span>
                            <IconButton label={`Call ${name}`} disabled={c.phones.length === 0} onClick={() => rowAct(c, 'call')}>
                              <Phone size={14} />
                            </IconButton>
                            <IconButton label={`Text ${name}`} disabled={c.phones.length === 0} onClick={() => rowAct(c, 'text')}>
                              <MessageSquare size={14} />
                            </IconButton>
                            <IconButton label={`Email ${name}`} disabled={c.emails.length === 0} onClick={() => rowAct(c, 'email')}>
                              <Mail size={14} />
                            </IconButton>
                          </div>
                        ) : (
                          <span className="small muted">{describeFreshness(item.grade.freshnessDays)}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>

          {showRail ? (
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 4px' }}>
              {ALPHABET.map((letter) => {
                const has = sections.some((s) => s.title === letter);
                return (
                  <button
                    key={letter}
                    type="button"
                    aria-label={`Jump to ${letter}`}
                    onClick={() => jumpTo(letter)}
                    style={{
                      border: 0,
                      background: 'none',
                      padding: 0,
                      fontSize: 10,
                      lineHeight: '14px',
                      cursor: has ? 'pointer' : 'default',
                      color: has ? 'var(--primary)' : 'var(--text-muted)',
                    }}
                  >
                    {letter}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      </section>

      {/* ---- detail ------------------------------------------------------ */}
      <section aria-label="Contact detail" style={{ minHeight: 0, overflowY: 'auto' }}>
        {selectedId ? (
          <ContactDetail key={selectedId} contactId={selectedId} />
        ) : (
          <div className="empty" style={{ marginTop: '20vh' }}>
            <div style={{ fontSize: 'var(--fs-lg)', marginBottom: 8 }}>Select a contact</div>
            <div className="small">Their grade, premises, Knows Connections and history show here.</div>
          </div>
        )}
      </section>
    </div>
  );
}
