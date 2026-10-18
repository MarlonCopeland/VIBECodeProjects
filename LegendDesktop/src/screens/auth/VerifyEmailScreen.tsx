// src/screens/auth/VerifyEmailScreen.tsx
// Email confirmation by the emailed CODE.
// Mirrors the phone's app/(auth)/verify-email.tsx. Desktop has no deep links,
// so the phone's "link landed on this device" fast path is dropped; the code
// is the only way in (plus "I already confirmed", for a link opened elsewhere).

import { useState } from 'react';
import { useAuth } from '@legend/features/auth/AuthContext';
import { toAppError } from '@legend/lib/errors';
import { useRouter } from '../../app/router';
import { Button, TextField } from '../../ui/components';
import { AuthBanner, AuthShell, codeInputProps, readClipboardCode } from './AuthShell';

export default function VerifyEmailScreen() {
  const { user, refresh, resendVerification, signOut, verifyEmailCode } = useAuth();
  const { route, replace } = useRouter();

  // Signed-up-but-not-signed-in has no user yet, so the address arrives as a
  // route param; an already-signed-in unverified user has it on the session.
  const email = (route.query.email ?? user?.email ?? '').trim();

  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);

  const submit = async (value?: string) => {
    const entered = (value ?? code).trim();
    if (!entered || verifying) return;
    setError('');
    setNotice('');
    setVerifying(true);
    try {
      await verifyEmailCode(email, entered, 'signup');
      // The App gate takes it from here once a session exists.
    } catch (e) {
      setError(toAppError(e).message);
    } finally {
      setVerifying(false);
    }
  };

  const paste = async () => {
    const text = await readClipboardCode();
    if (!text) return;
    setCode(text);
    void submit(text);
  };

  const resend = async () => {
    setError('');
    setNotice('');
    setResending(true);
    try {
      await resendVerification(email);
      setNotice('Sent. Check your inbox for a new code.');
    } catch (e) {
      setError(toAppError(e).message);
    } finally {
      setResending(false);
    }
  };

  return (
    <AuthShell
      title="Confirm your email"
      subtitle={
        email
          ? `We sent a code to ${email}. Enter it below — you can read it on any device.`
          : 'Enter the code from your confirmation email.'
      }
      onSubmit={() => void submit()}
    >
      <AuthBanner tone="error" message={error} />
      <AuthBanner tone="info" message={notice} />

      <TextField
        label="Confirmation code"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        autoFocus
        {...codeInputProps}
      />

      <Button title="Confirm email" type="submit" block loading={verifying} disabled={!code.trim()} />
      <Button title="Paste code" variant="secondary" block onClick={() => void paste()} />

      <div className="stack" style={{ gap: 'var(--s-sm)', marginTop: 'var(--s-md)' }}>
        <Button title="Resend code" variant="ghost" block loading={resending} onClick={() => void resend()} />
        <Button title="I already confirmed — continue" variant="ghost" block onClick={() => void refresh()} />
        <Button
          title={user ? 'Sign out' : 'Back to sign in'}
          variant="ghost"
          block
          onClick={() => {
            if (user) void signOut();
            else replace('/login');
          }}
        />
      </div>
    </AuthShell>
  );
}
