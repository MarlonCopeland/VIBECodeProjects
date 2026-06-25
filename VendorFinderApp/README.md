# Vendor Finder App

A cross-platform (web / iOS / Android) Expo + React Native app where pop-up
vendors register their schedule and users discover, favorite, and get alerted
about nearby open vendors.

## Run

```bash
cd VendorFinderApp
npm install
npm run web        # browser
npm run ios        # iOS simulator (Mac)
npm run android    # Android emulator
npm start          # Expo dev menu (scan QR with Expo Go)
```

## Architecture

```
App.js                          # Navigation root
src/
  config.js                     # BACKEND flag, alert radius, poll interval
  context/VendorContext.js      # Global state (vendors, favorites, location)
  services/
    backend/
      index.js                  # Facade that picks the active backend
      localBackend.js           # AsyncStorage implementation (default)
      firebaseBackend.js        # Firebase stub + reference impl in comments
    locationService.js          # expo-location + Haversine distance
    notificationService.js      # expo-notifications + web Notification API
  components/                   # VendorCard, SearchBar, ScheduleItem
  screens/                      # Home, Search, VendorDetail, Favorites,
                                # RegisterVendor, Alerts
```

## Swapping in Firebase

1. `npm install firebase`
2. Open `src/services/backend/firebaseBackend.js`, fill in `firebaseConfig`,
   and uncomment the reference implementation.
3. Set `BACKEND = 'firebase'` in `src/config.js`.

No screen or component code needs to change — they only depend on the facade
exported from `src/services/backend/index.js`.

## Features

- Vendor registration with type, description, schedule, and live "open now" toggle.
- Search by name / type / description with an "open now" filter.
- Favorites (persisted locally per user id).
- Background-polled alerts for favorited vendors when they open or come within
  `NEARBY_RADIUS_KM` (defaults to 2 km).
- Alert history screen.
- Real device location via `expo-location` with a mock fallback when permission
  is denied or unavailable.
