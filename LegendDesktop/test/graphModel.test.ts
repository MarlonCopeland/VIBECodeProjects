import { describe, expect, it } from 'vitest';
import { computeGrade } from '@legend/features/contacts/grading';
import type { Contact, Premise } from '@legend/features/contacts/types';
import {
  YOU_ID,
  buildNetworkGraph,
  contactNodeId,
  neighborhoodOf,
  premiseKey,
  summarizeFocus,
  type BuildOptions,
} from '../src/network/graphModel';

let n = 0;
function contact(firstName: string, premises: Omit<Premise, 'id'>[] = []): Contact {
  n += 1;
  return {
    id: `c${n}`,
    ownerId: 'o',
    firstName,
    lastName: 'Test',
    phones: [],
    emails: [],
    avatarUrl: null,
    whereMet: null,
    premises: premises.map((p, i) => ({ ...p, id: `p${n}-${i}` })),
    favorite: false,
    source: 'manual',
    createdAt: '',
    updatedAt: '',
  };
}

const grade = () => computeGrade([], Date.now());
const OPTS: BuildOptions = { showPremises: true, showKnows: true, showYou: true, youLabel: 'Me', meContactId: null };

describe('buildNetworkGraph', () => {
  const gala = { kind: 'event' as const, label: 'NAACP Gala 2026', tags: ['civic'] };
  const ada = contact('Ada', [gala, { kind: 'hobby', label: 'chess', tags: [] }]);
  const bob = contact('Bob', [{ kind: 'event', label: 'naacp gala 2026!', tags: ['Fundraiser'] }]);
  const cy = contact('Cy');
  const knows = [{ linkId: 'k1', source: ada.id, target: cy.id }];

  it('merges the same premise across contacts into one hub', () => {
    const g = buildNetworkGraph([ada, bob, cy], grade, knows, OPTS);
    const hub = g.nodes.find((x) => x.id === premiseKey('event', 'NAACP Gala 2026'))!;
    expect(hub.sub).toBe('event · 2 people');
    expect(hub.tags).toEqual(['civic', 'fundraiser']);
    expect(g.nodes.filter((x) => x.kind === 'premise')).toHaveLength(2);
    expect(g.neighbors.get(hub.id)).toEqual(new Set([contactNodeId(ada.id), contactNodeId(bob.id)]));
  });

  it('adds a center node with spokes, or uses the me contact as the center', () => {
    const g = buildNetworkGraph([ada, bob, cy], grade, knows, OPTS);
    expect(g.nodes.some((x) => x.id === YOU_ID)).toBe(true);
    expect(g.links.filter((l) => l.kind === 'you')).toHaveLength(3);

    const me = buildNetworkGraph([ada, bob, cy], grade, knows, { ...OPTS, meContactId: bob.id });
    expect(me.nodes.some((x) => x.id === YOU_ID)).toBe(false);
    expect(me.nodes.find((x) => x.id === contactNodeId(bob.id))!.kind).toBe('you');
    expect(me.links.filter((l) => l.kind === 'you')).toHaveLength(2);
  });

  it('respects layer toggles', () => {
    const g = buildNetworkGraph([ada, bob, cy], grade, knows, { ...OPTS, showPremises: false, showKnows: false, showYou: false });
    expect(g.nodes).toHaveLength(3);
    expect(g.links).toHaveLength(0);
  });

  it('focus neighborhood = premises + Knows, not the whole network via the center', () => {
    const g = buildNetworkGraph([ada, bob, cy], grade, knows, OPTS);
    const hood = neighborhoodOf(g, contactNodeId(ada.id));
    expect(hood.nodeIds).toEqual(
      new Set([
        contactNodeId(ada.id),
        contactNodeId(cy.id),
        premiseKey('event', 'NAACP Gala 2026'),
        premiseKey('hobby', 'chess'),
      ]),
    );
    const summary = summarizeFocus(g, contactNodeId(ada.id));
    expect(summary.knows.map((x) => x.label)).toEqual(['Cy Test']);
    expect(summary.premises.map((x) => x.label)).toEqual(['chess', 'NAACP Gala 2026']);
    expect(summary.sharesPremise.map((s) => [s.node.label, s.via])).toEqual([['Bob Test', ['NAACP Gala 2026']]]);
  });

  it('a premise hub focuses on its people', () => {
    const g = buildNetworkGraph([ada, bob, cy], grade, knows, OPTS);
    const summary = summarizeFocus(g, premiseKey('event', 'NAACP Gala 2026'));
    expect(summary.people.map((x) => x.label)).toEqual(['Ada Test', 'Bob Test']);
  });
});
