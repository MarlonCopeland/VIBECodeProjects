// expo-linking. Auth emails' links target the phone app's `legend://`
// scheme; desktop confirms signups and resets with the emailed 6-digit code
// instead (verifyEmailOtp), which works from any device.

import { openExternal } from '../bridge';

declare const __LEGEND_EXTRA__: { scheme?: string };

export function createURL(path: string): string {
  const scheme = __LEGEND_EXTRA__.scheme || 'legend';
  return `${scheme}://${path.replace(/^\//, '')}`;
}

export function parse(url: string): { params: Record<string, string> } {
  const u = new URL(url);
  return { params: Object.fromEntries(u.searchParams.entries()) };
}

export async function openURL(url: string): Promise<void> {
  await openExternal(url);
}
