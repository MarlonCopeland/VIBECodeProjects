// src/screens/settings/SettingsScreen.tsx
// App settings — mirrors the phone's app/(app)/(tabs)/settings.tsx:
// appearance, contacts default view, grading/rarity/templates links, the
// leave-me-out-of-bulk toggle, sync, CSV export, account actions, support
// email, tutorial, and about. Push notifications don't exist on desktop, so
// that section is dropped; CSV export saves through native Save dialogs
// instead of the phone's share sheet.

import { useState, type ReactNode } from 'react';
import {
  BarChart3,
  Bug,
  ChevronRight,
  ExternalLink,
  FileText,
  Info,
  Lightbulb,
  Mail,
  Palette,
  PlayCircle,
  RefreshCw,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import { useAuth } from '@legend/features/auth/AuthContext';
import { useContacts } from '@legend/features/contacts/ContactsContext';
import { useAppSettings } from '@legend/features/settings/AppSettingsContext';
import { contactsToCsv, interactionsToCsv } from '@legend/features/contacts/importExport';
import { profileService } from '@legend/features/profile';
import { isFeatureEnabled } from '@legend/config/features';
import { toAppError } from '@legend/lib/errors';
import { confirm, notify } from '@legend/lib/notify';
import { useRouter } from '../../app/router';
import { useDesktopTheme, type ColorSchemePreference } from '../../app/theme';
import { openExternal } from '../../platform/bridge';
import { saveTextFile } from '../../platform/files';
import { Button, Card, Page, SectionLabel, Segmented, Toggle } from '../../ui/components';

const THEME_OPTIONS: { id: ColorSchemePreference; label: string }[] = [
  { id: 'system', label: 'System' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
];

const PRIVACY_URL = 'https://unjaded.net/legend/privacy_policy.html';
const ABOUT_URL = 'https://unjaded.net/legend/about';
const SUPPORT_EMAIL = 'marlon.unjaded@gmail.com';

function platformName(): string {
  const p = window.legend?.platform;
  return p === 'win32' ? 'Windows' : p === 'darwin' ? 'macOS' : p === 'linux' ? 'Linux' : p ?? 'desktop';
}

/** Desktop has no expo-application build info; say what we do know. */
function appVersionLine(): string {
  return `Legend desktop · ${platformName()}${import.meta.env.DEV ? ' · development build' : ''}`;
}

const gap = (n: 'sm' | 'md' | 'lg' | 'xl') => ({ marginBottom: `var(--s-${n})` });

function NavRow({
  icon,
  title,
  subtitle,
  trailing,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="card list-row"
      aria-label={title}
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--s-md)',
        width: '100%',
        textAlign: 'left',
        cursor: 'pointer',
        padding: 'var(--s-md)',
      }}
    >
      <span style={{ color: 'var(--primary)', display: 'flex' }}>{icon}</span>
      <span className="grow">
        <span style={{ display: 'block', fontWeight: 600 }}>{title}</span>
        {subtitle ? <span className="small muted">{subtitle}</span> : null}
      </span>
      <span className="muted" style={{ display: 'flex' }}>
        {trailing ?? <ChevronRight size={16} />}
      </span>
    </button>
  );
}

