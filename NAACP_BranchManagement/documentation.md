# NAACP Branch Management Platform - Documentation

This document serves as the architectural blueprint, database schema design, and technical roadmap for the NAACP Branch Management Platform. The ecosystem consists of two core applications sharing a unified logical model:
1. **React Native Expo Mobile Application**: Primarily for individual Members, providing digital membership cards, unit verification, and quick access to bylaws and the constitution.
2. **Next.js Web Administrative Portal**: For National/Regional (Org), Area Conference, and local Branch administrators to oversee rosters, manage events, and monitor compliance.

---

## 1. Architectural Overview

The platform uses a hierarchical multi-tenant design that mimics the actual organizational structure of the NAACP:

```
               [ National / Org Level ]
                          │
             ┌────────────┴────────────┐
   [ Area Conference A ]     [ Area Conference B ]
        │         │               │         │
   ┌────┴────┐ ┌──┴──┐         ┌──┴──┐   ┌──┴──┐
 [Branch 1]  [Branch 2]      [Branch 3] [Branch 4]
     │           │               │           │
 [Members]   [Members]       [Members]   [Members]
```

### Stack & Technologies
* **Web (Administrative Dashboard)**: 
  * Framework: **Next.js 14+ (App Router)**
  * UI Library: **React / Tailwind CSS**
  * Icons: **Lucide React**
  * State & Fetching: **React Context API / SWR or React Query**
* **Mobile (Member App)**:
  * Framework: **React Native with Expo**
  * Navigation: **Expo Router (File-based tab routing)**
  * Styling: **React Native StyleSheet / Tailwind (NativeWind)**
  * Storage: **SecureStore & Async Storage**

---

## 2. Shared Data Models & TypeScript Schemas

To ensure data integrity between the mobile and web portals, the following schemas are used.

### Membership Levels & Statuses
```typescript
export type MembershipStatus = 'CURRENT' | 'EXPIRED' | 'PENDING_RENEWAL' | 'LIFETIME_ACTIVE';

export type MembershipType = 
  | 'YOUTH_UNDER_14' 
  | 'YOUTH_14_20' 
  | 'REGULAR_ANNUAL' 
  | 'SILVER_LIFE' 
  | 'GOLD_LIFE' 
  | 'DIAMOND_LIFE';
```

### Hierarchy Schemas
```typescript
export interface AreaConference {
  id: string;
  name: string;      // e.g., "Texas State Conference", "Mid-Atlantic Area Conference"
  regionCode: string; // e.g., "Region VI"
  contactEmail: string;
  totalBranches: number;
}

export interface NAACPBranch {
  id: string;
  unitNumber: string; // e.g., "40AA", "3112"
  name: string;       // e.g., "Houston Branch", "Baltimore City Branch"
  areaConferenceId: string;
  status: 'ACTIVE' | 'PROBATION' | 'INACTIVE';
  presidentName: string;
  contactEmail: string;
}
```

### Member Schema
```typescript
export interface NAACP_Member {
  id: string;               // UUID or system ID
  memberId: string;         // NAACP-issued 7-8 digit Member ID
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dateOfBirth: string;      // ISO String
  membershipType: MembershipType;
  status: MembershipStatus;
  expirationDate: string | null; // null for Lifetime members
  joinDate: string;         // ISO String
  unitNumber: string;       // Assigned NAACP Branch unit
  areaConferenceId: string; // Assigned State/Area Conference
  photoUrl?: string;        // Profile picture for digital membership ID card
}
```

---

## 3. Web Application: Administrative Operations

Located under `/web`, the administrative app is designed to manage hierarchies, view global and granular stats, and interact with the member roster.

### Page Routes & Structure
* `/` - **Dashboard (Aggregated overview)**: Statistics on total active members, lifetime members, ratio of current vs expired memberships across Org, Area Conferences, and Branches.
* `/roster` - **Member Roster Directory**: Complete list of members with complex search (by name, ID, unit) and filters (by membership type, status, branch, area conference).
* `/roster/[id]` (or drawer view) - **Member Detail & Auditing Panel**: View precise dates, membership tier, historical renewals, and unit transfer logs.
* `/branches` - **Branch Registry**: View, search, and manage individual branches and their standing.
* `/settings` - **System Configurations**: Permission boundaries for National, State, and Branch admins.

---

## 4. Mobile Application: Member Portal

Located under `/mobile`, the mobile app is built using Expo for rapid, cross-platform deployment. It features high visual fidelity utilizing the NAACP brand colors (Deep Imperial Blue: `#002C6C`, Rich Gold: `#D4AF37`, Pure White: `#FFFFFF`).

### Folder Structure & Navigation
Using Expo Router's file-based layout:
```
mobile/
├── app/
│   ├── (tabs)/                # Main Tab Navigation
│   │   ├── _layout.tsx        # Tab configuration & icons
│   │   ├── index.tsx          # Member Home / Digital Membership Card
│   │   ├── docs/              # Documents (Constitution & Bylaws)
│   │   │   ├── _layout.tsx
│   │   │   ├── index.tsx      # Selector page
│   │   │   ├── bylaws.tsx     # Full Bylaws viewer
│   │   │   └── constitution.tsx # Full Constitution viewer
│   │   └── unit.tsx           # My Unit & Branch Information
│   └── _layout.tsx            # Root layout, Theme providers
├── assets/                    # Icons and images
├── components/                # Shared Mobile Components
│   └── MembershipCard.tsx     # Interactive rotatable Digital Membership ID card
└── constants/
    └── Colors.ts              # NAACP Palette Constants
```

---

## 5. Security & PWA Compliance

### Security
1. **Authentication (OAuth2/JWT)**: JWT-based secure sessions; mobile stores tokens in `Expo.SecureStore`.
2. **Data Isolation**: Unit administrators must strictly be isolated via middleware to only view/modify their own Branch roster, whereas Area Conference and National administrators have wider regional/global access.
3. **Data Protection**: PII data (emails, DOBs, physical addresses) must be encrypted in transit and hashed where necessary.

### PWA Readiness (Web Platform)
The Next.js admin app implements Next PWA settings in `next.config.js` to support local installation, service workers for offline lookup, and asset caching.

---

## 6. How to Run & Develop

### Prerequisites
* Node.js v18+ and npm or yarn installed.

### Developing the Mobile App (Expo)
```bash
cd mobile
npm install
npm run start
# Press 'a' for Android emulator, 'i' for iOS simulator, or scan the QR code in Expo Go
```

### Developing the Web App (Next.js)
```bash
cd web
npm install
npm run dev
# Open http://localhost:3000 to view the Admin Dashboard
```
