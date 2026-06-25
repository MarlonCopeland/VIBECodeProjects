// src/services/locationService.js
// Uses expo-location when available; falls back to a mock for environments
// without permission or for offline testing.

import * as Location from 'expo-location';

const MOCK_LOCATION = {
  latitude: 34.0522,
  longitude: -118.2437,
  address: 'Downtown LA (Mock)',
  accuracy: 50,
};

export async function getLocation({ allowMockFallback = true } = {}) {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      if (allowMockFallback) return MOCK_LOCATION;
      throw new Error('Location permission denied');
    }
    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    let address = '';
    try {
      const places = await Location.reverseGeocodeAsync({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      });
      if (places && places[0]) {
        const p = places[0];
        address = [p.name, p.street, p.city, p.region].filter(Boolean).join(', ');
      }
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
      console.warn('Falling back to mock location:', err.message);
      return MOCK_LOCATION;
    }
    throw err;
  }
}

// Haversine distance in kilometers.
export function distanceKm(a, b) {
  if (!a || !b) return Infinity;
  const toRad = d => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(x));
}

// Convenience: enrich each vendor with a `distanceKm` field relative to `origin`.
export function withDistances(vendors, origin) {
  if (!origin) return vendors.map(v => ({ ...v, distanceKm: null }));
  return vendors.map(v => ({
    ...v,
    distanceKm: v.currentLocation ? distanceKm(origin, v.currentLocation) : null,
  }));
}
