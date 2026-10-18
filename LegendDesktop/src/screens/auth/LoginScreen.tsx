// src/screens/auth/LoginScreen.tsx
// Email/password sign-in with links to sign-up + reset.
// Mirrors the phone's app/(auth)/login.tsx (social sign-in is disabled on desktop).

import { useState } from 'react';
import { useAuth } from '@legend/features/auth/AuthContext';
import { toAppError } from '@legend/lib/errors';
import { useRouter } from '../../app/router';
import { Button, TextField } from '../../ui/components';
import { AuthBanner, AuthShell, TextLink } from './AuthShell';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const { navigate } = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (loading) return;
    setError('');
    setLoading(true);
    try {
      await signIn({ email, password });
      // The App gate handles navigation on success.
    } catch (e) {
      setError(toAppError(e).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to your Legend account." onSubmit={() => void submit()}>
      <AuthBanner tone="error" message={error} />

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
      <TextField
        label="Password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="current-password"
        placeholder="Your password"
      />

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <TextLink onClick={() => navigate('/forgot-password')}>Forgot password?</TextLink>
      </div>

      <Button title="Sign in" type="submit" block loading={loading} />

      <div className="row" style={{ justifyContent: 'center', gap: 4, marginTop: 'var(--s-md)' }}>
        <span className="muted">Don&apos;t have an account?</span>
        <TextLink strong onClick={() => navigate('/signup')}>
          Sign up
        </TextLink>
      </div>
    </AuthShell>
  );
}
