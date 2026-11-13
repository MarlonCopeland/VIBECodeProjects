// src/screens/auth/ForgotPasswordScreen.tsx
// Sends a password-reset email (with a code) via the backend auth API.
// Mirrors the phone's app/(auth)/forgot-password.tsx.

import { useState } from 'react';
import { useAuth } from '@legend/features/auth/AuthContext';
import { toAppError } from '@legend/lib/errors';
import { useRouter } from '../../app/router';
import { Button, TextField } from '../../ui/components';
import { AuthBanner, AuthShell } from './AuthShell';

export default function ForgotPasswordScreen() {
  const { sendPasswordReset } = useAuth();
  const { navigate, back } = useRouter();

  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (loading) return;
    setError('');
    setLoading(true);
    try {
      await sendPasswordReset(email);
      setSent(true);
      // Hand off to the code screen; the reset finishes there.
      navigate('/reset-password', { email: email.trim() });
    } catch (e) {
      setError(toAppError(e).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Reset password"
      subtitle="Enter your email and we'll send a reset code."
      onSubmit={() => void submit()}
    >
      <AuthBanner tone="error" message={error} />
      <AuthBanner tone="success" message={sent ? 'If that email exists, a reset code is on its way.' : ''} />

      <TextField
        label="Email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoCapitalize="none"
        autoComplete="email"
        placeholder="you@example.com"
        autoFocus
      />

      <Button title="Send reset code" type="submit" block loading={loading} />
      <Button title="Back to sign in" variant="ghost" block onClick={() => back('/login')} />
    </AuthShell>
  );
}
