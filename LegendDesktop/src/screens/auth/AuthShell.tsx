// src/screens/auth/AuthShell.tsx
// Shared bits for the desktop auth screens: the centered "LEGEND" card
// (stands in for the phone's <Screen scroll center> + title block), the
// password strength meter (mirrors src/features/auth/components/
// PasswordStrengthMeter.tsx), and a clipboard reader for the "Paste code"
// buttons (expo-clipboard on the phone).

import React, { type ReactNode } from 'react';
import { scorePasswordStrength } from '@legend/lib/validation';
import { Banner } from '../../ui/components';

export function AuthShell({
  title,
  subtitle,
  onSubmit,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  /** When set, the body is a <form> so Enter submits. */
  onSubmit?: () => void;
  children: ReactNode;
}) {
  const body = <div className="stack">{children}</div>;
  return (
    <div className="auth-wrap">
      <div className="card auth-card" style={{ padding: 'var(--s-xl)' }}>
        <div
          style={{
            fontWeight: 800,
            letterSpacing: '0.24em',
            color: 'var(--primary)',
            fontSize: 'var(--fs-lg)',
            marginBottom: 'var(--s-lg)',
          }}
        >
          LEGEND
        </div>
        <div style={{ marginBottom: 'var(--s-lg)' }}>
          <h1 style={{ margin: 0, fontSize: 'var(--fs-xxl)' }}>{title}</h1>
          {subtitle ? (
            <p className="muted" style={{ margin: 'var(--s-xs) 0 0' }}>
              {subtitle}
            </p>
          ) : null}
        </div>
        {onSubmit ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onSubmit();
            }}
          >
            {body}
          </form>
        ) : (
          body
        )}
      </div>
    </div>
  );
}

/** Renders nothing for an empty message, like the phone's <Banner message="">. */
export function AuthBanner({ tone, message }: { tone: 'info' | 'error' | 'success'; message: string }) {
  if (!message) return null;
  return <Banner tone={tone}>{message}</Banner>;
}

/** Inline text link (the phone's <Link><Text tone="primary">). */
export function TextLink({
  children,
  onClick,
  strong,
}: {
  children: ReactNode;
  onClick: () => void;
  strong?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: 'none',
        border: 'none',
        padding: 0,
        cursor: 'pointer',
        color: 'var(--primary)',
        font: 'inherit',
        fontWeight: strong ? 600 : 500,
      }}
    >
      {children}
    </button>
  );
}

/** Visual 4-segment strength bar driven by scorePasswordStrength(). */
export function PasswordStrengthMeter({ password }: { password: string }) {
  if (!password) return null;
  const { score, label } = scorePasswordStrength(password);
  const color =
    score <= 1 ? 'var(--danger)' : score === 2 ? 'var(--warning)' : score === 3 ? 'var(--primary)' : 'var(--success)';
  return (
    <div>
      <div style={{ display: 'flex', gap: 'var(--s-xs)' }}>
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: 4,
              borderRadius: 'var(--r-sm)',
              background: i < score ? color : 'var(--border)',
            }}
          />
        ))}
      </div>
      <div className="small" style={{ color, marginTop: 'var(--s-xs)' }}>
        {`Strength: ${label}`}
      </div>
    </div>
  );
}

/** Clipboard contents reduced to code characters ('' if unreadable/empty). */
export async function readClipboardCode(): Promise<string> {
  try {
    const text = await navigator.clipboard.readText();
    return text.replace(/[^0-9A-Za-z]/g, '');
  } catch {
    return '';
  }
}

/** Shared props for the one-time-code input. */
export const codeInputProps = {
  inputMode: 'numeric',
  autoComplete: 'one-time-code',
  autoCapitalize: 'none',
  placeholder: '12345678',
  maxLength: 10,
  spellCheck: false,
} as const satisfies React.InputHTMLAttributes<HTMLInputElement>;
