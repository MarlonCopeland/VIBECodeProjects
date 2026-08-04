# VendorFinderApp — Features & Topology (Mermaid)

Cross-platform Expo / React Native app (iOS / Android / Web) connecting pop-up/mobile
vendors with customers who discover, follow, and get alerted about nearby open vendors.

---

## 1. Layered Architecture

```mermaid
graph TD
    subgraph UI["UI Layer — Screens & Components"]
        SCR["Screens<br/>Login, Signup, Home, Search,<br/>VendorDetail, Favorites, Alerts,<br/>Profile, VendorTools, EditVendorProfile,<br/>Followers, AdminDashboard"]
        CMP["Components<br/>VendorCard, SearchBar,<br/>ScheduleItem, ImpersonationBanner"]
    end

    subgraph CTX["Context Layer — Global State"]
        AUTH["AuthContext<br/>session, role, impersonation, can()"]
        VEND["VendorContext<br/>vendors, favorites, location, alert engine"]
    end

    subgraph SVC["Service Layer — Platform Wrappers"]
        AUTHSVC["authService<br/>username/pw + OAuth stubs, hashing"]
        LOCSVC["locationService<br/>expo-location + Haversine"]
        NOTSVC["notificationService<br/>local/web notifications + alert engine"]
    end

    subgraph BE["Backend Facade — services/backend"]
        IDX["index.js<br/>impl selector (single swap point)"]
        LOCAL["localBackend.js<br/>AsyncStorage (DEFAULT)"]
        FIRE["firebaseBackend.js<br/>stub + reference impl"]
    end

    STORE[("AsyncStorage<br/>device storage")]

    SCR --> AUTH
    SCR --> VEND
    CMP --> AUTH
    CMP --> VEND
    SCR -.one-off reads/writes.-> IDX

    VEND --> AUTH
    AUTH --> AUTHSVC
    VEND --> LOCSVC
    VEND --> NOTSVC

    AUTHSVC --> IDX
    NOTSVC --> IDX
    AUTH --> IDX
    VEND --> IDX

    IDX -->|BACKEND='local'| LOCAL
    IDX -->|BACKEND='firebase'| FIRE
    LOCAL --> STORE
    FIRE -.-> CLOUD[("Firestore / FCM<br/>(not wired)")]
```

---

## 2. Provider / Render Tree

```mermaid
graph TD
    A["SafeAreaProvider"] --> B["AuthProvider"]
    B --> C["VendorProvider<br/>(depends on useAuth)"]
    C --> D["Root"]
    D --> E["ImpersonationBanner<br/>(shown while impersonating)"]
    D --> F["NavigationContainer"]
    F --> G{"currentUser?"}
    G -->|"null"| H["AuthStack"]
    G -->|"present"| I["AppStack"]
```

---

## 3. Navigation Graph (role-gated)

```mermaid
graph TD
    subgraph AuthStack["AuthStack (unauthenticated)"]
        L["Login"] --> S["Signup"]
    end

    subgraph AppStack["AppStack (authenticated, native stack)"]
        MAIN["Main → MainTabs"]
        VD["VendorDetail"]
        EVP["EditVendorProfile"]
        FOL["Followers"]
        MAIN --> VD
        MAIN --> EVP
        MAIN --> FOL
    end

    subgraph MainTabs["MainTabs (bottom tabs, role-conditional)"]
        T1["Home"]
        T2["Search"]
        T3["Favorites"]
        T4["Alerts"]
        T5["Profile"]
        T6["VendorTools<br/>(role = vendor)"]
        T7["Admin<br/>(role = admin)"]
    end

    MAIN -.contains.-> MainTabs
```

---

## 4. Roles & RBAC

```mermaid
graph LR
    subgraph Roles
        U["user<br/>consumer"]
        V["vendor<br/>user powers + tools"]
        AD["admin<br/>full access + impersonation"]
    end

    U -->|"view/search/favorite vendors<br/>view/edit profile, view alerts"| P1["Base permissions"]
    V -->|inherits user +| P2["access:vendor-tools<br/>edit:own-vendor<br/>send:broadcast<br/>manage:followers"]
    AD -->|inherits all +| P3["access:admin<br/>impersonate<br/>list:users"]
```

> Enforced in `AuthContext → checkPermission()` via `useAuth().can(action, resource?)`.
> `currentUser = actingAs ?? realUser` enables admin impersonation transparently.

---

## 5. Feature Map by Role

```mermaid
mindmap
  root((VendorFinderApp))
    User
      Home
        open-first then distance sort
        pull-to-refresh
      Search
        full-text name/type/desc/tags
        open-now toggle
      Vendor Detail
        status, rating, distance, schedule
      Favorites / Follow
        per-user persisted
      Alerts
        notification history, clearable
      Profile
        interests tags
        followed vendors
        Become a Vendor upgrade
        sign out
    Vendor
      Vendor Tools
        Open-right-now toggle
        Broadcast I'm available
        Schedule editor
      Edit Vendor Profile
        type, tags, description
      Followers
        remove / block / unblock
    Admin
      Admin Dashboard
        list all users + vendors
        user/vendor counts
        impersonate any user
      Impersonation Banner
        one-tap stop
```

