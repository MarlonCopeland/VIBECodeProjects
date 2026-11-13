// src/screens/settings/SyncScreen.tsx
// Legend Sync — mirrors the phone's app/(app)/settings/sync.tsx: opt-in,
// paid upgrade (monthly / yearly-at-a-discount). Local data is always
// authoritative (SYNC_DESIGN.md); subscribing unlocks the encrypted
// change-log relay, and a per-device toggle opts this device in. Beta
// behavior is honest: unlocking is free (source='beta' rows only) until
// billing lands. The recovery key is shown as copyable text (as on the phone).

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Copy, RefreshCw } from 'lucide-react';
import { useAppSettings } from '@legend/features/settings/AppSettingsContext';
import { useSync } from '@legend/features/sync/SyncProvider';
import { exportRecoveryKey, importRecoveryKey } from '@legend/features/sync/vaultKey';
import {
  SYNC_PLANS,
  cancelSyncSubscription,
  getSyncSubscription,
  isSubscriptionActive,
  isSyncAvailable,
  subscribeToSyncBeta,
  type SyncPlanId,
  type SyncSubscription,
} from '@legend/features/sync/subscriptionService';
import { notify } from '@legend/lib/notify';
import { BackButton } from '../../app/router';
import { Button, Card, Page, SectionLabel, TextField, Toggle } from '../../ui/components';

