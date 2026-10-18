// src/screens/profile/ProfileEditScreen.tsx
// Edit display name, bio, and avatar — mirrors the phone's
// app/(app)/profile/edit.tsx. The phone picks a photo with expo-image-picker;
// desktop uses a file input, reads the image as a data URL (the local demo
// backend stores the URI as-is, so it must outlive this window; the Supabase
// backend fetch()es it into a blob and uploads it), then persists the URL.

import { useRef, useState } from 'react';
import { useAuth } from '@legend/features/auth/AuthContext';
import { profileService } from '@legend/features/profile';
import { backend } from '@legend/backend';
import { toAppError } from '@legend/lib/errors';
import { BackButton, useRouter } from '../../app/router';
import { Avatar, Banner, Button, Page, TextField } from '../../ui/components';

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the image.'));
    reader.readAsDataURL(file);
  });
}

export default function ProfileEditScreen() {
  const { user, setUser } = useAuth();
  const { back } = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [bio, setBio] = useState((user?.metadata?.bio as string) ?? '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl ?? null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  if (!user) return null;

  const onPickFile = async (file: File | undefined) => {
    if (!file) return;
    setError('');
    setUploading(true);
    try {
      if (!file.type.startsWith('image/')) throw new Error('Choose an image file.');
      const ext = (file.name.split('.').pop() || file.type.split('/')[1] || 'jpg').toLowerCase();
      // The fragment gives the Supabase backend a clean file extension to
      // read (it derives one from the URI); fetch() and <img> ignore it.
      const uri = `${await readAsDataUrl(file)}#avatar.${ext}`;
      const publicUrl = await backend.profile.uploadAvatar(user.id, uri);
      const updated = await backend.profile.updateProfile(user.id, { avatarUrl: publicUrl });
      setAvatarUrl(updated.avatarUrl);
      setUser(updated);
    } catch (e) {
      setError(toAppError(e).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
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
      back('/profile');
    } catch (e) {
      setError(toAppError(e).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Page title="Edit profile" narrow back={<BackButton fallback="/profile" />}>
      {error ? <Banner tone="error">{error}</Banner> : null}

      <div className="stack" style={{ alignItems: 'center', marginBottom: 'var(--s-xl)' }}>
        <Avatar uri={avatarUrl} name={displayName} size={96} />
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => void onPickFile(e.target.files?.[0])}
        />
        <Button title="Change photo" variant="ghost" loading={uploading} onClick={() => fileRef.current?.click()} />
      </div>

      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <TextField
          label="Display name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          autoCapitalize="words"
          placeholder="Your name"
        />
        <TextField
          label="Bio"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder="A short bio"
          multiline
          rows={3}
        />
        <Button type="submit" title="Save changes" loading={saving} block />
      </form>
    </Page>
  );
}
