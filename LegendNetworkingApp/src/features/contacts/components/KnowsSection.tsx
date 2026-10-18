// src/features/contacts/components/KnowsSection.tsx
// The "Knows" card on a contact's detail screen: strong links (tap to open
// that contact), loose suggestions for links whose other person was lost
// and re-imported (accept = relink by id), and lost links with no match.

import React from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../../../components/Card';
import { Text } from '../../../components/Text';
import { Avatar } from '../../../components/Avatar';
import { useTheme } from '../../../theme/ThemeProvider';
import { notify, confirm } from '../../../lib/notify';
import { useContacts } from '../ContactsContext';
import { describeMatch, displayNameOf } from '../knows';
import type { Contact } from '../types';

export function KnowsSection({ contact }: { contact: Contact }) {
  const router = useRouter();
  const { colors, spacing, radius } = useTheme();
  const { knowsFor, relinkKnows, removeKnows } = useContacts();
  const { linked, suggested, lost } = knowsFor(contact.id);
  const firstName = contact.firstName || displayNameOf(contact) || 'them';

  const fail = (title: string) => (e: unknown) => notify(title, e instanceof Error ? e.message : String(e));

  const smallButton = (label: string, onPress: () => void, tone: 'primary' | 'muted' = 'primary') => (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => ({
        paddingVertical: 4,
        paddingHorizontal: spacing.sm,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: tone === 'primary' ? colors.primary : colors.border,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Text variant="caption" tone={tone} weight="semibold">{label}</Text>
    </Pressable>
  );

  return (
    <Card style={{ marginTop: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text variant="label" tone="muted">{`KNOWS (${linked.length})`}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Add people ${firstName} knows`}
          onPress={() => router.push({ pathname: '/contact/knows', params: { id: contact.id } })}
          hitSlop={8}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
        >
          <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
          <Text variant="label" tone="primary" weight="semibold">Add</Text>
        </Pressable>
      </View>

      {linked.length === 0 && suggested.length === 0 && lost.length === 0 ? (
        <Text variant="caption" tone="muted" style={{ marginTop: spacing.xs }}>
          {`Link the people ${firstName} knows — it maps who can introduce you to whom.`}
        </Text>
      ) : null}

      {linked.map(({ link, other }) => (
        <Pressable
          key={link.id}
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/contact/[id]', params: { id: other.id } })}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.md,
            paddingVertical: spacing.sm,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Avatar uri={other.avatarUrl} name={displayNameOf(other)} size={32} />
          <View style={{ flex: 1 }}>
            <Text weight="medium">{displayNameOf(other) || 'Unnamed'}</Text>
            {link.note ? <Text variant="caption" tone="muted">{link.note}</Text> : null}
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </Pressable>
      ))}

      {suggested.length > 0 ? (
        <View style={{ marginTop: spacing.sm, gap: spacing.sm }}>
          <Text variant="caption" tone="muted" weight="semibold">POSSIBLE MATCHES</Text>
          {suggested.map((s) => {
            const isMe = s.candidate.contact.id === contact.id;
            // From the anchor's side: "was Jane Doe → this Jane Doe?"
            // From the look-alike's side: "Bob knew a Jane Doe — is that them?"
            const headline = isMe
              ? `${displayNameOf(s.anchor)} knew a "${s.was.name || 'contact'}"`
              : `Was "${s.was.name || 'a contact'}" → ${displayNameOf(s.candidate.contact)}?`;
            return (
              <View
                key={`${s.link.id}-${s.candidate.contact.id}`}
                style={{
                  padding: spacing.sm,
                  borderRadius: radius.md,
                  borderWidth: 1,
                  borderStyle: 'dashed',
                  borderColor: colors.border,
                  gap: 6,
                }}
              >
                <Text variant="label">{headline}</Text>
                <Text variant="caption" tone="muted">
                  {`Matched on ${describeMatch(s.candidate)}. The original contact was removed, so this link is only a suggestion.`}
                </Text>
                <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                  {smallButton(isMe ? `Yes, link to ${displayNameOf(s.anchor)}` : 'Relink', () =>
                    void relinkKnows(s.link.id, s.missingSide, s.candidate.contact.id).catch(fail('Could not relink')),
                  )}
                  {isMe
                    ? null
                    : smallButton(
                        'Remove link',
                        () => void removeKnows(s.link.id).catch(fail('Could not remove')),
                        'muted',
                      )}
                </View>
              </View>
            );
          })}
        </View>
      ) : null}

      {lost.map((l) => (
        <View
          key={l.link.id}
          style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm }}
        >
          <Ionicons name="unlink-outline" size={18} color={colors.textMuted} />
          <View style={{ flex: 1 }}>
            <Text tone="muted">{l.was.name || 'Removed contact'}</Text>
            <Text variant="caption" tone="muted">Removed — re-add or re-import them to relink.</Text>
          </View>
          {smallButton(
            'Forget',
            () =>
              confirm('Forget this connection?', `${firstName} will no longer be linked to ${l.was.name || 'this person'}.`, () => {
                void removeKnows(l.link.id).catch(fail('Could not remove'));
              }),
            'muted',
          )}
        </View>
      ))}
    </Card>
  );
}
