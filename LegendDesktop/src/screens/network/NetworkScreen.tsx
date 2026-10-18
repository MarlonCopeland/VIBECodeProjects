// src/screens/network/NetworkScreen.tsx
// Desktop-only: your network in 3D. Every contact is a node (tier color,
// sized by grade), every distinct premise is a hub shared by everyone who
// has it, and Knows Connections link people directly. Click a node and its
// surrounding premises / connections come into focus; the side panel lists
// them so you can hop node to node. /network?focus=<contactId> opens with a
// contact already focused (from "Show in network" on a contact).

import React, { useEffect, useMemo, useState } from 'react';
import { Crosshair, ExternalLink, Pause, Play, Search, X } from 'lucide-react';
import { useAuth } from '@legend/features/auth/AuthContext';
import { useContacts } from '@legend/features/contacts/ContactsContext';
import { useAppSettings } from '@legend/features/settings/AppSettingsContext';
import { knowsEdges } from '@legend/features/contacts/knows';
import { PREMISE_KINDS } from '@legend/features/contacts/types';
import { useRouter } from '../../app/router';
import { useDesktopTheme } from '../../app/theme';
import { Button, GradeBadge, IconButton, Toggle } from '../../ui/components';
import { NetworkGraph3D } from '../../network/NetworkGraph3D';
import {
  PREMISE_COLORS,
  YOU_COLOR,
  buildNetworkGraph,
  contactNodeId,
  summarizeFocus,
  type NetNode,
} from '../../network/graphModel';

