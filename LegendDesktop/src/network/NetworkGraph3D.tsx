// src/network/NetworkGraph3D.tsx
// The 3D force-directed map (3d-force-graph on three.js). Imperative under
// the hood — one ForceGraph3D instance per mount — wrapped so React only
// passes data in and gets clicks out:
//
//   graph     the model from graphModel.ts (rebuilt when contacts change;
//             node positions are carried over so the layout doesn't jump)
//   focusId   the clicked node. Its one-hop neighborhood (premises + Knows
//             Connections, or a premise's people) stays lit, everything else
//             fades, labels appear, particles run along its links, and the
//             camera flies to frame the whole neighborhood.

import React, { useEffect, useRef } from 'react';
import ForceGraph3D, { type ForceGraph3DInstance } from '3d-force-graph';
import { neighborhoodOf, type NetGraph, type NetLink, type NetNode, type Neighborhood } from './graphModel';
import { createNodeVisual, disposeNodeVisual, type NodeVisual } from './nodeSprites';

// d3 mutates nodes with positions/velocities and swaps link ends for node refs.
type SimNode = NetNode & { x?: number; y?: number; z?: number; vx?: number; vy?: number; vz?: number; fx?: number; fy?: number; fz?: number };
type SimLink = Omit<NetLink, 'source' | 'target'> & { source: string | SimNode; target: string | SimNode };
type FG = ForceGraph3DInstance<SimNode, SimLink>;

const endId = (end: string | SimNode): string => (typeof end === 'string' ? end : end.id);

interface Props {
  graph: NetGraph;
  focusId: string | null;
  onFocus(id: string | null): void;
  theme: 'light' | 'dark';
  autoRotate: boolean;
}

