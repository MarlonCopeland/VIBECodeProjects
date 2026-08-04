// src/features/profile/profileService.ts
// Profile + account operations. Wraps the backend ProfileApi and adds the
// image-picker flow for avatar selection so screens stay declarative.

import * as ImagePicker from 'expo-image-picker';
import { backend } from '../../backend';
import type { AppUser } from '../../backend/types';
import { validateDisplayName } from '../../lib/validation';

export async function getProfile(userId: string): Promise<AppUser | null> {
  return backend.profile.getProfile(userId);
}

export async function updateProfile(
  userId: string,
  patch: Partial<Pick<AppUser, 'displayName' | 'avatarUrl' | 'metadata'>>,
): Promise<AppUser> {
  if (patch.displayName !== undefined) {
    const check = validateDisplayName(patch.displayName);
    if (!check.valid) throw new Error(check.message);
  }
  return backend.profile.updateProfile(userId, patch);
}

/**
 * Prompt for an image, then upload it and persist the URL on the profile.
 * Returns the updated user, or null if the user cancelled the picker.
 */
export async function pickAndUploadAvatar(userId: string): Promise<AppUser | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error('Photo library permission is required.');

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.7,
  });
  if (result.canceled || !result.assets?.[0]) return null;

  const uri = result.assets[0].uri;
  const publicUrl = await backend.profile.uploadAvatar(userId, uri);
  return backend.profile.updateProfile(userId, { avatarUrl: publicUrl });
}

export async function deleteAccount(userId: string): Promise<void> {
  return backend.profile.deleteAccount(userId);
}
