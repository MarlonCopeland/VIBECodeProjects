// src/app/SuiteGate.tsx
// Legend Desktop is part of Legend Full Suite (a one-time App Store / Google
// Play purchase made in the phone app — see
// ../LegendNetworkingApp/supabase/functions/README.md). With real accounts
// (Supabase backend) the signed-in account must own it; the check is the
// server-side has_full_suite() RPC, so it can't be faked locally. The local
// backend (troubleshooting only) skips the gate.

import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@legend/features/auth/AuthContext';
import { fullSuiteEnabled, hasFullSuite } from '@legend/features/suite/suiteService';
import { Banner, Button } from '../ui/components';

type GateState = 'checking' | 'owned' | 'missing' | 'error';

export function SuiteGate({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();
  const enabled = fullSuiteEnabled();
  const [state, setState] = useState<GateState>(enabled ? 'checking' : 'owned');
  const [error, setError] = useState('');

  const check = useCallback(async () => {
    if (!enabled) return;
    setState('checking');
    try {
      setState((await hasFullSuite()) ? 'owned' : 'missing');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setState('error');
    }
  }, [enabled]);

  useEffect(() => {
    void check();
  }, [check, user?.id]);

  if (state === 'owned') return <>{children}</>;
  if (state === 'checking') {
    return (
      <div className="empty">
        <span className="spinner" />
      </div>
    );
  }

  return (
    <div className="auth-wrap">
      <div className="card auth-card stack">
        <div style={{ fontWeight: 800, letterSpacing: '0.08em' }}>LEGEND</div>
        {state === 'error' ? (
          <>
            <h1 style={{ margin: 0, fontSize: 'var(--fs-xl)' }}>Couldn’t check your purchase</h1>
            <Banner tone="error">{error}</Banner>
            <Button title="Try again" onClick={() => void check()} />
          </>
        ) : (
          <>
            <h1 style={{ margin: 0, fontSize: 'var(--fs-xl)' }}>Legend Desktop is part of the Full Suite</h1>
            <p className="muted" style={{ margin: 0 }}>
              {`${user?.email ?? 'This account'} doesn’t own Legend Full Suite yet. Buy it once in the Legend phone app — Settings → Legend Full Suite — and the download link is emailed to you. Then sign in here with the same account.`}
            </p>
            <Button title="I just bought it — check again" onClick={() => void check()} />
          </>
        )}
        <Button title="Sign out" variant="ghost" onClick={() => void signOut()} />
      </div>
    </div>
  );
}
