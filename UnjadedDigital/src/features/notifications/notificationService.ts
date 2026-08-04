// src/features/notifications/notificationService.ts
// Expo push notification registration. Requests permission, obtains the Expo
// push token, and persists it via the backend so a server can target the user.
// Safe no-ops on web / simulators where push is unavailable.

import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { backend } from '../../backend';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    // `shouldShowAlert` is the legacy field; banner/list are the SDK 52+ split.
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

let cachedToken: string | null = null;

/**
 * Ask for permission and register this device's Expo push token for `userId`.
 * Returns the token, or null if unavailable/denied. Idempotent.
 */
export async function registerForPushNotifications(userId: string): Promise<string | null> {
  if (Platform.OS === 'web' || !Device.isDevice) return null;

  const settings = await Notifications.getPermissionsAsync();
  let status = settings.status;
  if (status !== 'granted') {
    const req = await Notifications.requestPermissionsAsync();
    status = req.status;
  }
  if (status !== 'granted') return null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const projectId =
    Constants?.expoConfig?.extra?.eas?.projectId ||
    (Constants as unknown as { easConfig?: { projectId?: string } })?.easConfig?.projectId;

  const tokenResponse = await Notifications.getExpoPushTokenAsync(
    projectId ? { projectId } : undefined,
  );
  cachedToken = tokenResponse.data;
  await backend.notifications.registerPushToken(userId, cachedToken);
  return cachedToken;
}

/** Unregister the current device token (call on sign-out). */
export async function unregisterPushNotifications(userId: string): Promise<void> {
  if (!cachedToken) return;
  await backend.notifications.removePushToken(userId, cachedToken);
  cachedToken = null;
}

/** Subscribe to notifications received while the app is foregrounded. */
export function addForegroundListener(
  handler: (notification: Notifications.Notification) => void,
): { remove: () => void } {
  return Notifications.addNotificationReceivedListener(handler);
}

/** Subscribe to taps on a notification (foreground/background). */
export function addResponseListener(
  handler: (response: Notifications.NotificationResponse) => void,
): { remove: () => void } {
  return Notifications.addNotificationResponseReceivedListener(handler);
}
