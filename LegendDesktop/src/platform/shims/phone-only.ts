// Phone-only Expo modules (expo-contacts, expo-document-picker,
// expo-file-system, expo-sharing, expo-sms). Shared code imports them lazily
// on code paths desktop never takes — phone-book import, the share sheet,
// SMS compose. Desktop has its own paths instead: native open/save dialogs
// (src/platform/files.ts) and sms:/tel:/mailto: links through the OS.
/* eslint-disable @typescript-eslint/no-explicit-any */

function unavailable(): never {
  throw new Error('This feature is only available in the Legend phone app.');
}

// expo-contacts
export const Fields: any = {};
export const requestPermissionsAsync: any = unavailable;
interface DeviceContact {
  name?: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  jobTitle?: string;
  phoneNumbers?: { label?: string; number?: string }[];
  emails?: { label?: string; email?: string }[];
}
export async function getContactsAsync(_opts: unknown): Promise<{ data: DeviceContact[] }> {
  return unavailable();
}
export const presentAccessPickerAsync: any = unavailable;
// expo-document-picker
export const getDocumentAsync: any = unavailable;
// expo-file-system/legacy
export const cacheDirectory: string | null = null;
export const readAsStringAsync: any = unavailable;
export const writeAsStringAsync: any = unavailable;
// expo-sharing / expo-sms
export const isAvailableAsync: any = async () => false;
export const shareAsync: any = unavailable;
export const sendSMSAsync: any = unavailable;