---

## 6. Key Data Flows

### 6a. Favorite toggle
```mermaid
sequenceDiagram
    participant U as User
    participant VC as VendorCard
    participant VX as VendorContext
    participant BE as backend facade
    participant ST as AsyncStorage
    U->>VC: tap star
    VC->>VX: toggleFavorite(vendorId)
    VX->>BE: addFavorite / removeFavorite
    BE->>ST: write vf.favorites.<userId>
    VX-->>VC: optimistic state update
```

### 6b. Realtime vendor list
```mermaid
sequenceDiagram
    participant VX as VendorContext
    participant BE as localBackend
    participant ST as AsyncStorage
    VX->>BE: subscribeVendors(cb)
    BE->>BE: add cb to subscribers Set
    Note over BE: any writeVendors()<br/>notifies all subscribers
    BE-->>VX: vendors[]
    VX->>VX: filter blockedUserIds, withDistances()
```

### 6c. Location & alert engine
```mermaid
sequenceDiagram
    participant T as Poll Timer (60s)
    participant NS as notificationService
    participant LS as locationService
    participant U as User device
    T->>NS: evaluateAndAlert()
    loop each favorited vendor
        NS->>LS: distanceKm(user, vendor) [Haversine]
        alt just became open
            NS->>U: "<name> is open!"
        else open AND within NEARBY_RADIUS_KM (2km)
            NS->>U: "<name> is nearby"
        end
        Note over NS: dedupe key vendor:condition:date<br/>(max 1 alert/condition/day)
    end
    NS->>NS: append to vf.alertHistory
```

---

## 7. Data Model

```mermaid
erDiagram
    USER ||--o| VENDOR : "owns (vendorId)"
    USER ||--o{ FAVORITE : "has"
    VENDOR ||--o{ FAVORITE : "followed via"
    VENDOR ||--o{ BROADCAST : "sends"
    VENDOR ||--o{ SCHEDULE_SLOT : "has"

    USER {
        string id
        string username
        string email
        string passwordHash
        string displayName
        enum role "admin|vendor|user"
        enum provider "local|google|facebook"
        string providerId
        array interests
        string vendorId "nullable back-pointer"
        date createdAt
    }
    VENDOR {
        string id
        string name
        enum type "Food|Clothes|Activity|Electronics|Arts|Services|Other"
        array tags
        string description
        string ownerId "-> USER.id"
        array blockedUserIds
        object currentLocation "lat/lng/address | null"
        bool isOpen
        number rating
        date createdAt
    }
    SCHEDULE_SLOT {
        string day
        string start
        string end
        number latitude
        number longitude
        string address
    }
    BROADCAST {
        string id
        string vendorId
        string message
        date at
    }
    FAVORITE {
        string userId
        string vendorId "stored: vf.favorites.<userId> -> []"
    }
```

---

## 8. Backend Abstraction Contract

```mermaid
graph LR
    subgraph Facade["backend/index.js — every backend implements:"]
        direction TB
        VENDORS["Vendors<br/>listVendors, getVendor, getVendorByOwner,<br/>registerVendor, updateVendor, deleteVendor"]
        FAV["Favorites/Followers<br/>listFavorites, addFavorite, removeFavorite,<br/>listFollowers, blockFollower, unblockFollower, removeFollower"]
        USERS["Users<br/>createUser, getUser, getUserByUsername,<br/>getUserByProvider, updateUser, listUsers"]
        BCAST["Broadcasts<br/>sendBroadcast, listBroadcasts"]
        RT["Realtime<br/>subscribeVendors(cb) -> unsubscribe"]
    end
    LB["localBackend (AsyncStorage)"] -.implements.-> Facade
    FB["firebaseBackend (stub)"] -.implements.-> Facade
```

> Swap backends by setting `BACKEND` in `src/config.js` (`'local'` | `'firebase'`).
> No screen, context, or component changes required.

---

## Tech Stack (reference)

- **Framework:** Expo SDK ~50, React Native 0.73, React 18 — JavaScript (ES modules)
- **Web:** react-native-web via Metro bundler
- **Navigation:** @react-navigation native-stack + bottom-tabs
- **Storage:** @react-native-async-storage/async-storage (the local "database")
- **Location:** expo-location (+ mock LA fallback) — Haversine distance
- **Notifications:** expo-notifications (native) / window.Notification (web)
- **Config:** `BACKEND='local'`, `NEARBY_RADIUS_KM=2.0`, `ALERT_POLL_INTERVAL_MS=60000`
- **Demo login:** `admin` / `admin123`