export default function SyncScreen() {
  const { syncEnabled, setSyncEnabled } = useAppSettings();
  const { syncState, syncNow, recheckEntitlement } = useSync();
  const [subscription, setSubscription] = useState<SyncSubscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyPlan, setBusyPlan] = useState<SyncPlanId | null>(null);
  const [canceling, setCanceling] = useState(false);
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const [importing, setImporting] = useState(false);

  const revealKey = async () => {
    try {
      setRecoveryKey(await exportRecoveryKey());
    } catch (e) {
      notify('Could not load key', e instanceof Error ? e.message : String(e));
    }
  };

  const copyKey = async () => {
    if (!recoveryKey) return;
    try {
      await navigator.clipboard.writeText(recoveryKey);
      notify('Copied', 'Recovery key copied — store it somewhere safe.');
    } catch (e) {
      notify('Could not copy', e instanceof Error ? e.message : String(e));
    }
  };

  const doImportKey = async () => {
    setImporting(true);
    try {
      await importRecoveryKey(keyInput);
      setKeyInput('');
      setRecoveryKey(null);
      notify('Key installed', 'This device now uses the imported recovery key.');
      void syncNow();
    } catch (e) {
      notify('Invalid key', e instanceof Error ? e.message : String(e));
    } finally {
      setImporting(false);
    }
  };

  const available = isSyncAvailable();
  const active = isSubscriptionActive(subscription);

  const load = useCallback(async () => {
    if (!available) {
      setLoading(false);
      return;
    }
    try {
      setSubscription(await getSyncSubscription());
    } catch (e) {
      notify('Could not load subscription', e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [available]);

  useEffect(() => {
    void load();
  }, [load]);

  const subscribe = async (plan: SyncPlanId) => {
    setBusyPlan(plan);
    try {
      setSubscription(await subscribeToSyncBeta(plan));
      await recheckEntitlement();
      notify('Sync unlocked (beta)', 'Free during beta — billing arrives with the store release.');
    } catch (e) {
      notify('Could not subscribe', e instanceof Error ? e.message : String(e));
    } finally {
      setBusyPlan(null);
    }
  };

  const cancel = async () => {
    setCanceling(true);
    try {
      await cancelSyncSubscription();
      setSyncEnabled(false);
      await load();
      await recheckEntitlement();
      notify('Subscription canceled', 'Sync is off. Your local data is untouched.');
    } catch (e) {
      notify('Could not cancel', e instanceof Error ? e.message : String(e));
    } finally {
      setCanceling(false);
    }
  };

  return (
    <Page title="Legend Sync" narrow back={<BackButton fallback="/settings" />}>
      <Card style={{ marginBottom: 'var(--s-xl)' }}>
        <div className="row" style={{ marginBottom: 'var(--s-sm)' }}>
          <RefreshCw size={20} style={{ color: 'var(--primary)' }} />
          <span style={{ fontWeight: 600 }}>Your data stays yours</span>
        </div>
        <div className="small muted">
          Legend is local-first: everything lives on this device and works fully offline, always. Sync is an
          optional upgrade that backs up your network and keeps your devices in step by relaying an
          end-to-end-encrypted change log — the server only ever sees ciphertext, never your contacts.
        </div>
      </Card>

      {!available ? (
        <Card>
          <div style={{ fontWeight: 600, marginBottom: 'var(--s-xs)' }}>Not available in this build</div>
          <div className="small muted">
            This build uses the offline demo backend, which has no server to sync with. Sync is available in
            builds connected to a Legend account backend.
          </div>
        </Card>
      ) : loading ? (
        <Card>
          <div className="row muted">
            <span className="spinner" /> Loading subscription…
          </div>
        </Card>
      ) : active ? (
        <>
          <Card style={{ marginBottom: 'var(--s-xl)', border: '2px solid var(--primary)' }}>
            <div className="row" style={{ alignItems: 'flex-start' }}>
              <CheckCircle2 size={20} style={{ color: 'var(--primary)', flexShrink: 0 }} />
              <div className="grow">
                <div style={{ fontWeight: 600 }}>
                  Sync unlocked — {subscription?.plan === 'yearly' ? 'Yearly' : 'Monthly'} plan
                </div>
                <div className="small muted">
                  {subscription?.source === 'beta'
                    ? 'Free during beta. Billing starts with the store release; you can cancel any time.'
                    : 'Active subscription.'}
                </div>
              </div>
            </div>
          </Card>

          <SectionLabel style={{ marginBottom: 'var(--s-sm)' }}>This device</SectionLabel>
          <Card style={{ marginBottom: 'var(--s-xl)' }}>
            <div className="row" style={{ gap: 'var(--s-md)' }}>
              <div className="grow">
                <div style={{ fontWeight: 600 }}>Sync on this device</div>
                <div className="small muted">
                  Opt this device into encrypted backup and multi-device sync. Changes push automatically as you
                  work and pull live from your other devices.
                </div>
              </div>
              <Toggle label="Sync on this device" on={syncEnabled} onChange={setSyncEnabled} />
            </div>
          </Card>

          {syncEnabled ? (
            <>
              <Card style={{ marginBottom: 'var(--s-xl)' }}>
                <div className="row" style={{ gap: 'var(--s-md)' }}>
                  <div className="grow">
                    <div style={{ fontWeight: 600 }}>
                      {syncState.status === 'syncing'
                        ? 'Syncing…'
                        : syncState.status === 'error'
                          ? 'Sync problem'
                          : 'Up to date'}
                    </div>
                    <div className={`small ${syncState.status === 'error' ? 'danger-text' : 'muted'}`}>
                      {syncState.status === 'error'
                        ? syncState.error
                        : syncState.lastSyncedAt
                          ? `Last synced ${new Date(syncState.lastSyncedAt).toLocaleString()}`
                          : 'Not synced yet on this device.'}
                    </div>
                  </div>
                  <Button
                    title="Sync now"
                    variant="secondary"
                    loading={syncState.status === 'syncing'}
                    onClick={() => void syncNow()}
                  />
                </div>
              </Card>

              <SectionLabel style={{ marginBottom: 'var(--s-sm)' }}>Encryption key</SectionLabel>
              <Card style={{ marginBottom: 'var(--s-xl)' }}>
                <div style={{ fontWeight: 600, marginBottom: 'var(--s-xs)' }}>Recovery key</div>
                <div className="small muted" style={{ marginBottom: 'var(--s-md)' }}>
                  Your data is encrypted on this device before it leaves — the server (and we) can never read it.
                  This key is the ONLY way another device, or a future you, can decrypt it. Save it somewhere safe;
                  losing every device means losing the backup.
                </div>
                {recoveryKey ? (
                  <>
                    <div
                      style={{
                        padding: 'var(--s-md)',
                        borderRadius: 'var(--r-md)',
                        background: 'var(--surface-alt)',
                        marginBottom: 'var(--s-md)',
                        fontFamily: 'Consolas, ui-monospace, monospace',
                        wordBreak: 'break-all',
                        userSelect: 'all',
                      }}
                    >
                      {recoveryKey}
                    </div>
                    <div className="row">
                      <Button title="Copy key" variant="secondary" icon={<Copy size={16} />} onClick={() => void copyKey()} />
                      <Button title="Hide" variant="ghost" onClick={() => setRecoveryKey(null)} />
                    </div>
                  </>
                ) : (
                  <Button title="Reveal recovery key" variant="secondary" onClick={() => void revealKey()} />
                )}

                <div className="divider" style={{ margin: 'var(--s-lg) 0' }} />

                <div style={{ fontWeight: 600, marginBottom: 'var(--s-xs)' }}>Linking this device?</div>
                <div className="small muted" style={{ marginBottom: 'var(--s-md)' }}>
                  Paste the recovery key from the device that set up sync so both encrypt with the same key.
                </div>
                <form
                  className="stack"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void doImportKey();
                  }}
                >
                  <TextField
                    label="Recovery key"
                    value={keyInput}
                    onChange={(e) => setKeyInput(e.target.value)}
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder="Paste key from your other device"
                  />
                  <div>
                    <Button type="submit" title="Use this key" variant="secondary" loading={importing} />
                  </div>
                </form>
              </Card>
            </>
          ) : null}

          <Button title="Cancel subscription" variant="danger" loading={canceling} onClick={() => void cancel()} />
        </>
      ) : (
        <>
          <SectionLabel style={{ marginBottom: 'var(--s-sm)' }}>Choose a plan</SectionLabel>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: 'var(--s-md)',
              marginBottom: 'var(--s-lg)',
            }}
          >
            {SYNC_PLANS.map((plan) => (
              <Card key={plan.id}>
                <div className="row" style={{ marginBottom: 'var(--s-md)', alignItems: 'baseline' }}>
                  <div className="grow">
                    <div style={{ fontWeight: 600 }}>{plan.name}</div>
                    {plan.note ? (
                      <div className="small" style={{ color: 'var(--primary)', fontWeight: 600 }}>{plan.note}</div>
                    ) : null}
                  </div>
                  <span style={{ fontSize: 'var(--fs-xl)', fontWeight: 700 }}>{plan.price}</span>
                  <span className="small muted">{plan.cadence}</span>
                </div>
                <Button
                  title={`Unlock with ${plan.name}`}
                  block
                  loading={busyPlan === plan.id}
                  onClick={() => void subscribe(plan.id)}
                />
              </Card>
            ))}
          </div>
          <div className="small muted">
            Free to unlock during beta — real billing arrives with the store release. Canceling never touches the
            data on your device.
          </div>
        </>
      )}
    </Page>
  );
}
