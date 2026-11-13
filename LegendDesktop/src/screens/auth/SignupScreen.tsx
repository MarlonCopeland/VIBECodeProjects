// src/screens/auth/SignupScreen.tsx
// Account creation with live password-strength feedback and validation.
// Mirrors the phone's app/(auth)/signup.tsx (social sign-in is disabled on desktop).

import { useState } from 'react';
import { useAuth } from '@legend/features/auth/AuthContext';
import { toAppError } from '@legend/lib/errors';
import { useRouter } from '../../app/router';
import { Button, TextField } from '../../ui/components';
import { AuthBanner, AuthShell, PasswordStrengthMeter, TextLink } from './AuthShell';

export default function SignupScreen() {
  const { signUp } = useAuth();
  const { navigate } = useRouter();

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (loading) return;
    setError('');
    setNotice('');
    setLoading(true);
    try {
      const { needsEmailConfirmation } = await signUp({ displayName, email, password });
      if (needsEmailConfirmation) {
        // Hand off to the code screen: desktop confirms with the emailed code.
        navigate('/verify-email', { email: email.trim() });
      }
      // The App gate handles navigation once a session exists.
    } catch (e) {
      setError(toAppError(e).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title="Create account" subtitle="Get started in seconds." onSubmit={() => void submit()}>
      <AuthBanner tone="error" message={error} />
      <AuthBanner tone="success" message={notice} />

      <TextField
        label="Name"
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        autoCapitalize="words"
        autoComplete="name"
        placeholder="Jane Doe"
        autoFocus
      />
      <TextField
        label="Email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoCapitalize="none"
        autoComplete="email"
        placeholder="you@example.com"
      />
      <TextField
        label="Password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="new-password"
        placeholder="Create a strong password"
      />
      <PasswordStrengthMeter password={password} />

      <Button title="Create account" type="submit" block loading={loading} />

      <div className="row" style={{ justifyContent: 'center', gap: 4, marginTop: 'var(--s-md)' }}>
        <span className="muted">Already have an account?</span>
        <TextLink strong onClick={() => navigate('/login')}>
          Sign in
        </TextLink>
      </div>
    </AuthShell>
  );
}
