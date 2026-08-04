// src/config.js
// Central configuration shim. The authoritative runtime config now lives in
// src/config/env.js (env-injected via app.config.js). This file is kept for
// backward compatibility so existing `import { BACKEND } from '../config'`
// statements keep working.
//
// Supported BACKEND values: 'local' | 'supabase'

export { BACKEND } from './config/env';

// Distance (km) within which a vendor is considered "nearby" for alerts.
export const NEARBY_RADIUS_KM = 2.0;

// Polling interval for the alert engine, in ms.
export const ALERT_POLL_INTERVAL_MS = 60_000;
