// src/lib/location.ts
// Device location via expo-location, with a mock fallback so the app stays
// usable on web/emulators or when permission is denied. Plus a Haversine
// distance helper used to enrich vendors with a distance from the viewer.

import * as Location from 'expo-location';
import type { GeoPoint, Vendor } from '../backend/types';

export interface DeviceLocation {
  latitude: number;
  longitude: number;
  address: string;
  accuracy?: number | null;
}

const MOCK_LOCATION: DeviceLocation = {
  latitude: 34.0522,
  longitude: -118.2437,
  address: 'Downtown LA (Mock)',
  accuracy: 50,
};

export async function getLocation(
  { allowMockFallback = true }: { allowMockFallback?: boolean } = {},
): Promise<DeviceLocation> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      if (allowMockFallback) return MOCK_LOCATION;
      throw new Error('Location permission denied');
    }
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    let address = '';
    try {
      const places = await Location.reverseGeocodeAsync({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      });
      const p = places?.[0];
      if (p) address = [p.name, p.street, p.city, p.region].filter(Boolean).join(', ');
    } catch {
      // reverse geocode is best-effort
    }
    return {
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
      address,
    };
  } catch (err) {
    if (allowMockFallback) {
      console.warn('Falling back to mock location:', (err as Error).message);
      return MOCK_LOCATION;
    }
    throw err;
  }
}

/** Haversine distance in kilometers. */
export function distanceKm(a?: GeoPoint | null, b?: GeoPoint | null): number {
  if (!a || !b) return Infinity;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const x =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(x));
}

/** Enrich each vendor with a `distanceKm` field relative to `origin`. */
export function withDistances(vendors: Vendor[], origin?: GeoPoint | null): Vendor[] {
  if (!origin) return vendors.map((v) => ({ ...v, distanceKm: null }));
  return vendors.map((v) => ({
    ...v,
    distanceKm: v.currentLocation ? distanceKm(origin, v.currentLocation) : null,
  }));
}
