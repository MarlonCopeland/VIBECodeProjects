// app/(app)/subscription.tsx
// Vendor subscription tiers backed by the pluggable payment provider (Stripe
// when configured, otherwise the local mock). A subscription belongs to the
// acting user's VENDOR record and drives the weekly broadcast quota.

import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Screen } from '../../src/components/Screen';
import { Text } from '../../src/components/Text';
import { Card } from '../../src/components/Card';
import { Button } from '../../src/components/Button';
import { Banner } from '../../src/components/Banner';
import { useAuth } from '../../src/features/auth/AuthContext';
import { useTheme } from '../../src/theme/ThemeProvider';
import { TIERS, paymentProvider, type Subscription, type Tier } from '../../src/features/payments';
import { getVendorByOwner } from '../../src/features/vendors/vendorService';
import { useAsyncAction } from '../../src/lib/useAsyncAction';

export default function SubscriptionScreen() {
  const { user } = useAuth();
  const { colors, spacing } = useTheme();

  const [vendorId, setVendorId] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  // Each tier card spins on its own, keyed by tier id.
  const { error, isBusy, run, setError } = useAsyncAction();

  const fetchSubscription = useCallback(async () => {
    if (!user) return;
    const vendor = await getVendorByOwner(user.id);
    if (!vendor) {
      setError('No vendor record found for your account.');
      return;
    }
    setVendorId(vendor.id);
    setSubscription(await paymentProvider.getSubscription(vendor.id));
  }, [user, setError]);

  useFocusEffect(
    useCallback(() => {
      void run(fetchSubscription);
    }, [run, fetchSubscription]),
  );

  const choose = (tier: Tier) => {
    if (!vendorId) return;
    return run(async () => {
      const result = await paymentProvider.startCheckout(vendorId, tier);
      if (result.subscription) setSubscription(result.subscription);
    }, tier.id);
  };

  return (
    <Screen scroll>
      <Banner kind="error" message={error} />
      {subscription ? (
        <Text tone="muted" style={{ marginBottom: spacing.lg }}>
          {`Current plan: ${subscription.tier} (${subscription.status})`}
        </Text>
      ) : null}

      <View style={{ gap: spacing.lg }}>
        {TIERS.map((tier) => {
          const current = subscription?.tier === tier.id;
          return (
            <Card key={tier.id} style={current ? { borderColor: colors.primary, borderWidth: 2 } : undefined}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text variant="heading" weight="semibold">
                  {tier.name}
                </Text>
                <Text variant="heading" tone="primary" weight="bold">
                  {tier.priceLabel}
                </Text>
              </View>
              <View style={{ marginTop: spacing.md, gap: spacing.xs }}>
                {tier.features.map((f) => (
                  <Text key={f} tone="muted">
                    {`• ${f}`}
                  </Text>
                ))}
              </View>
              <View style={{ marginTop: spacing.lg }}>
                <Button
                  title={current ? 'Current plan' : tier.id === 'free' ? 'Downgrade' : 'Choose plan'}
                  variant={current ? 'secondary' : 'primary'}
                  disabled={current || !vendorId}
                  loading={isBusy(tier.id)}
                  onPress={() => choose(tier)}
                />
              </View>
            </Card>
          );
        })}
      </View>
    </Screen>
  );
}
