// expo-image-picker. Desktop picks avatars with a native file input (see the
// profile edit screen); this keeps shared imports resolving.

export const MediaTypeOptions = { Images: 'Images' } as const;

export async function requestMediaLibraryPermissionsAsync() {
  return { granted: true };
}

export async function launchImageLibraryAsync(_opts?: unknown) {
  return { canceled: true, assets: [] as { uri: string }[] };
}
