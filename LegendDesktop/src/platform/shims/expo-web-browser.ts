// expo-web-browser. OAuth (Google/Apple) is disabled on desktop — it needs a
// custom-scheme redirect back into the app — so an auth session reports
// "dismiss". Plain browser opens go to the OS browser.

import { openExternal } from '../bridge';

export function maybeCompleteAuthSession(): void {}

export async function openAuthSessionAsync(
  url: string,
  _redirectUrl?: string,
): Promise<{ type: 'success' | 'dismiss' | 'cancel'; url?: string }> {
  await openExternal(url);
  return { type: 'dismiss' };
}

export async function openBrowserAsync(url: string): Promise<{ type: 'opened' }> {
  await openExternal(url);
  return { type: 'opened' };
}
