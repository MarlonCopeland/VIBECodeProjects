// src/screens/auth/ResetPasswordScreen.tsx
// Password reset by the emailed CODE, then a new password.
// Mirrors the phone's app/(auth)/reset-password.tsx. Desktop has no deep links,
// so the phone's "tapped the emailed link on this device" path is dropped:
// arriving with ?email= asks for the code; arriving already signed in skips
// straight to choosing a password; anything else is the "expired" state.
//
// The App gate exempts this route: redeeming a recovery code produces a real
// session, and without the exemption the gate would fling the user into the
// app before they could set a password.

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@legend/features/auth/AuthContext';
import { toAppError } from '@legend/lib/errors';
import { useRouter } from '../../app/router';
import { Button, TextField } from '../../ui/components';
import { AuthBanner, AuthShell, codeInputProps, readClipboardCode } from './AuthShell';

type Phase = 'checking' | 'code' | 'password' | 'invalid' | 'done';

export default function ResetPasswordScreen() {
  const { verifyEmailCode, updatePassword, status, signOut } = useAuth();
  const { route, replace } = useRouter();
  const email = (route.query.email ?? '').trim();

  const [phase, setPhase] = useState<Phase>('checking');
  const [error, setError] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const settled = useRef(false);

  // Decide the starting phase once auth has resolved. An existing session is
  // good enough to set a password; otherwise ask for the emailed code.
  useEffect(() => {
    if (settled.current || status === 'loading') return;
    settled.current = true;
    setPhase(status === 'authenticated' ? 'password' : email ? 'code' : 'invalid');
  }, [status, email]);

  const submitCode = async (value?: string) => {
    const entered = (value ?? code).trim();
    if (!entered || busy) return;
    setError('');
    setBusy(true);
    try {
      await verifyEmailCode(email, entered, 'recovery');
      setPhase('password');
    } catch (e) {
      setError(toAppError(e).message);
    } finally {
      setBusy(false);
    }
  };

  const pasteCode = async () => {
    const text = await readClipboardCode();
    if (!text) return;
    setCode(text);
    void submitCode(text);
  };

  const savePassword = async () => {
    if (busy || !password || !confirm) return;
    setError('');
    if (password !== confirm) {
      setError('Both passwords must match.');
      return;
    }
    setBusy(true);
    try {
      await updatePassword(password);
      setPhase('done');
    } catch (e) {
      setError(toAppError(e).message);
    } finally {
      setBusy(false);
    }
  };

  if (phase === 'checking') {
    return (
      <div className="auth-wrap">
        <span className="muted">Checking your reset request…</span>
      </div>
    );
  }

  if (phase === 'invalid') {
    return (
      <AuthShell
        title="Reset code expired"
        subtitle="Reset codes and links are single-use and expire after an hour. Request a fresh one and you can finish on this device."
      >
        <AuthBanner tone="error" message={error} />
        <Button title="Send a new code" block onClick={() => replace('/forgot-password')} />
        <Button title="Back to sign in" variant="ghost" block onClick={() => replace('/login')} />
      </AuthShell>
    );
  }

  if (phase === 'done') {
    return (
      <AuthShell title="Password updated" subtitle="You are signed in with your new password.">
        <Button title="Continue to Legend" block onClick={() => replace('/contacts')} />
        <Button
          title="Sign out"
          variant="ghost"
          block
          onClick={() => {
            void signOut().then(() => replace('/login'));
          }}
        />
      </AuthShell>
    );
  }

  if (phase === 'code') {
    return (
      <AuthShell
        title="Enter your reset code"
        subtitle={`We sent a code to ${email}. You can read it on any device.`}
        onSubmit={() => void submitCode()}
      >
        <AuthBanner tone="error" message={error} />

        <TextField
          label="Reset code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoFocus
          {...codeInputProps}
        />

        <Button title="Continue" type="submit" block loading={busy} disabled={!code.trim()} />
        <Button title="Paste code" variant="secondary" block onClick={() => void pasteCode()} />
        <div style={{ marginTop: 'var(--s-md)' }}>
          <Button title="Send a new code" variant="ghost" block onClick={() => replace('/forgot-password')} />
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Choose a new password"
      subtitle="Pick something you have not used before."
      onSubmit={() => void savePassword()}
    >
      <AuthBanner tone="error" message={error} />

      <TextField
        label="New password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="new-password"
        placeholder="At least 8 characters"
        autoFocus
      />
      <TextField
        label="Confirm new password"
        type="password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        autoComplete="new-password"
        placeholder="Repeat it"
      />

      <Button title="Save new password" type="submit" block loading={busy} disabled={!password || !confirm} />
      <Button title="Cancel" variant="ghost" block onClick={() => replace('/login')} />
    </AuthShell>
  );
}
