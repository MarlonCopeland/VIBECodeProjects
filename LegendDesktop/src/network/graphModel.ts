// src/network/graphModel.ts
// Turns Legend's contact graph into the node/link model the 3D map draws.
// Pure — no three.js — so it's unit-tested (test/graphModel.test.ts).
//
//   contact nodes  one per contact, colored by grade tier, sized by score
//   premise nodes  one per DISTINCT premise (same kind + same label, ignoring
//                  case/punctuation), so everyone who attended "NAACP Gala
//                  2026" hangs off one shared hub — that's what makes the
//                  network's clusters visible
//   you node       the user at the center (their "me" contact if set)
//   links          contact—premise, contact—contact (Knows Connections,
//                  strong links only), and faint you—contact spokes

import type { Contact, PremiseKind } from '@legend/features/contacts/types';
import type { Grade } from '@legend/features/contacts/grading';
import { displayNameOf, normalizeName, type KnowsEdge } from '@legend/features/contacts/knows';

export type NetNodeKind = 'you' | 'contact' | 'premise';
export type NetLinkKind = 'premise' | 'knows' | 'you';

export interface NetNode {
  id: string;
  kind: NetNodeKind;
  label: string;
  /** Secondary line: company/title for contacts, "event · 4 people" for premises. */
  sub: string;
  color: string;
  /** Sphere radius in graph units. */
  size: number;
  contactId?: string;
  avatarUrl?: string | null;
  premiseKind?: PremiseKind;
  tags?: string[];
  grade?: Grade;
  /** Search haystack, lowercased. */
  search: string;
}

export interface NetLink {
  id: string;
  source: string;
  target: string;
  kind: NetLinkKind;
  note?: string;
}

export interface NetGraph {
  nodes: NetNode[];
  links: NetLink[];
  /** node id → adjacent node ids (undirected). */
  neighbors: Map<string, Set<string>>;
  /** node id → ids of incident links. */
  incident: Map<string, Set<string>>;
}

export const PREMISE_COLORS: Record<PremiseKind, string> = {
  event: '#F2545B',
  topic: '#3FB8F0',
  expertise: '#8B6CFF',
  hobby: '#F25CA2',
  interest: '#F5B83D',
  place: '#2FBF71',
};

export const YOU_COLOR = '#2F6FE0';

export interface BuildOptions {
  showPremises: boolean;
  showKnows: boolean;
  showYou: boolean;
  /** Label for the center node when there's no "me" contact. */
  youLabel: string;
  meContactId: string | null;
}

export const YOU_ID = 'you';

export function premiseKey(kind: PremiseKind, label: string): string {
  return `premise:${kind}:${normalizeName(label)}`;
}

export function contactNodeId(contactId: string): string {
  return `contact:${contactId}`;
}

export function buildNetworkGraph(
  contacts: Contact[],
  gradeFor: (contactId: string) => Grade,
  knows: KnowsEdge[],
  opts: BuildOptions,
): NetGraph {
  const nodes: NetNode[] = [];
  const links: NetLink[] = [];
  const me = opts.meContactId ? contacts.find((c) => c.id === opts.meContactId) : undefined;
  const youId = me ? contactNodeId(me.id) : YOU_ID;

  for (const c of contacts) {
    const grade = gradeFor(c.id);
    const name = displayNameOf(c) || 'Unnamed';
    const isMe = me?.id === c.id;
    nodes.push({
      id: contactNodeId(c.id),
      kind: isMe ? 'you' : 'contact',
      label: name,
      sub: [c.title, c.company].filter(Boolean).join(' · '),
      color: isMe ? YOU_COLOR : grade.tier.color,
      size: isMe ? 9 : 3.5 + (grade.score / 100) * 5.5,
      contactId: c.id,
      avatarUrl: c.avatarUrl,
      grade,
      search: [name, c.nickname ?? '', c.company ?? '', c.title ?? '', ...c.premises.map((p) => p.label)]
        .join(' ')
        .toLowerCase(),
    });
  }

  if (opts.showYou && !me) {
    nodes.push({
      id: YOU_ID,
      kind: 'you',
      label: opts.youLabel,
      sub: `${contacts.length} contact${contacts.length === 1 ? '' : 's'}`,
      color: YOU_COLOR,
      size: 9,
      search: opts.youLabel.toLowerCase(),
    });
  }

  if (opts.showYou) {
    for (const c of contacts) {
      if (me?.id === c.id) continue;
      links.push({ id: `you|${c.id}`, source: youId, target: contactNodeId(c.id), kind: 'you' });
    }
  }

  if (opts.showPremises) {
    // Group premises across contacts by identity; label the hub with the
    // most common spelling.
    const hubs = new Map<string, { kind: PremiseKind; spellings: Map<string, number>; tags: Set<string>; members: Set<string> }>();
    for (const c of contacts) {
      for (const p of c.premises) {
        if (!p.label.trim()) continue;
        const key = premiseKey(p.kind, p.label);
        let hub = hubs.get(key);
        if (!hub) {
          hub = { kind: p.kind, spellings: new Map(), tags: new Set(), members: new Set() };
          hubs.set(key, hub);
        }
        const label = p.label.trim();
        hub.spellings.set(label, (hub.spellings.get(label) ?? 0) + 1);
        for (const t of p.tags) hub.tags.add(t.toLowerCase());
        hub.members.add(c.id);
      }
    }
    for (const [key, hub] of hubs) {
      const label = [...hub.spellings.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]![0];
      const n = hub.members.size;
      nodes.push({
        id: key,
        kind: 'premise',
        label,
        sub: `${hub.kind} · ${n} ${n === 1 ? 'person' : 'people'}`,
        color: PREMISE_COLORS[hub.kind],
        size: 3 + Math.min(6, Math.sqrt(n) * 1.6),
        premiseKind: hub.kind,
        tags: [...hub.tags].sort(),
        search: [label, hub.kind, ...hub.tags].join(' ').toLowerCase(),
      });
      for (const contactId of hub.members) {
        links.push({ id: `${key}|${contactId}`, source: contactNodeId(contactId), target: key, kind: 'premise' });
      }
    }
  }

  if (opts.showKnows) {
    for (const e of knows) {
      links.push({ id: `knows:${e.linkId}`, source: contactNodeId(e.source), target: contactNodeId(e.target), kind: 'knows' });
    }
  }

  const neighbors = new Map<string, Set<string>>();
  const incident = new Map<string, Set<string>>();
  for (const n of nodes) {
    neighbors.set(n.id, new Set());
    incident.set(n.id, new Set());
  }
  for (const l of links) {
    neighbors.get(l.source)?.add(l.target);
    neighbors.get(l.target)?.add(l.source);
    incident.get(l.source)?.add(l.id);
    incident.get(l.target)?.add(l.id);
  }

  return { nodes, links, neighbors, incident };
}

