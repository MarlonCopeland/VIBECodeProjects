// src/lib/notify.ts
// Cross-platform alert/confirm. React Native's Alert is a no-op on web, so
// these fall back to window.alert/confirm there.

import { Alert, Platform } from 'react-native';

export function notify(title: string, message?: string): void {
  if (Platform.OS === 'web') {
    (globalThis as unknown as { alert(msg: string): void }).alert(
      message ? `${title}\n\n${message}` : title,
    );
    return;
  }
  Alert.alert(title, message);
}

export function confirm(title: string, message: string, onConfirm: () => void): void {
  if (Platform.OS === 'web') {
    const ok = (globalThis as unknown as { confirm(msg: string): boolean }).confirm(
      `${title}\n\n${message}`,
    );
    if (ok) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'OK', style: 'destructive', onPress: onConfirm },
  ]);
}
