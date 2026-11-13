// src/screens/settings/SubscriptionScreen.tsx
// Subscription tiers — mirrors the phone's app/(app)/subscription.tsx.
// Backed by the pluggable payment provider (Stripe when configured,
// otherwise the local mock): shows the current plan, lets the user upgrade,
// and opens the provider's management portal.

import { useEffect, useState } from 'react';
import { useAuth } from '@legend/features/auth/AuthContext';
import { TIERS, paymentProvider, type Subscription, type Tier } from '@legend/features/payments';
import { toAppError } from '@legend/lib/errors';
import { BackButton } from '../../app/router';
import { Banner, Button, Card, Page } from '../../ui/components';

export default function SubscriptionScreen() {
  const { user } = useAuth();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [error, setError] = useState('');
  const [busyTier, setBusyTier] = useState<string | null>(null);
  const [managing, setManaging] = useState(false);

  useEffect(() => {
    if (!user) return;
    void paymentProvider.getSubscription(user.id).then(setSubscription).catch(() => {});
  }, [user]);

  const choose = async (tier: Tier) => {
    if (!user) return;
    setError('');
    setBusyTier(tier.id);
    try {
      const result = await paymentProvider.startCheckout(user.id, tier);
      if (result.subscription) setSubscription(result.subscription);
    } catch (e) {
      setError(toAppError(e).message);
    } finally {
      setBusyTier(null);
    }
  };

  const manage = async () => {
    if (!user) return;
    setError('');
    setManaging(true);
    try {
      await paymentProvider.openManagement(user.id);
    } catch (e) {
      setError(toAppError(e).message);
    } finally {
      setManaging(false);
    }
  };

  const paid = !!subscription && subscription.tier !== 'free' && subscription.status !== 'none';

  return (
    <Page
      title="Subscription"
      narrow
      back={<BackButton fallback="/profile" />}
      actions={
        paid ? <Button title="Manage billing" variant="secondary" loading={managing} onClick={() => void manage()} /> : undefined
      }
    >
      {error ? <Banner tone="error">{error}</Banner> : null}
      {subscription ? (
        <p className="muted" style={{ marginTop: 0, marginBottom: 'var(--s-lg)' }}>
          {`Current plan: ${subscription.tier} (${subscription.status})`}
        </p>
      ) : null}

      <div className="stack" style={{ gap: 'var(--s-lg)' }}>
        {TIERS.map((tier) => {
          const current = subscription?.tier === tier.id;
          return (
            <Card key={tier.id} style={current ? { border: '2px solid var(--primary)' } : undefined}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span style={{ fontSize: 'var(--fs-lg)', fontWeight: 600 }}>{tier.name}</span>
                <span style={{ fontSize: 'var(--fs-lg)', fontWeight: 700, color: 'var(--primary)' }}>{tier.priceLabel}</span>
              </div>
              <ul className="muted" style={{ margin: 'var(--s-md) 0 0', paddingLeft: 'var(--s-lg)' }}>
                {tier.features.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
              <Button
                title={current ? 'Current plan' : tier.id === 'free' ? 'Downgrade' : 'Choose plan'}
                variant={current ? 'secondary' : 'primary'}
                block
                style={{ marginTop: 'var(--s-lg)' }}
                disabled={current}
                loading={busyTier === tier.id}
                onClick={() => void choose(tier)}
              />
            </Card>
          );
        })}
      </div>
    </Page>
  );
}
