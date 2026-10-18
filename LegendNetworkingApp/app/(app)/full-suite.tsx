// app/(app)/full-suite.tsx
// Legend Full Suite: buy once on the App Store / Google Play, get Legend for
// Windows, macOS and Linux. On purchase the server verifies the store
// receipt and emails the download link to the account's address; this
// screen also restores purchases (Apple requires it for non-consumables) and
// re-sends the email. Logic lives in src/features/suite/suiteService.ts.

import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../src/components/Screen';
import { Text } from '../../src/components/Text';
import { Card } from '../../src/components/Card';
import { Button } from '../../src/components/Button';
import { Banner } from '../../src/components/Banner';
import { useAuth } from '../../src/features/auth/AuthContext';
import { useTheme } from '../../src/theme/ThemeProvider';
import {
  hasFullSuite,
  iap,
  fullSuiteSku,
  loadProduct,
  resendDownloadLink,
  restoreFullSuite,
  startPurchase,
  verifyAndFinish,
  type StoreProduct,
} from '../../src/features/suite/suiteService';

const PERKS: { icon: 'desktop-outline' | 'git-network-outline' | 'swap-horizontal-outline' | 'mail-outline'; text: string }[] = [
  { icon: 'desktop-outline', text: 'Legend for Windows, macOS and Linux — every phone feature on a big screen.' },
  { icon: 'git-network-outline', text: 'The 3D Network map: your contacts, premises and Knows Connections in one view.' },
  { icon: 'swap-horizontal-outline', text: 'Same account on every device. With Legend Sync, your network follows you.' },
  { icon: 'mail-outline', text: 'Pay once. The download link is emailed to you right after purchase.' },
];

export default function FullSuiteScreen() {
  const { user } = useAuth();
  const { colors, spacing } = useTheme();
  const [owned, setOwned] = useState<boolean | null>(null);
  const [product, setProduct] = useState<StoreProduct | null>(null);
  const [storeReady, setStoreReady] = useState(iap() !== null);
  const [busy, setBusy] = useState<'buy' | 'restore' | 'email' | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refreshOwned = useCallback(async () => {
    try {
      setOwned(await hasFullSuite());
    } catch (e) {
      setOwned(false);
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void refreshOwned();
    void loadProduct()
      .then((p) => {
        setProduct(p);
        if (!p) setStoreReady(false);
      })
      .catch(() => setStoreReady(false));
  }, [refreshOwned]);

  // Purchase outcomes (including transactions StoreKit replays after an
  // interrupted purchase) arrive here: verify on the server, then finish.
  useEffect(() => {
    const m = iap();
    if (!m) return;
    const ok = m.purchaseUpdatedListener((purchase) => {
      if (purchase.productId !== fullSuiteSku()) return;
      setBusy('buy');
      void verifyAndFinish(purchase)
        .then((r) => {
          setOwned(true);
          setError('');
          setNotice(
            r.emailedTo
              ? `You own Legend Full Suite. We emailed the download link to ${r.emailedTo}.`
              : r.emailError
                ? `You own Legend Full Suite, but the email didn't send (${r.emailError}). Tap “Email me the link”.`
                : 'You own Legend Full Suite.',
          );
        })
        .catch((e) => setError(e instanceof Error ? e.message : String(e)))
        .finally(() => setBusy(null));
    });
    const failed = m.purchaseErrorListener((e) => {
      setBusy(null);
      if (String(e.code) !== 'user-cancelled') setError(e.message);
    });
    return () => {
      ok.remove();
      failed.remove();
    };
  }, []);

  const buy = async () => {
    if (!user) return;
    setError('');
    setNotice('');
    setBusy('buy');
    try {
      await startPurchase(user.id);
    } catch (e) {
      setBusy(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const restore = async () => {
    setError('');
    setNotice('');
    setBusy('restore');
    try {
      const r = await restoreFullSuite();
      if (r?.owned) {
        setOwned(true);
        setNotice('Purchase restored.');
      } else {
        await refreshOwned();
        setNotice('No Legend Full Suite purchase was found for this store account.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const email = async () => {
    setError('');
    setNotice('');
    setBusy('email');
    try {
      const r = await resendDownloadLink();
      setNotice(`Sent — check ${r.emailedTo} (and your spam folder).`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen scroll>
      <Stack.Screen options={{ title: 'Legend Full Suite' }} />
      <Text variant="title" weight="bold">Legend on your computer</Text>
      <Text tone="muted" style={{ marginTop: spacing.xs, marginBottom: spacing.lg }}>
        One purchase unlocks Legend for Windows, macOS and Linux.
      </Text>

      <Card style={{ gap: spacing.md, marginBottom: spacing.lg }}>
        {PERKS.map((p) => (
          <View key={p.icon} style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}>
            <Ionicons name={p.icon} size={20} color={colors.primary} />
            <Text style={{ flex: 1 }}>{p.text}</Text>
          </View>
        ))}
      </Card>

      <Banner kind="error" message={error} />
      <Banner kind="success" message={notice} />

      {owned === null ? (
        <Text tone="muted">Checking your purchase…</Text>
      ) : owned ? (
        <Card style={{ gap: spacing.sm, marginTop: spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <Ionicons name="checkmark-circle" size={22} color={colors.success} />
            <Text weight="semibold">You own Legend Full Suite</Text>
          </View>
          <Text variant="caption" tone="muted">
            {`The download link goes to ${user?.email ?? 'your account email'}. On your computer, install Legend and sign in with this same account.`}
          </Text>
          <Button title="Email me the download link" loading={busy === 'email'} onPress={() => void email()} />
        </Card>
      ) : (
        <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
          {storeReady ? (
            <Button
              title={product?.displayPrice ? `Buy for ${product.displayPrice}` : 'Buy Legend Full Suite'}
              loading={busy === 'buy'}
              disabled={!product || busy !== null}
              onPress={() => void buy()}
            />
          ) : (
            <Banner
              kind="info"
              message="Purchases aren't available in this build. Install Legend from the App Store or Google Play to buy the Full Suite."
            />
          )}
          <Text variant="caption" tone="muted" center>
            {`One-time purchase, tied to your Legend account (${user?.email ?? 'signed in'}). The download link is emailed to that address.`}
          </Text>
        </View>
      )}

      {storeReady ? (
        <Button
          title="Restore purchase"
          variant="ghost"
          loading={busy === 'restore'}
          disabled={busy !== null && busy !== 'restore'}
          style={{ marginTop: spacing.lg }}
          onPress={() => void restore()}
        />
      ) : null}
    </Screen>
  );
}
