// app/(app)/(tabs)/profile.tsx
// The ME tab: your own contact card with a scannable QR (vCard — any phone
// camera adds it straight to its contacts app), plus the account section.
// The card IS a regular Legend contact designated as "me", so it shows in
// the list (with a ME badge) and is editable through the normal editor.

import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import { Screen } from '../../../src/components/Screen';
import { Text } from '../../../src/components/Text';
import { Card } from '../../../src/components/Card';
import { Button } from '../../../src/components/Button';
import { Avatar } from '../../../src/components/Avatar';
import { OptionSheet } from '../../../src/components/OptionSheet';
import { useAuth } from '../../../src/features/auth/AuthContext';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { isFeatureEnabled } from '../../../src/config/features';
import { useContacts } from '../../../src/features/contacts/ContactsContext';
import { useAppSettings } from '../../../src/features/settings/AppSettingsContext';
import { contactToVCard } from '../../../src/features/contacts/vcard';

export default function MeScreen() {
  const { user } = useAuth();
  const { spacing, colors, radius } = useTheme();
  const router = useRouter();
  const { contacts, contactById } = useContacts();
  const { meContactId, setMeContactId } = useAppSettings();
  const [pickerOpen, setPickerOpen] = useState(false);

  const me = meContactId ? contactById(meContactId) : undefined;
  const vcard = me ? contactToVCard(me) : null;

  const pickerOptions = [...contacts]
    .sort((a, b) => (a.lastName || a.firstName).localeCompare(b.lastName || b.firstName))
    .map((c) => ({
      key: c.id,
      label: `${c.firstName} ${c.lastName}`.trim() || c.nickname || 'Unnamed',
      detail: c.company ?? c.emails[0]?.address ?? c.phones[0]?.number,
      onPress: () => setMeContactId(c.id),
    }));

  return (
    <Screen scroll>
      <OptionSheet
        visible={pickerOpen}
        title="Which contact is you?"
        options={pickerOptions}
        onClose={() => setPickerOpen(false)}
      />

      <Text variant="label" tone="muted" style={{ marginBottom: spacing.sm }}>
        MY CARD
      </Text>

      {me && vcard ? (
        <Card style={{ marginBottom: spacing.xl, alignItems: 'center' }}>
          <Text variant="heading" weight="bold">
            {`${me.firstName} ${me.lastName}`.trim()}
          </Text>
          {(me.title || me.company) ? (
            <Text tone="muted">{[me.title, me.company].filter(Boolean).join(' · ')}</Text>
          ) : null}

          {/* White plate keeps the QR scannable in dark mode. */}
          <View
            style={{
              backgroundColor: '#FFFFFF',
              padding: spacing.md,
              borderRadius: radius.md,
              marginVertical: spacing.lg,
            }}
          >
            <QRCode value={vcard} size={196} backgroundColor="#FFFFFF" color="#000000" />
          </View>
          <Text variant="caption" tone="muted" center style={{ marginBottom: spacing.md }}>
            Point any phone camera here — your name, numbers, and emails land straight in their contacts.
          </Text>

          {me.phones.map((p, i) => (
            <Text key={`p${i}`} variant="label" tone="muted">{`${p.label}: ${p.number}`}</Text>
          ))}
          {me.emails.map((e, i) => (
            <Text key={`e${i}`} variant="label" tone="muted">{`${e.label}: ${e.address}`}</Text>
          ))}

          <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg, alignSelf: 'stretch' }}>
            <View style={{ flex: 1 }}>
              <Button
                title="Edit my card"
                variant="secondary"
                onPress={() => router.push({ pathname: '/contact/edit', params: { id: me.id } })}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button title="Change" variant="ghost" onPress={() => setPickerOpen(true)} />
            </View>
          </View>
        </Card>
      ) : (
        <Card style={{ marginBottom: spacing.xl }}>
          <Text weight="semibold">Set up your card</Text>
          <Text variant="caption" tone="muted" style={{ marginBottom: spacing.md }}>
            Pick which contact is you (or create one) to get a QR code that shares your details with a
            camera scan. Your card is marked ME in the contact list and can sit out of bulk messages.
          </Text>
          <View style={{ gap: spacing.sm }}>
            <Button
              title="Create my card"
              onPress={() => router.push({ pathname: '/contact/edit', params: { me: '1' } })}
            />
            <Button
              title="Choose an existing contact"
              variant="secondary"
              onPress={() => setPickerOpen(true)}
              disabled={contacts.length === 0}
            />
          </View>
        </Card>
      )}

      <Text variant="label" tone="muted" style={{ marginBottom: spacing.sm }}>
        ACCOUNT
      </Text>
      <Card style={{ marginBottom: spacing.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <Avatar uri={user?.avatarUrl} name={user?.displayName} size={48} />
          <View style={{ flex: 1 }}>
            <Text weight="semibold">{user?.displayName}</Text>
            <Text variant="caption" tone="muted">{user?.email}</Text>
          </View>
        </View>
        <Button
          title="Edit profile"
          variant="secondary"
          style={{ marginTop: spacing.md }}
          onPress={() => router.push('/(app)/profile/edit')}
        />
      </Card>

      {isFeatureEnabled('payments') ? (
        <Button
          title="Manage subscription"
          variant="secondary"
          onPress={() => router.push('/(app)/subscription')}
        />
      ) : null}
    </Screen>
  );
}
