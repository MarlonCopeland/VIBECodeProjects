// src/config.js
// Central configuration. Change BACKEND to swap implementations.
// Supported values: 'local' | 'firebase'
export const BACKEND = 'local';

// Distance (km) within which a vendor is considered "nearby" for alerts.
export const NEARBY_RADIUS_KM = 2.0;

// Polling interval for the alert engine, in ms.
export const ALERT_POLL_INTERVAL_MS = 60_000;
