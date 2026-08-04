// src/context/VendorContext.js
// Provides vendors, favorites, location, and refresh actions to all screens.
// Reacts to the currently-acting user from AuthContext.

import React, {
  createContext, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import * as backend from '../services/backend';
import { getLocation, withDistances } from '../services/locationService';
import {
  evaluateAndAlert, resetAlertDedupe, registerForPushNotifications,
} from '../services/notificationService';
import { NEARBY_RADIUS_KM, ALERT_POLL_INTERVAL_MS } from '../config';
import { useAuth } from './AuthContext';

const VendorContext = createContext(null);

export function VendorProvider({ children }) {
  const { currentUser } = useAuth();
  const userId = currentUser?.id || 'anonymous';

  const [vendors, setVendors] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [location, setLocation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const unsubRef = useRef(null);

  // Subscribe to vendor list (realtime where supported).
  useEffect(() => {
    const unsub = backend.subscribeVendors(list => {
      // Hide vendors that blocked the current user.
      const filtered = (list || []).filter(
        v => !(v.blockedUserIds || []).includes(userId)
      );
      setVendors(filtered);
    });
    unsubRef.current = unsub;
    return () => { if (unsub) unsub(); };
  }, [userId]);

  // Reload favorites whenever the acting user changes.
  useEffect(() => {
    if (!currentUser) { setFavorites([]); return; }
    backend.listFavorites(userId)
      .then(setFavorites)
      .catch(e => console.warn('favorites load failed', e));
    resetAlertDedupe().catch(() => {});
    // Register this device for remote push against the signed-in user.
    registerForPushNotifications(userId).catch(() => {});
  }, [currentUser, userId]);

  // Get device location at startup.
  useEffect(() => {
    (async () => {
      try {
        const loc = await getLocation();
        setLocation(loc);
      } catch (e) {
        setError(e.message);
      }
    })();
  }, []);

  // Vendors enriched with distance, recomputed when either changes.
  const enrichedVendors = useMemo(
    () => withDistances(vendors, location),
    [vendors, location]
  );

  // Periodically evaluate alert conditions.
  useEffect(() => {
    if (!enrichedVendors.length) return;
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
    return () => { cancelled = true; clearInterval(id); };
  }, [enrichedVendors, favorites, location]);

  const refresh = async () => {
    setLoading(true); setError(null);
    try {
      const [list, loc] = await Promise.all([
        backend.listVendors({ viewerUserId: userId }),
        getLocation(),
      ]);
      setVendors(list);
      setLocation(loc);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleFavorite = async vendorId => {
    if (!currentUser) return;
    try {
      if (favorites.includes(vendorId)) {
        await backend.removeFavorite(userId, vendorId);
        setFavorites(prev => prev.filter(i => i !== vendorId));
      } else {
        await backend.addFavorite(userId, vendorId);
        setFavorites(prev => [...prev, vendorId]);
      }
    } catch (e) {
      setError(e.message);
    }
  };

  const value = {
    vendors: enrichedVendors,
    favorites,
    location,
    loading,
    error,
    userId,
    refresh,
    toggleFavorite,
  };

  return (
    <VendorContext.Provider value={value}>{children}</VendorContext.Provider>
  );
}

export function useVendors() {
  const ctx = useContext(VendorContext);
  if (!ctx) throw new Error('useVendors must be used inside VendorProvider');
  return ctx;
}