export default function SettingsScreen() {
  const { navigate } = useRouter();
  const { user, signOut } = useAuth();
  const { preference, setPreference } = useDesktopTheme();
  const { contacts, interactions } = useContacts();
  const { meContactId, excludeMeFromBulk, setExcludeMeFromBulk, contactsDefaultView, setContactsDefaultView } =
    useAppSettings();
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const contactsPath = await saveTextFile('contacts.csv', contactsToCsv(contacts));
      if (!contactsPath) return; // canceled
      const interactionsPath = await saveTextFile('interactions.csv', interactionsToCsv(contacts, interactions));
      notify(
        'Export complete',
        interactionsPath
          ? `Saved contacts.csv and interactions.csv.\n\n${contactsPath}\n${interactionsPath}`
          : `Saved contacts.csv (interactions.csv was skipped).\n\n${contactsPath}`,
      );
    } catch (e) {
      notify('Export failed', e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(false);
    }
  };

  const doDelete = async () => {
    if (!user) return;
    setBusy(true);
    try {
      await profileService.deleteAccount(user.id);
    } catch (e) {
      notify('Error', toAppError(e).message);
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = () =>
    confirm('Delete account', 'This permanently deletes your account and data. This cannot be undone.', () => void doDelete());

  const emailSupport = async (kind: 'bug' | 'suggestion') => {
    const platform = `${platformName()} desktop`;
    const subject = kind === 'bug' ? 'Legend bug report (desktop)' : 'Legend suggestion (desktop)';
    const body =
      kind === 'bug'
        ? `What happened?\n\n\nWhat did you expect?\n\n\n—\nApp: Legend desktop\nPlatform: ${platform}`
        : `Your idea:\n\n\n—\nApp: Legend desktop\nPlatform: ${platform}`;
    const url = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    try {
      const ok = await openExternal(url);
      if (!ok) throw new Error('no handler');
    } catch {
      notify('No mail app found', `Email us directly at ${SUPPORT_EMAIL}.`);
    }
  };

  return (
    <Page title="Settings" narrow>
      <SectionLabel style={gap('sm')}>Appearance</SectionLabel>
      <Card style={gap('xl')}>
        <div className="row">
          <div className="grow" style={{ fontWeight: 600 }}>Theme</div>
          <Segmented value={preference} options={THEME_OPTIONS} onChange={setPreference} />
        </div>
      </Card>

      <SectionLabel style={gap('sm')}>Contacts</SectionLabel>
      <Card style={gap('xl')}>
        <div className="row" style={{ gap: 'var(--s-md)' }}>
          <div className="grow">
            <div style={{ fontWeight: 600 }}>Open the Contacts tab on</div>
            <div className="small muted">
              Recent puts the people you've touched latest on top, with one-click call, text, and email.
            </div>
          </div>
          <Segmented
            value={contactsDefaultView}
            options={[
              { id: 'all', label: 'All (A–Z)' },
              { id: 'recent', label: 'Recent' },
            ]}
            onChange={setContactsDefaultView}
          />
        </div>
      </Card>

      <SectionLabel style={gap('sm')}>Scoring &amp; grading</SectionLabel>
      <div className="stack" style={{ gap: 'var(--s-sm)', ...gap('xl') }}>
        <NavRow
          icon={<BarChart3 size={20} />}
          title="Grading & scoring"
          subtitle="Interaction weights, decay, tier thresholds"
          onClick={() => navigate('/settings/grading')}
        />
        <NavRow
          icon={<Palette size={20} />}
          title="Rarity colors"
          subtitle="Choose a tier palette · premium options"
          onClick={() => navigate('/settings/rarity')}
        />
      </div>

      <SectionLabel style={gap('sm')}>Outreach</SectionLabel>
      <div style={gap('md')}>
        <NavRow
          icon={<FileText size={20} />}
          title="Message templates"
          subtitle="Saved texts & emails for blasts"
          onClick={() => navigate('/settings/templates')}
        />
      </div>
      <Card style={gap('xl')}>
        <div className="row" style={{ gap: 'var(--s-md)' }}>
          <div className="grow">
            <div style={{ fontWeight: 600 }}>Leave me out of bulk messages</div>
            <div className="small muted">
              {meContactId
                ? 'Your ME card is skipped by text blasts, email blasts, and call lists.'
                : 'Takes effect once you set up your card on the Me page.'}
            </div>
          </div>
          <Toggle label="Leave me out of bulk messages" on={excludeMeFromBulk} onChange={setExcludeMeFromBulk} />
        </div>
      </Card>

      {isFeatureEnabled('sync') ? (
        <>
          <SectionLabel style={gap('sm')}>Sync</SectionLabel>
          <div style={gap('xl')}>
            <NavRow
              icon={<RefreshCw size={20} />}
              title="Legend Sync"
              subtitle="Encrypted backup & multi-device sync · upgrade"
              onClick={() => navigate('/settings/sync')}
            />
          </div>
        </>
      ) : null}

      <SectionLabel style={gap('sm')}>Your data</SectionLabel>
      <Card style={gap('xl')}>
        <div style={{ fontWeight: 600 }}>Export everything</div>
        <div className="small muted" style={gap('md')}>
          {`Saves contacts.csv and interactions.csv — your whole network (${contacts.length} contact${contacts.length === 1 ? '' : 's'}), yours to keep.`}
        </div>
        <div className="row wrap">
          <Button
            title="Export contacts to CSV"
            variant="secondary"
            loading={exporting}
            onClick={() => void exportCsv()}
          />
          <Button
            title="Import from CSV"
            variant="ghost"
            icon={<Upload size={16} />}
            onClick={() => navigate('/import')}
          />
        </div>
      </Card>

      <SectionLabel style={gap('sm')}>Account</SectionLabel>
      <div className="stack" style={gap('xl')}>
        <Button title="Sign out" variant="secondary" block onClick={() => void signOut()} />
        <Button title="Delete account" variant="danger" block onClick={confirmDelete} loading={busy} />
      </div>

      <SectionLabel style={gap('sm')}>Support</SectionLabel>
      <div className="stack" style={{ gap: 'var(--s-sm)', ...gap('xl') }}>
        <NavRow
          icon={<Bug size={20} />}
          title="Report a bug"
          subtitle="Something broken? Email us the details"
          trailing={<Mail size={16} />}
          onClick={() => void emailSupport('bug')}
        />
        <NavRow
          icon={<Lightbulb size={20} />}
          title="Share a suggestion"
          subtitle="Ideas to make Legend better"
          trailing={<Mail size={16} />}
          onClick={() => void emailSupport('suggestion')}
        />
        <NavRow
          icon={<PlayCircle size={20} />}
          title="View the tutorial"
          subtitle="Replay the intro to Legend"
          onClick={() => navigate('/tutorial')}
        />
      </div>

      <SectionLabel style={gap('sm')}>About</SectionLabel>
      <div className="stack" style={{ gap: 'var(--s-sm)', ...gap('xl') }}>
        <NavRow
          icon={<ShieldCheck size={20} />}
          title="Privacy policy"
          trailing={<ExternalLink size={16} />}
          onClick={() => void openExternal(PRIVACY_URL)}
        />
        <NavRow
          icon={<Info size={20} />}
          title="About Legend"
          trailing={<ExternalLink size={16} />}
          onClick={() => void openExternal(ABOUT_URL)}
        />
      </div>

      <div
        className="small muted"
        style={{ padding: 'var(--s-md)', borderRadius: 'var(--r-md)', background: 'var(--surface-alt)' }}
      >
        <div>Legend by Unjaded Digital Products · signed in as {user?.email}</div>
        <div>{appVersionLine()}</div>
      </div>
    </Page>
  );
}