export interface Neighborhood {
  /** The focused node plus everything one hop away (you-spokes excluded). */
  nodeIds: Set<string>;
  linkIds: Set<string>;
}

/**
 * What comes into view when a node is clicked: its premises and Knows
 * Connections (one hop). The center "you" spokes are ignored — otherwise
 * clicking any contact would light up the whole network through the hub.
 */
export function neighborhoodOf(graph: NetGraph, nodeId: string): Neighborhood {
  const nodeIds = new Set<string>([nodeId]);
  const linkIds = new Set<string>();
  const focused = graph.nodes.find((n) => n.id === nodeId);
  for (const l of graph.links) {
    if (l.source !== nodeId && l.target !== nodeId) continue;
    if (l.kind === 'you' && focused?.kind !== 'you') continue;
    linkIds.add(l.id);
    nodeIds.add(l.source === nodeId ? l.target : l.source);
  }
  return { nodeIds, linkIds };
}

export interface FocusSummary {
  knows: NetNode[];
  premises: NetNode[];
  /** People who share at least one premise with the focused contact. */
  sharesPremise: { node: NetNode; via: string[] }[];
  /** For a premise hub: its people. */
  people: NetNode[];
}

/** The side panel's lists for a focused node. */
export function summarizeFocus(graph: NetGraph, nodeId: string): FocusSummary {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const out: FocusSummary = { knows: [], premises: [], sharesPremise: [], people: [] };
  const focused = byId.get(nodeId);
  if (!focused) return out;

  const linksOf = (id: string) => graph.links.filter((l) => l.source === id || l.target === id);
  const other = (l: NetLink, id: string) => byId.get(l.source === id ? l.target : l.source);

  if (focused.kind === 'premise') {
    for (const l of linksOf(nodeId)) {
      const n = other(l, nodeId);
      if (n && n.kind !== 'premise') out.people.push(n);
    }
  } else {
    const via = new Map<string, string[]>();
    for (const l of linksOf(nodeId)) {
      const n = other(l, nodeId);
      if (!n) continue;
      if (l.kind === 'knows') out.knows.push(n);
      if (l.kind === 'premise') {
        out.premises.push(n);
        for (const pl of linksOf(n.id)) {
          const peer = other(pl, n.id);
          if (!peer || peer.id === nodeId || peer.kind === 'premise') continue;
          via.set(peer.id, [...(via.get(peer.id) ?? []), n.label]);
        }
      }
    }
    for (const [id, labels] of via) {
      const n = byId.get(id);
      if (n) out.sharesPremise.push({ node: n, via: labels });
    }
    out.sharesPremise.sort((a, b) => b.via.length - a.via.length || a.node.label.localeCompare(b.node.label));
  }
  const byLabel = (a: NetNode, b: NetNode) => a.label.localeCompare(b.label);
  out.knows.sort(byLabel);
  out.premises.sort(byLabel);
  out.people.sort(byLabel);
  return out;
}