const THEMES = {
  dark: { bg: '#07090d', label: '#e8ecf3', knows: 'rgba(255,255,255,0.8)', you: 'rgba(255,255,255,0.07)', particle: '#ffffff' },
  light: { bg: '#f3f5f9', label: '#12151c', knows: 'rgba(18,21,28,0.75)', you: 'rgba(18,21,28,0.08)', particle: '#2f6fe0' },
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function visualKey(n: NetNode): string {
  return `${n.label}|${n.color}|${n.size}|${n.avatarUrl ?? ''}`;
}

function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function NetworkGraph3D({ graph, focusId, onFocus, theme, autoRotate }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<FG | null>(null);
  const visuals = useRef(new Map<string, { key: string; v: NodeVisual }>());
  const state = useRef({
    graph,
    focusId,
    hood: null as Neighborhood | null,
    hoverId: null as string | null,
    theme,
    fitted: false,
    autoRotate,
  });
  const onFocusRef = useRef(onFocus);
  onFocusRef.current = onFocus;

  // ---- styling, driven from `state` so accessors never go stale ----------

  const nodeById = (id: string) => state.current.graph.nodes.find((n) => n.id === id);

  const linkColor = (l: SimLink): string => {
    const s = state.current;
    const t = THEMES[s.theme];
    const lit = s.hood ? s.hood.linkIds.has(l.id) : true;
    const dim = s.hood && !lit;
    if (l.kind === 'knows') return dim ? withAlpha(s.theme === 'dark' ? '#ffffff' : '#12151c', 0.05) : t.knows;
    if (l.kind === 'you') return s.hood && !lit ? 'rgba(0,0,0,0)' : t.you;
    const premise = nodeById(endId(l.target)) ?? nodeById(endId(l.source));
    const color = premise?.kind === 'premise' ? premise.color : '#9aa2b1';
    return withAlpha(color, dim ? 0.04 : s.hood ? 0.95 : 0.4);
  };

  const applyStyles = () => {
    const fg = fgRef.current;
    if (!fg) return;
    const s = state.current;
    const t = THEMES[s.theme];
    const busy = s.graph.nodes.length > 60;
    for (const n of s.graph.nodes) {
      const entry = visuals.current.get(n.id);
      if (!entry) continue;
      const { badge, label } = entry.v;
      const inHood = s.hood ? s.hood.nodeIds.has(n.id) : true;
      badge.material.opacity = inHood ? 1 : 0.1;
      label.color = t.label;
      label.visible =
        n.id === s.hoverId ||
        (s.hood ? inHood : n.kind === 'you' || (n.kind === 'premise' && (!busy || n.size > 5)));
      const scale = n.id === s.focusId ? 1.35 : 1;
      const d = n.size * 2 * scale;
      badge.scale.set(d, d, 1);
    }
    fg.linkColor((l) => linkColor(l))
      .linkWidth((l) => (l.kind === 'knows' ? (s.hood?.linkIds.has(l.id) ? 1.1 : 0.55) : 0))
      .linkDirectionalParticles((l) => (s.hood?.linkIds.has(l.id) && l.kind !== 'you' ? 3 : 0))
      .linkDirectionalParticleColor(() => t.particle);
  };

  const flyTo = (id: string | null) => {
    const fg = fgRef.current;
    if (!fg) return;
    if (!id) {
      fg.zoomToFit(1000, 60);
      return;
    }
    const nodes = fg.graphData().nodes;
    const node = nodes.find((n) => n.id === id);
    if (!node || node.x === undefined) return;
    const hood = state.current.hood;
    let radius = 20;
    for (const n of nodes) {
      if (!hood?.nodeIds.has(n.id) || n.x === undefined) continue;
      radius = Math.max(radius, Math.hypot(n.x - node.x!, (n.y ?? 0) - (node.y ?? 0), (n.z ?? 0) - (node.z ?? 0)));
    }
    const distance = Math.min(700, Math.max(70, radius * 2.6 + 30));
    const cam = fg.cameraPosition();
    // Approach from where the camera already is, so the move feels continuous.
    let dx = cam.x - node.x!;
    let dy = cam.y - (node.y ?? 0);
    let dz = cam.z - (node.z ?? 0);
    const len = Math.hypot(dx, dy, dz) || 1;
    dx /= len;
    dy /= len;
    dz /= len;
    fg.cameraPosition(
      { x: node.x! + dx * distance, y: (node.y ?? 0) + dy * distance, z: (node.z ?? 0) + dz * distance },
      { x: node.x!, y: node.y ?? 0, z: node.z ?? 0 },
      1100,
    );
  };

  // ---- mount -------------------------------------------------------------

  useEffect(() => {
    const el = containerRef.current!;
    const fg = new ForceGraph3D(el, { controlType: 'orbit' }) as unknown as FG;
    fgRef.current = fg;

    fg.backgroundColor(THEMES[state.current.theme].bg)
      .showNavInfo(false)
      .width(el.clientWidth)
      .height(el.clientHeight)
      .nodeId('id')
      .nodeLabel((n) => `<div class="net-tip"><b>${escapeHtml(n.label)}</b>${n.sub ? `<br/><span>${escapeHtml(n.sub)}</span>` : ''}</div>`)
      .nodeThreeObject((n) => {
        const key = visualKey(n);
        let entry = visuals.current.get(n.id);
        if (!entry || entry.key !== key) {
          if (entry) disposeNodeVisual(entry.v);
          entry = { key, v: createNodeVisual(n, THEMES[state.current.theme].label) };
          visuals.current.set(n.id, entry);
        }
        return entry.v.group;
      })
      .linkOpacity(1)
      .linkDirectionalParticleWidth(1.8)
      .linkDirectionalParticleSpeed(0.007)
      .cooldownTicks(220)
      .onNodeClick((n) => onFocusRef.current(n.id === state.current.focusId ? null : n.id))
      .onNodeHover((n) => {
        state.current.hoverId = n?.id ?? null;
        el.style.cursor = n ? 'pointer' : 'grab';
        applyStyles();
      })
      .onBackgroundClick(() => onFocusRef.current(null))
      .onEngineStop(() => {
        if (state.current.fitted) return;
        state.current.fitted = true;
        if (state.current.focusId) flyTo(state.current.focusId);
        else fg.zoomToFit(900, 60);
      });

    // Premise spokes short and tight, Knows links a bit longer, the "you"
    // spokes long and weak so the hub sits in the middle without crushing
    // the clusters around it.
    const linkForce = fg.d3Force('link') as unknown as {
      distance(fn: (l: SimLink) => number): unknown;
      strength(fn: (l: SimLink) => number): unknown;
    };
    linkForce.distance((l) => (l.kind === 'you' ? 110 : l.kind === 'premise' ? 26 : 34));
    linkForce.strength((l) => (l.kind === 'you' ? 0.03 : l.kind === 'premise' ? 0.6 : 0.4));
    (fg.d3Force('charge') as unknown as { strength(v: number): unknown }).strength(-70);

    const controls = fg.controls() as { autoRotate: boolean; autoRotateSpeed: number; addEventListener(t: string, cb: () => void): void };
    controls.autoRotate = state.current.autoRotate;
    controls.autoRotateSpeed = 0.5;
    controls.addEventListener('start', () => {
      controls.autoRotate = false;
    });

    const ro = new ResizeObserver(() => fg.width(el.clientWidth).height(el.clientHeight));
    ro.observe(el);

    const vis = visuals.current;
    return () => {
      ro.disconnect();
      fg._destructor();
      for (const { v } of vis.values()) disposeNodeVisual(v);
      vis.clear();
      fgRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- data --------------------------------------------------------------

  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    state.current.graph = graph;
    const prev = new Map(fg.graphData().nodes.map((n) => [n.id, n]));
    const nodes: SimNode[] = graph.nodes.map((n) => {
      const p = prev.get(n.id);
      return p ? { ...n, x: p.x, y: p.y, z: p.z, vx: p.vx, vy: p.vy, vz: p.vz } : { ...n };
    });
    const live = new Set(graph.nodes.map((n) => n.id));
    for (const [id, entry] of visuals.current) {
      if (!live.has(id)) {
        disposeNodeVisual(entry.v);
        visuals.current.delete(id);
      }
    }
    fg.graphData({ nodes, links: graph.links.map((l) => ({ ...l })) });
    const focus = state.current.focusId;
    state.current.hood = focus && live.has(focus) ? neighborhoodOf(graph, focus) : null;
    applyStyles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph]);

  // ---- focus -------------------------------------------------------------

  useEffect(() => {
    state.current.focusId = focusId;
    state.current.hood = focusId ? neighborhoodOf(state.current.graph, focusId) : null;
    applyStyles();
    if (state.current.fitted) flyTo(focusId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId]);

  // ---- theme / rotation --------------------------------------------------

  useEffect(() => {
    state.current.theme = theme;
    fgRef.current?.backgroundColor(THEMES[theme].bg);
    applyStyles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  useEffect(() => {
    state.current.autoRotate = autoRotate;
    const controls = fgRef.current?.controls() as { autoRotate: boolean } | undefined;
    if (controls) controls.autoRotate = autoRotate;
  }, [autoRotate]);

  return <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />;
}
