// src/features/alerts/alertService.ts
// Cross-platform alerting for followed vendors. Uses expo-notifications on
// native; falls back to the browser Notification API on web. Always records
// alerts to storage so the Alerts screen has a complete history. Dedupe keys
// are scoped per vendor/condition/day so the user gets at most one alert per
// condition per day.

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { storage } from '../../lib/storage';
import { backend } from '../../backend';
import type { Vendor } from '../../backend/types';

const ALERT_HISTORY_KEY = 'vendorfinder.alertHistory';
const ALERTED_KEY = 'vendorfinder.alertedVendors'; // dedupe within a day

export interface AlertEntry {
  title: string;
  body: string;
  data: Record<string, unknown>;
  at: number;
}

let configured = false;
async function configure(): Promise<void> {
  if (configured) return;
  configured = true;
  if (Platform.OS !== 'web') {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
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

/**
 * Register this device for remote push and persist the Expo push token against
 * the given user. Safe to call repeatedly. No-op on web / simulators.
 */
export async function registerForPushNotifications(userId: string): Promise<string | null> {
  try {
    await configure();
    if (Platform.OS === 'web') return null;
    if (!Device.isDevice) return null; // push tokens require a physical device

    const { status: existing } = await Notifications.getPermissionsAsync();
    let status = existing;
    if (existing !== 'granted') {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    if (status !== 'granted') return null;

    const tokenResp = await Notifications.getExpoPushTokenAsync();
    const token = tokenResp?.data;
    if (token && userId) await backend.notifications.registerPushToken(userId, token);
    return token ?? null;
  } catch (e) {
    console.warn('push registration failed', e);
    return null;
  }
}

async function pushHistory(entry: AlertEntry): Promise<void> {
  const raw = await storage.getItem(ALERT_HISTORY_KEY);
  const list: AlertEntry[] = raw ? JSON.parse(raw) : [];
  list.unshift(entry);
  await storage.setItem(ALERT_HISTORY_KEY, JSON.stringify(list.slice(0, 100)));
}

export async function getAlertHistory(): Promise<AlertEntry[]> {
  const raw = await storage.getItem(ALERT_HISTORY_KEY);
  return raw ? JSON.parse(raw) : [];
}

export async function clearAlertHistory(): Promise<void> {
  await storage.removeItem(ALERT_HISTORY_KEY);
  await storage.removeItem(ALERTED_KEY);
}

export async function notify(
  title: string,
  body: string,
  data: Record<string, unknown> = {},
): Promise<void> {
  await configure();
  await pushHistory({ title, body, data, at: Date.now() });

  if (Platform.OS === 'web') {
    if (
      typeof window !== 'undefined' &&
      'Notification' in window &&
      window.Notification.permission === 'granted'
    ) {
      try {
        new window.Notification(title, { body });
      } catch {
        /* ignore */
      }
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

async function alreadyAlerted(key: string): Promise<boolean> {
  const raw = await storage.getItem(ALERTED_KEY);
  const set: Record<string, number> = raw ? JSON.parse(raw) : {};
  return !!set[key];
}

async function markAlerted(key: string): Promise<void> {
  const raw = await storage.getItem(ALERTED_KEY);
  const set: Record<string, number> = raw ? JSON.parse(raw) : {};
  set[key] = Date.now();
  await storage.setItem(ALERTED_KEY, JSON.stringify(set));
}

/** Reset dedupe (used at app start so users get fresh alerts each session). */
export async function resetAlertDedupe(): Promise<void> {
  await storage.removeItem(ALERTED_KEY);
}

export interface EvaluateInput {
  vendors: Vendor[];
  favorites: string[];
  origin: { latitude: number; longitude: number } | null;
  radiusKm: number;
}

/**
 * Evaluate alert conditions for favorited vendors. Fires when a favorited vendor
 * just became open, or is open AND within `radiusKm` of `origin`.
 */
export async function evaluateAndAlert({ vendors, favorites, origin, radiusKm }: EvaluateInput): Promise<void> {
  const today = new Date().toDateString();
  for (const v of vendors) {
    if (!favorites.includes(v.id) || !v.isOpen) continue;

    const openKey = `open:${v.id}:${today}`;
    if (!(await alreadyAlerted(openKey))) {
      await notify(`${v.name} is open!`, `${v.type} • Tap to view details.`, { vendorId: v.id });
      await markAlerted(openKey);
    }

    if (origin && v.currentLocation && typeof v.distanceKm === 'number' && v.distanceKm <= radiusKm) {
      const nearKey = `near:${v.id}:${today}`;
      if (!(await alreadyAlerted(nearKey))) {
        await notify(`${v.name} is nearby`, `Only ${v.distanceKm.toFixed(2)} km away.`, { vendorId: v.id });
        await markAlerted(nearKey);
      }
    }
  }
}
