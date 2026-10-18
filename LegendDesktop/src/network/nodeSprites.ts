// src/network/nodeSprites.ts
// Builds the three.js object for each node of the 3D map: a round "badge"
// sprite (avatar photo or initials for people, a kind icon for premise
// hubs, a person glyph for you) plus a text label that's only shown when
// the node is hovered, focused, or in the focused neighborhood.

import * as THREE from 'three';
import SpriteText from 'three-spritetext';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  CalendarDays,
  GraduationCap,
  MapPin,
  MessageCircle,
  Palette,
  Star,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import type { PremiseKind } from '@legend/features/contacts/types';
import type { NetNode } from './graphModel';

const PREMISE_ICONS: Record<PremiseKind, LucideIcon> = {
  event: CalendarDays,
  topic: MessageCircle,
  expertise: GraduationCap,
  hobby: Palette,
  interest: Star,
  place: MapPin,
};

const TEX = 128;
const iconCache = new Map<string, Promise<HTMLImageElement>>();

function loadImage(src: string, crossOrigin: boolean): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (crossOrigin) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function iconImage(Icon: LucideIcon): Promise<HTMLImageElement> {
  const key = Icon.displayName ?? String(Icon);
  let p = iconCache.get(key);
  if (!p) {
    const svg = renderToStaticMarkup(createElement(Icon, { size: 64, color: '#ffffff', strokeWidth: 2.2 }));
    p = loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, false);
    iconCache.set(key, p);
  }
  return p;
}

function initials(label: string): string {
  const parts = label.trim().split(/\s+/).slice(0, 2);
  return parts.map((s) => s.charAt(0).toUpperCase()).join('') || '?';
}

function drawDisc(ctx: CanvasRenderingContext2D, color: string, ring: boolean): void {
  const r = TEX / 2;
  ctx.clearRect(0, 0, TEX, TEX);
  ctx.beginPath();
  ctx.arc(r, r, r - 4, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  if (ring) {
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.stroke();
  }
}

/** A badge texture; async parts (icons, photos) repaint it when ready. */
function badgeTexture(node: NetNode): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = TEX;
  canvas.height = TEX;
  const ctx = canvas.getContext('2d')!;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const ring = node.kind === 'you';
  drawDisc(ctx, node.color, ring);

  const paintIcon = (Icon: LucideIcon) =>
    void iconImage(Icon).then((img) => {
      const s = TEX * 0.5;
      ctx.drawImage(img, (TEX - s) / 2, (TEX - s) / 2, s, s);
      texture.needsUpdate = true;
    });

  if (node.kind === 'premise' && node.premiseKind) {
    paintIcon(PREMISE_ICONS[node.premiseKind]);
  } else if (node.kind === 'you' && !node.contactId) {
    paintIcon(UserRound);
  } else {
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 ${TEX * 0.38}px "Segoe UI", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initials(node.label), TEX / 2, TEX / 2 + 3);
    if (node.avatarUrl) {
      // Photo inside a ring of the tier color. A photo from a host without
      // CORS would taint the canvas (WebGL refuses it) — keep initials then.
      loadImage(node.avatarUrl, true)
        .then((img) => {
          drawDisc(ctx, node.color, ring);
          ctx.save();
          ctx.beginPath();
          ctx.arc(TEX / 2, TEX / 2, TEX / 2 - 12, 0, Math.PI * 2);
          ctx.clip();
          const side = Math.min(img.width, img.height);
          ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 12, 12, TEX - 24, TEX - 24);
          ctx.restore();
          texture.needsUpdate = true;
        })
        .catch(() => undefined);
    }
  }
  texture.needsUpdate = true;
  return texture;
}

export interface NodeVisual {
  group: THREE.Group;
  badge: THREE.Sprite;
  label: SpriteText;
}

export function createNodeVisual(node: NetNode, labelColor: string): NodeVisual {
  const group = new THREE.Group();
  const material = new THREE.SpriteMaterial({ map: badgeTexture(node), transparent: true, depthWrite: false });
  const badge = new THREE.Sprite(material);
  const d = node.size * 2;
  badge.scale.set(d, d, 1);
  group.add(badge);

  const label = new SpriteText(node.label, node.kind === 'premise' ? 3.2 : 3.6, labelColor);
  label.fontWeight = node.kind === 'contact' ? '600' : '700';
  label.backgroundColor = false;
  label.position.set(0, -(node.size + 3.2), 0);
  (label.material as THREE.SpriteMaterial).depthWrite = false;
  label.visible = false;
  group.add(label);

  return { group, badge, label };
}

export function disposeNodeVisual(v: NodeVisual): void {
  const m = v.badge.material;
  m.map?.dispose();
  m.dispose();
  (v.label.material as THREE.SpriteMaterial).map?.dispose();
  (v.label.material as THREE.Material).dispose();
}
