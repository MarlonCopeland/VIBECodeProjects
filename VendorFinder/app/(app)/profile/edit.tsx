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
import { useAsyncAction } from '../../../src/lib/useAsyncAction';

export default function EditProfileScreen() {
  const { user, setUser } = useAuth();
  const { spacing } = useTheme();
  const router = useRouter();

  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [bio, setBio] = useState((user?.metadata?.bio as string) ?? '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl ?? null);
  // Photo upload and save spin independently but share one error banner.
  const { error, isBusy, run } = useAsyncAction();

  if (!user) return null;
  const currentUser = user;

  const changeAvatar = () =>
    run(async () => {
      const updated = await profileService.pickAndUploadAvatar(currentUser.id);
      if (updated) {
        setAvatarUrl(updated.avatarUrl);
        setUser(updated);
      }
    }, 'upload');

  const save = () =>
    run(async () => {
      const updated = await profileService.updateProfile(currentUser.id, {
        displayName,
        metadata: { ...currentUser.metadata, bio },
      });
      setUser(updated);
      router.back();
    }, 'save');

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
            loading={isBusy('upload')}
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

      <Button title="Save changes" onPress={save} loading={isBusy('save')} />
    </Screen>
  );
}
