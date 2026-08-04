// app/(app)/profile/edit.tsx
// Edit display name, bio, and avatar. Persists via profileService and updates
// the cached auth user on success.

import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '../../../src/components/Screen';
import { Text } from '../../../src/components/Text';
import { TextField } from '../../../src/components/TextField';
import { Button } from '../../../src/components/Button';
import { Banner } from '../../../src/components/Banner';
import { Avatar } from '../../../src/components/Avatar';
import { useAuth } from '../../../src/features/auth/AuthContext';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { profileService } from '../../../src/features/profile';
import { toAppError } from '../../../src/lib/errors';

export default function EditProfileScreen() {
  const { user, setUser } = useAuth();
  const { spacing } = useTheme();
  const router = useRouter();

  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [bio, setBio] = useState((user?.metadata?.bio as string) ?? '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl ?? null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  if (!user) return null;

  const changeAvatar = async () => {
    setError('');
    setUploading(true);
    try {
      const updated = await profileService.pickAndUploadAvatar(user.id);
      if (updated) {
        setAvatarUrl(updated.avatarUrl);
        setUser(updated);
      }
    } catch (e) {
      setError(toAppError(e).message);
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    setError('');
    setSaving(true);
    try {
      const updated = await profileService.updateProfile(user.id, {
        displayName,
        metadata: { ...user.metadata, bio },
      });
      setUser(updated);
      router.back();
    } catch (e) {
      setError(toAppError(e).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen scroll>
      <Banner kind="error" message={error} />

      <View style={{ alignItems: 'center', marginBottom: spacing.xl }}>
        <Avatar uri={avatarUrl} name={displayName} size={96} />
        <View style={{ marginTop: spacing.md }}>
          <Button
            title="Change photo"
            variant="ghost"
            fullWidth={false}
            loading={uploading}
            onPress={changeAvatar}
          />
        </View>
      </View>

      <TextField
        label="Display name"
        value={displayName}
        onChangeText={setDisplayName}
        autoCapitalize="words"
        placeholder="Your name"
      />
      <TextField
        label="Bio"
        value={bio}
        onChangeText={setBio}
        placeholder="A short bio"
        multiline
        numberOfLines={3}
      />

      <Button title="Save changes" onPress={save} loading={saving} />
    </Screen>
  );
}
