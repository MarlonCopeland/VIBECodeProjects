// src/screens/profile/ProfileScreen.tsx
// The ME page — mirrors the phone's app/(app)/(tabs)/profile.tsx: your own
// contact card plus the account section. The card IS a regular Legend
// contact designated as "me", editable through the normal contact editor.
// The phone renders the vCard as a scannable QR; desktop has no QR library,
// so the vCard is shown as text with Copy and "Save .vcf" instead.

import { useMemo, useState } from 'react';
import { Copy, Download, Search } from 'lucide-react';
import { useAuth } from '@legend/features/auth/AuthContext';
import { useContacts } from '@legend/features/contacts/ContactsContext';
import { useAppSettings } from '@legend/features/settings/AppSettingsContext';
import { contactToVCard } from '@legend/features/contacts/vcard';
import { isFeatureEnabled } from '@legend/config/features';
import { notify } from '@legend/lib/notify';
import { useRouter } from '../../app/router';
import { saveTextFile } from '../../platform/files';
import { Avatar, Button, Card, Modal, Page, SectionLabel } from '../../ui/components';

export default function ProfileScreen() {
  const { user } = useAuth();
  const { navigate } = useRouter();
  const { contacts, contactById } = useContacts();
  const { meContactId, setMeContactId } = useAppSettings();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState('');

  const me = meContactId ? contactById(meContactId) : undefined;
  const vcard = me ? contactToVCard(me) : null;
  const meName = me ? `${me.firstName} ${me.lastName}`.trim() || me.nickname || 'Unnamed' : '';

  const pickerOptions = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...contacts]
      .sort((a, b) => (a.lastName || a.firstName).localeCompare(b.lastName || b.firstName))
      .map((c) => ({
        id: c.id,
        label: `${c.firstName} ${c.lastName}`.trim() || c.nickname || 'Unnamed',
        detail: c.company ?? c.emails[0]?.address ?? c.phones[0]?.number,
      }))
      .filter((o) => !q || o.label.toLowerCase().includes(q) || (o.detail ?? '').toLowerCase().includes(q));
  }, [contacts, query]);

  const closePicker = () => {
    setPickerOpen(false);
    setQuery('');
  };

  const copyVCard = async () => {
    if (!vcard) return;
    try {
      await navigator.clipboard.writeText(vcard);
      notify('Copied', 'Your vCard is on the clipboard — paste it into an email, chat, or a .vcf file.');
    } catch (e) {
      notify('Could not copy', e instanceof Error ? e.message : String(e));
    }
  };

  const saveVCard = async () => {
    if (!vcard) return;
    const base = meName.replace(/[^\w\- ]+/g, '').trim() || 'my-card';
    try {
      await saveTextFile(`${base}.vcf`, vcard, [{ name: 'vCard', extensions: ['vcf'] }]);
    } catch (e) {
      notify('Could not save', e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Page title="Me" narrow>
      <Modal open={pickerOpen} title="Which contact is you?" onClose={closePicker} width={520}>
        <div className="stack">
          <div className="row" style={{ position: 'relative' }}>
            <Search size={16} className="muted" style={{ position: 'absolute', left: 10 }} />
            <input
              className="input"
              autoFocus
              placeholder="Search contacts"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ paddingLeft: 32, width: '100%' }}
            />
          </div>
          <div style={{ maxHeight: 420, overflowY: 'auto' }}>
            {pickerOptions.length === 0 ? (
              <div className="empty muted">No matching contacts.</div>
            ) : (
              pickerOptions.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  className={`list-row${o.id === meContactId ? ' active' : ''}`}
                  style={{ width: '100%', textAlign: 'left', border: 0, background: 'none', cursor: 'pointer' }}
                  onClick={() => {
                    setMeContactId(o.id);
                    closePicker();
                  }}
                >
                  <div className="grow">
                    <div className="ellipsis" style={{ fontWeight: 600 }}>{o.label}</div>
                    {o.detail ? <div className="small muted ellipsis">{o.detail}</div> : null}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </Modal>

      <SectionLabel style={{ marginBottom: 'var(--s-sm)' }}>My card</SectionLabel>

      {me && vcard ? (
        <Card style={{ marginBottom: 'var(--s-xl)' }}>
          <div className="stack" style={{ alignItems: 'center', textAlign: 'center' }}>
            <div>
              <div style={{ fontSize: 'var(--fs-xl)', fontWeight: 700 }}>{meName}</div>
              {me.title || me.company ? (
                <div className="muted">{[me.title, me.company].filter(Boolean).join(' · ')}</div>
              ) : null}
            </div>

            <pre
              style={{
                alignSelf: 'stretch',
                textAlign: 'left',
                margin: 0,
                padding: 'var(--s-md)',
                borderRadius: 'var(--r-md)',
                background: 'var(--surface-alt)',
                fontFamily: 'Consolas, ui-monospace, monospace',
                fontSize: 'var(--fs-xs)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                maxHeight: 220,
                overflowY: 'auto',
                userSelect: 'text',
              }}
            >
              {vcard}
            </pre>
            <div className="small muted">
              Share this vCard — your name, numbers, and emails land straight in anyone's contacts app.
              (The phone app shows it as a scannable QR code.)
            </div>
            <div className="row wrap" style={{ justifyContent: 'center' }}>
              <Button title="Copy vCard" variant="secondary" size="sm" icon={<Copy size={14} />} onClick={() => void copyVCard()} />
              <Button title="Save .vcf" variant="secondary" size="sm" icon={<Download size={14} />} onClick={() => void saveVCard()} />
            </div>

            {me.phones.length || me.emails.length ? (
              <div className="small muted">
                {me.phones.map((p, i) => (
                  <div key={`p${i}`}>{`${p.label}: ${p.number}`}</div>
                ))}
                {me.emails.map((e, i) => (
                  <div key={`e${i}`}>{`${e.label}: ${e.address}`}</div>
                ))}
              </div>
            ) : null}

            <div className="row" style={{ alignSelf: 'stretch' }}>
              <Button
                className="grow"
                title="Edit my card"
                variant="secondary"
                onClick={() => navigate(`/contact/${encodeURIComponent(me.id)}/edit`)}
              />
              <Button className="grow" title="Change" variant="ghost" onClick={() => setPickerOpen(true)} />
            </div>
          </div>
        </Card>
      ) : (
        <Card style={{ marginBottom: 'var(--s-xl)' }}>
          <div style={{ fontWeight: 600 }}>Set up your card</div>
          <div className="small muted" style={{ marginBottom: 'var(--s-md)' }}>
            Pick which contact is you (or create one) to get a vCard that shares your details in one go.
            Your card is marked ME in the contact list and can sit out of bulk messages.
          </div>
          <div className="stack" style={{ gap: 'var(--s-sm)' }}>
            <Button title="Create my card" block onClick={() => navigate('/contact/new', { me: '1' })} />
            <Button
              title="Choose an existing contact"
              variant="secondary"
              block
              onClick={() => setPickerOpen(true)}
              disabled={contacts.length === 0}
            />
          </div>
        </Card>
      )}

      <SectionLabel style={{ marginBottom: 'var(--s-sm)' }}>Account</SectionLabel>
      <Card style={{ marginBottom: 'var(--s-lg)' }}>
        <div className="row" style={{ gap: 'var(--s-md)' }}>
          <Avatar uri={user?.avatarUrl} name={user?.displayName} size={48} />
          <div className="grow">
            <div style={{ fontWeight: 600 }} className="ellipsis">{user?.displayName}</div>
            <div className="small muted ellipsis">{user?.email}</div>
          </div>
        </div>
        <Button
          title="Edit profile"
          variant="secondary"
          block
          style={{ marginTop: 'var(--s-md)' }}
          onClick={() => navigate('/profile/edit')}
        />
      </Card>

      {isFeatureEnabled('payments') ? (
        <Button title="Manage subscription" variant="secondary" block onClick={() => navigate('/subscription')} />
      ) : null}
    </Page>
  );
}
