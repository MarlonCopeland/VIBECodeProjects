// src/ui/components.tsx
// Desktop UI primitives — the React DOM counterparts of the phone app's
// src/components (Button, TextField, Card, Avatar, Banner, OptionSheet...).
// Styling lives in theme.css; these only pick classes.

import React, { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useAppSettings } from '@legend/features/settings/AppSettingsContext';
import { describeFreshness, type Grade } from '@legend/features/contacts/grading';

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  title,
  variant = 'primary',
  size,
  loading,
  block,
  icon,
  className,
  ...rest
}: {
  title: ReactNode;
  variant?: BtnVariant;
  size?: 'sm';
  loading?: boolean;
  block?: boolean;
  icon?: ReactNode;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'title'>) {
  const cls = ['btn', `btn-${variant}`, size === 'sm' && 'btn-sm', block && 'btn-block', className]
    .filter(Boolean)
    .join(' ');
  return (
    <button type="button" className={cls} disabled={loading || rest.disabled} {...rest}>
      {loading ? <span className="spinner" /> : icon}
      {title}
    </button>
  );
}

export function IconButton({
  label,
  children,
  ...rest
}: { label: string; children: ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className="icon-btn" aria-label={label} title={label} {...rest}>
      {children}
    </button>
  );
}

export function TextField({
  label,
  error,
  hint,
  multiline,
  ...rest
}: {
  label?: string;
  error?: string | null;
  hint?: string;
  multiline?: boolean;
} & React.InputHTMLAttributes<HTMLInputElement> &
  React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <label className="field">
      {label ? <span>{label}</span> : null}
      {multiline ? (
        <textarea className="input" {...(rest as React.TextareaHTMLAttributes<HTMLTextAreaElement>)} />
      ) : (
        <input className="input" {...(rest as React.InputHTMLAttributes<HTMLInputElement>)} />
      )}
      {error ? <span className="error">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </label>
  );
}

export function Card({ children, className, style }: { children: ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={['card', className].filter(Boolean).join(' ')} style={style}>
      {children}
    </div>
  );
}

export function SectionLabel({ children, style }: { children: ReactNode; style?: React.CSSProperties }) {
  return (
    <div className="label" style={style}>
      {children}
    </div>
  );
}

function initials(name?: string | null): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p.charAt(0).toUpperCase()).join('') || '?';
}

export function Avatar({ uri, name, size = 40 }: { uri?: string | null; name?: string | null; size?: number }) {
  if (uri) return <img className="avatar" src={uri} alt="" style={{ width: size, height: size }} />;
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {initials(name)}
    </span>
  );
}

export function Banner({ tone = 'info', children }: { tone?: 'info' | 'error' | 'success'; children: ReactNode }) {
  return <div className={`banner ${tone}`}>{children}</div>;
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (on: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={`toggle${on ? ' on' : ''}`}
      onClick={() => onChange(!on)}
    />
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="segmented" role="tablist">
      {options.map((o) => (
        <button key={o.id} type="button" role="tab" aria-selected={value === o.id} className={value === o.id ? 'on' : ''} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Chip({
  selected,
  onClick,
  children,
  title,
}: {
  selected?: boolean;
  onClick?: () => void;
  children: ReactNode;
  title?: string;
}) {
  if (!onClick) return <span className="chip" title={title}>{children}</span>;
  return (
    <button type="button" className={`chip${selected ? ' selected' : ''}`} aria-pressed={selected} onClick={onClick} title={title}>
      {children}
    </button>
  );
}

export function Modal({
  open,
  title,
  onClose,
  children,
  width,
}: {
  open: boolean;
  title?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  width?: number;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" style={width ? { width: `min(${width}px, 100%)` } : undefined}>
        <div className="modal-header">
          <h2>{title}</h2>
          <IconButton label="Close" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

/** Same three treatments as the phone's GradeBadge: dot, pill, hero. */
export function GradeBadge({ grade, variant = 'pill' }: { grade: Grade; variant?: 'dot' | 'pill' | 'hero' }) {
  const { activePalette } = useAppSettings();
  const { tier, score, freshnessDays } = grade;
  if (variant === 'dot') {
    return <span className="grade-dot" title={`${tier.label}, score ${score}`} style={{ background: tier.color }} />;
  }
  if (variant === 'hero') {
    return (
      <div
        className={`grade-hero${activePalette.animated ? ' prismatic' : ''}`}
        style={{ borderColor: tier.color, background: `${tier.color}26`, color: tier.color }}
      >
        <strong>{activePalette.animated ? `✦ ${tier.label} ✦` : tier.label}</strong>
        <span className="small">{`${score}/100 · last touch ${describeFreshness(freshnessDays)}`}</span>
      </div>
    );
  }
  return (
    <span className="grade-pill" style={{ background: `${tier.color}26`, color: tier.color }}>
      {tier.label} <span style={{ opacity: 0.8 }}>{score}</span>
    </span>
  );
}

/** Page scaffold: header (title + actions) over a scrolling body. */
export function Page({
  title,
  actions,
  back,
  narrow,
  children,
}: {
  title: ReactNode;
  actions?: ReactNode;
  back?: ReactNode;
  narrow?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`page${narrow ? ' narrow' : ''}`}>
      <div className="page-inner">
        <div className="page-header">
          {back}
          <h1 className="ellipsis">{title}</h1>
          {actions}
        </div>
        {children}
      </div>
    </div>
  );
}
