// src/features/vendors/VendorContext.tsx
// Provides vendors, favorites, device location, and refresh actions to all
// screens. Reacts to the currently-acting user from AuthContext, filters out
// vendors that blocked the viewer, enriches vendors with distance, and runs the
// periodic proximity/open alert engine.

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { backend } from '../../backend';
import type { Vendor } from '../../backend/types';
import { getLocation, withDistances, type DeviceLocation } from '../../lib/location';
import { NEARBY_RADIUS_KM, ALERT_POLL_INTERVAL_MS } from '../../config/env';
import { isFeatureEnabled } from '../../config/features';
import { useAuth } from '../auth/AuthContext';
import {
  evaluateAndAlert,
  resetAlertDedupe,
  registerForPushNotifications,
} from '../alerts/alertService';

interface VendorContextValue {
  vendors: Vendor[];
  favorites: string[];
  location: DeviceLocation | null;
  loading: boolean;
  error: string | null;
  userId: string;
  refresh: () => Promise<void>;
  toggleFavorite: (vendorId: string) => Promise<void>;
}

const VendorContext = createContext<VendorContextValue | null>(null);

export function VendorProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id || 'anonymous';

  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [location, setLocation] = useState<DeviceLocation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Subscribe to the vendor list (realtime where supported).
  useEffect(() => {
    const unsub = backend.vendors.subscribe((list) => {
      // Hide vendors that blocked the current user.
      setVendors((list || []).filter((v) => !(v.blockedUserIds || []).includes(userId)));
    });
    return () => unsub();
  }, [userId]);

  // Reload favorites whenever the acting user changes.
  useEffect(() => {
    if (!user) {
      setFavorites([]);
      return;
    }
    backend.favorites
      .list(userId)
      .then(setFavorites)
      .catch((e) => console.warn('favorites load failed', e));
    resetAlertDedupe().catch(() => {});
    registerForPushNotifications(userId).catch(() => {});
  }, [user, userId]);

  // Device location at startup.
  useEffect(() => {
    (async () => {
      try {
        setLocation(await getLocation());
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, []);

  // Vendors enriched with distance, recomputed when either changes.
  const enrichedVendors = useMemo(() => withDistances(vendors, location), [vendors, location]);

  // Periodically evaluate alert conditions (only when the alerts module is on).
  useEffect(() => {
    if (!isFeatureEnabled('alerts') || !enrichedVendors.length) return;
    let cancelled = false;
    const run = async () => {
      if (cancelled) return;
      try {
        await evaluateAndAlert({
          vendors: enrichedVendors,
          favorites,
          origin: location,
          radiusKm: NEARBY_RADIUS_KM,
        });
      } catch (e) {
        console.warn('alert eval failed', e);
      }
    };
    run();
    const id = setInterval(run, ALERT_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [enrichedVendors, favorites, location]);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, loc] = await Promise.all([
        backend.vendors.list({ viewerUserId: userId }),
        getLocation(),
      ]);
      setVendors(list);
      setLocation(loc);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const toggleFavorite = async (vendorId: string) => {
    if (!user) return;
    try {
      if (favorites.includes(vendorId)) {
        await backend.favorites.remove(userId, vendorId);
        setFavorites((prev) => prev.filter((i) => i !== vendorId));
      } else {
        await backend.favorites.add(userId, vendorId);
        setFavorites((prev) => [...prev, vendorId]);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const value = useMemo<VendorContextValue>(
    () => ({
      vendors: enrichedVendors,
      favorites,
      location,
      loading,
      error,
      userId,
      refresh,
      toggleFavorite,
    }),
    [enrichedVendors, favorites, location, loading, error, userId],
  );

  return <VendorContext.Provider value={value}>{children}</VendorContext.Provider>;
}

export function useVendors(): VendorContextValue {
  const ctx = useContext(VendorContext);
  if (!ctx) throw new Error('useVendors must be used inside VendorProvider');
  return ctx;
}
