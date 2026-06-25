// src/services/notificationService.js
// Cross-platform alerting. Uses expo-notifications on native; falls back to
// browser Notification API on web. Always records alerts to AsyncStorage so
// the Alerts screen has a history.

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

const ALERT_HISTORY_KEY = 'vf.alertHistory';
const ALERTED_KEY = 'vf.alertedVendors'; // dedupe within a session/day

let configured = false;
async function configure() {
  if (configured) return;
  configured = true;
  if (Platform.OS !== 'web') {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
    try {
      await Notifications.requestPermissionsAsync();
    } catch (e) {
      console.warn('notification permission error', e);
    }
  } else if (typeof window !== 'undefined' && 'Notification' in window) {
    try {
      if (window.Notification.permission === 'default') {
        await window.Notification.requestPermission();
      }
    } catch (e) {
      console.warn('web notification permission error', e);
    }
  }
}

async function pushHistory(entry) {
  const raw = await AsyncStorage.getItem(ALERT_HISTORY_KEY);
  const list = raw ? JSON.parse(raw) : [];
  list.unshift(entry);
  // Cap history length.
  await AsyncStorage.setItem(ALERT_HISTORY_KEY, JSON.stringify(list.slice(0, 100)));
}

export async function getAlertHistory() {
  const raw = await AsyncStorage.getItem(ALERT_HISTORY_KEY);
  return raw ? JSON.parse(raw) : [];
}

export async function clearAlertHistory() {
  await AsyncStorage.removeItem(ALERT_HISTORY_KEY);
  await AsyncStorage.removeItem(ALERTED_KEY);
}

export async function notify(title, body, data = {}) {
  await configure();
  await pushHistory({ title, body, data, at: Date.now() });

  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' &&
        'Notification' in window &&
        window.Notification.permission === 'granted') {
      try { new window.Notification(title, { body }); } catch {}
    } else {
      console.log(`[ALERT] ${title} - ${body}`);
    }
    return;
  }

  try {
    await Notifications.scheduleNotificationAsync({
      content: { title, body, data },
      trigger: null, // fire immediately
    });
  } catch (e) {
    console.warn('notify error', e);
  }
}

// Track which vendor/condition pairs we've already alerted on so we don't spam.
async function alreadyAlerted(key) {
  const raw = await AsyncStorage.getItem(ALERTED_KEY);
  const set = raw ? JSON.parse(raw) : {};
  return !!set[key];
}
async function markAlerted(key) {
  const raw = await AsyncStorage.getItem(ALERTED_KEY);
  const set = raw ? JSON.parse(raw) : {};
  set[key] = Date.now();
  await AsyncStorage.setItem(ALERTED_KEY, JSON.stringify(set));
}

// Reset dedupe (used at app start so users get fresh alerts each session).
export async function resetAlertDedupe() {
  await AsyncStorage.removeItem(ALERTED_KEY);
}

/**
 * Evaluate alert conditions for favorited vendors.
 * Fires when:
 *   - a favorited vendor just became open, OR
 *   - a favorited vendor is open AND within radiusKm of `origin`.
 */
export async function evaluateAndAlert({ vendors, favorites, origin, radiusKm }) {
  for (const v of vendors) {
    if (!favorites.includes(v.id)) continue;

    if (v.isOpen) {
      const openKey = `open:${v.id}:${new Date().toDateString()}`;
      if (!(await alreadyAlerted(openKey))) {
        await notify(`${v.name} is open!`, `${v.type} • Tap to view details.`, { vendorId: v.id });
        await markAlerted(openKey);
      }
      if (origin && v.currentLocation && typeof v.distanceKm === 'number'
          && v.distanceKm <= radiusKm) {
        const nearKey = `near:${v.id}:${new Date().toDateString()}`;
        if (!(await alreadyAlerted(nearKey))) {
          await notify(
            `${v.name} is nearby`,
            `Only ${v.distanceKm.toFixed(2)} km away.`,
            { vendorId: v.id }
          );
          await markAlerted(nearKey);
        }
      }
    }
  }
}