export default function NetworkScreen() {
  const { route, navigate, replace } = useRouter();
  const { user } = useAuth();
  const { contacts, gradeFor, resolvedKnows, loading } = useContacts();
  const { meContactId, gradingConfig } = useAppSettings();
  const { resolved: theme } = useDesktopTheme();

  const [showPremises, setShowPremises] = useState(true);
  const [showKnows, setShowKnows] = useState(true);
  const [showYou, setShowYou] = useState(true);
  const [autoRotate, setAutoRotate] = useState(true);
  const [query, setQuery] = useState('');

  const focusParam = route.query.focus;
  const [focusId, setFocusId] = useState<string | null>(focusParam ? contactNodeId(focusParam) : null);

  useEffect(() => {
    if (focusParam) setFocusId(contactNodeId(focusParam));
  }, [focusParam]);

  const graph = useMemo(
    () =>
      buildNetworkGraph(contacts, gradeFor, knowsEdges(resolvedKnows), {
        showPremises,
        showKnows,
        showYou,
        youLabel: user?.displayName || 'You',
        meContactId,
      }),
    [contacts, gradeFor, resolvedKnows, showPremises, showKnows, showYou, user?.displayName, meContactId],
  );

  const byId = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph]);
  const focused = focusId ? byId.get(focusId) : undefined;
  const summary = useMemo(() => (focusId ? summarizeFocus(graph, focusId) : null), [graph, focusId]);

  // Drop a focus whose node was filtered out (e.g. premises toggled off).
  useEffect(() => {
    if (focusId && !byId.has(focusId)) setFocusId(null);
  }, [focusId, byId]);

  const focus = (id: string | null) => {
    setFocusId(id);
    if (id) setAutoRotate(false);
    if (focusParam) replace('/network');
  };

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return graph.nodes.filter((n) => n.search.includes(q)).slice(0, 8);
  }, [graph, query]);

  const counts = {
    contacts: graph.nodes.filter((n) => n.contactId).length,
    premises: graph.nodes.filter((n) => n.kind === 'premise').length,
    knows: graph.links.filter((l) => l.kind === 'knows').length,
  };

  return (
    <div className="net-stage">
      <NetworkGraph3D graph={graph} focusId={focusId} onFocus={focus} theme={theme} autoRotate={autoRotate} />

      {/* ---- top-left: title, search, layers ------------------------ */}
      <div className="net-panel" style={{ top: 16, left: 16, width: 300 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h1 style={{ margin: 0, fontSize: 'var(--fs-xl)' }}>Network</h1>
          <IconButton label={autoRotate ? 'Pause rotation' : 'Rotate'} onClick={() => setAutoRotate((v) => !v)}>
            {autoRotate ? <Pause size={16} /> : <Play size={16} />}
          </IconButton>
        </div>
        <div className="small muted" style={{ marginBottom: 'var(--s-sm)' }}>
          {`${counts.contacts} people · ${counts.premises} premises · ${counts.knows} Knows Connections`}
        </div>
        <div style={{ position: 'relative' }}>
          <Search size={14} className="muted" style={{ position: 'absolute', left: 10, top: 12 }} />
          <input
            className="input"
            style={{ paddingLeft: 30 }}
            placeholder="Find a person or premise…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && results[0]) {
                focus(results[0].id);
                setQuery('');
              }
              if (e.key === 'Escape') setQuery('');
            }}
          />
          {results.length > 0 ? (
            <div className="net-results">
              {results.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  className="list-row"
                  style={{ padding: '6px 8px' }}
                  onClick={() => {
                    focus(n.id);
                    setQuery('');
                  }}
                >
                  <span className="grade-dot" style={{ background: n.color }} />
                  <div className="grow">
                    <div className="ellipsis">{n.label}</div>
                    {n.sub ? <div className="small muted ellipsis">{n.sub}</div> : null}
                  </div>
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div className="stack" style={{ gap: 6, marginTop: 'var(--s-md)' }}>
          <LayerToggle label="Premises" on={showPremises} onChange={setShowPremises} />
          <LayerToggle label="Knows Connections" on={showKnows} onChange={setShowKnows} />
          <LayerToggle label={meContactId ? 'Spokes from you' : 'You at the center'} on={showYou} onChange={setShowYou} />
        </div>
      </div>

      {/* ---- bottom-left: legend ------------------------------------ */}
      <div className="net-panel small" style={{ bottom: 16, left: 16, width: 300 }}>
        <div className="label" style={{ marginBottom: 6 }}>People by grade</div>
        <div className="row wrap" style={{ gap: 10 }}>
          {gradingConfig.tiers.map((t) => (
            <span key={t.id} className="row" style={{ gap: 4 }}>
              <span className="grade-dot" style={{ width: 9, height: 9, background: t.color }} />
              {t.label}
            </span>
          ))}
        </div>
        {showPremises ? (
          <>
            <div className="label" style={{ margin: '10px 0 6px' }}>Premises</div>
            <div className="row wrap" style={{ gap: 10 }}>
              {PREMISE_KINDS.map((k) => (
                <span key={k} className="row" style={{ gap: 4 }}>
                  <span className="grade-dot" style={{ width: 9, height: 9, background: PREMISE_COLORS[k] }} />
                  {k}
                </span>
              ))}
              <span className="row" style={{ gap: 4 }}>
                <span className="grade-dot" style={{ width: 9, height: 9, background: YOU_COLOR }} />
                you
              </span>
            </div>
          </>
        ) : null}
        <div className="muted" style={{ marginTop: 10 }}>
          Drag to orbit · scroll to zoom · click a node to focus · click empty space to reset
        </div>
      </div>

      {/* ---- right: focus panel ---------------------------------------- */}
      {focused && summary ? (
        <FocusPanel node={focused} summary={summary} onFocus={focus} onOpen={(id) => navigate(`/contacts/${id}`)} />
      ) : null}

      {!loading && contacts.length === 0 ? (
        <div className="net-panel" style={{ top: '40%', left: '50%', transform: 'translateX(-50%)', textAlign: 'center', width: 360 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Your network is empty</div>
          <div className="small muted" style={{ marginBottom: 12 }}>
            Add contacts with premises and Knows Connections, and they’ll appear here.
          </div>
          <Button title="Add contacts" onClick={() => navigate('/contacts')} />
        </div>
      ) : null}
    </div>
  );
}

function LayerToggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="row" style={{ justifyContent: 'space-between', cursor: 'pointer' }}>
      <span className="small">{label}</span>
      <Toggle on={on} onChange={onChange} label={label} />
    </label>
  );
}

function NodeRow({ node, detail, onFocus }: { node: NetNode; detail?: string; onFocus: (id: string) => void }) {
  return (
    <button type="button" className="list-row" style={{ padding: '5px 8px' }} onClick={() => onFocus(node.id)}>
      <span className="grade-dot" style={{ background: node.color }} />
      <div className="grow">
        <div className="ellipsis">{node.label}</div>
        {detail ? <div className="small muted ellipsis">{detail}</div> : null}
      </div>
      <Crosshair size={13} className="muted" />
    </button>
  );
}

function Group({ title, children, count }: { title: string; count: number; children: React.ReactNode }) {
  if (count === 0) return null;
  return (
    <div style={{ marginTop: 'var(--s-md)' }}>
      <div className="label" style={{ marginBottom: 4 }}>{`${title} (${count})`}</div>
      {children}
    </div>
  );
}

function FocusPanel({
  node,
  summary,
  onFocus,
  onOpen,
}: {
  node: NetNode;
  summary: ReturnType<typeof summarizeFocus>;
  onFocus: (id: string | null) => void;
  onOpen: (contactId: string) => void;
}) {
  return (
    <aside className="net-panel" style={{ top: 16, right: 16, bottom: 16, width: 320, display: 'flex', flexDirection: 'column' }}>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <span className="grade-dot" style={{ width: 14, height: 14, marginTop: 6, background: node.color }} />
        <div className="grow">
          <div style={{ fontWeight: 700, fontSize: 'var(--fs-lg)' }}>{node.label}</div>
          {node.sub ? <div className="small muted">{node.sub}</div> : null}
        </div>
        <IconButton label="Clear focus" onClick={() => onFocus(null)}>
          <X size={16} />
        </IconButton>
      </div>
      {node.grade ? (
        <div style={{ marginTop: 8 }}>
          <GradeBadge grade={node.grade} />
        </div>
      ) : null}
      {node.tags?.length ? <div className="small muted" style={{ marginTop: 6 }}>{`#${node.tags.join(' #')}`}</div> : null}
      {node.contactId ? (
        <Button
          size="sm"
          variant="secondary"
          title="Open contact"
          icon={<ExternalLink size={13} />}
          style={{ marginTop: 10, alignSelf: 'flex-start' }}
          onClick={() => onOpen(node.contactId!)}
        />
      ) : null}

      <div style={{ overflowY: 'auto', flex: 1, marginTop: 4 }}>
        <Group title="Knows" count={summary.knows.length}>
          {summary.knows.map((n) => (
            <NodeRow key={n.id} node={n} detail={n.sub} onFocus={onFocus} />
          ))}
        </Group>
        <Group title="Premises" count={summary.premises.length}>
          {summary.premises.map((n) => (
            <NodeRow key={n.id} node={n} detail={n.sub} onFocus={onFocus} />
          ))}
        </Group>
        <Group title="People" count={summary.people.length}>
          {summary.people.map((n) => (
            <NodeRow key={n.id} node={n} detail={n.sub} onFocus={onFocus} />
          ))}
        </Group>
        <Group title="Shares a premise with" count={summary.sharesPremise.length}>
          {summary.sharesPremise.map(({ node: n, via }) => (
            <NodeRow key={n.id} node={n} detail={`via ${via.join(', ')}`} onFocus={onFocus} />
          ))}
        </Group>
        {summary.knows.length + summary.premises.length + summary.people.length === 0 ? (
          <div className="small muted" style={{ marginTop: 'var(--s-md)' }}>
            {node.contactId
              ? 'No premises or Knows Connections yet. Open the contact to add who they know.'
              : 'Nothing connected yet.'}
          </div>
        ) : null}
      </div>
    </aside>
  );
}
