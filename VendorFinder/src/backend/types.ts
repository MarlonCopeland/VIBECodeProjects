// src/backend/types.ts
// The backend contract. Both the local (demo) and Supabase implementations
// satisfy `Backend`, so the rest of the app is backend-agnostic. Add a new
// backend by implementing this interface and wiring it in `backend/index.ts`.
//
// Vendor Finder extends the base UnjadedDigital contract (auth/profile/
// notifications) with the vendor domain: vendors, favorites/followers, typed
// broadcasts (with weekly quotas), subscriptions, and a users directory used by
// admin impersonation.

// ---- Domain primitives -----------------------------------------------------

export type UserRole = 'admin' | 'vendor' | 'user';

export type VendorType =
  | 'Food'
  | 'Clothes'
  | 'Activity'
  | 'Electronics'
  | 'Arts'
  | 'Services'
  | 'Other';

/** Subscription tier ids. The payments module (tiers.ts) provides the catalog. */
export type TierId = 'free' | 'tier1' | 'tier2' | 'tier3';

export type SubscriptionStatus = 'active' | 'trialing' | 'canceled' | 'past_due' | 'none';

/** Typed broadcast kinds a vendor can send to followers. */
export type NotificationTypeKey = 'open_for_business' | 'sale' | 'stock_update';

/** Quota buckets a send is counted against (see tiers.ts). */
export type QuotaBucket = 'open_for_business' | 'promotions' | 'combined';

export type AuthProviderKind = 'local' | 'email' | 'google' | 'facebook' | 'apple';

// ---- Users -----------------------------------------------------------------

export interface AppUser {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  avatarUrl: string | null;
  emailVerified: boolean;
  /** Optional free-form profile metadata (bio, phone, etc.). */
  metadata: Record<string, unknown>;
  createdAt: string;

  // --- Vendor Finder additions ---
  /** Login handle (email/username). */
  username?: string;
  /** Consumer interest tags used to personalize discovery. */
  interests?: string[];
  /** Back-pointer to this user's vendor record when role === 'vendor'. */
  vendorId?: string | null;
  provider?: AuthProviderKind;
  providerId?: string | null;
}

export interface Session {
  user: AppUser;
  accessToken?: string;
  expiresAt?: number;
}

export type OAuthProvider = 'google' | 'apple' | 'facebook';

export interface SignUpInput {
  email: string;
  password: string;
  displayName: string;
  /** Optional login handle; defaults to the email. */
  username?: string;
  /** Role to create the account with (user or vendor). Defaults to 'user'. */
  role?: UserRole;
}

export interface SignInInput {
  email: string;
  password: string;
}

/** Result of a sign-up: when email confirmation is on, `session` is null. */
export interface SignUpResult {
  user: AppUser | null;
  session: Session | null;
  needsEmailConfirmation: boolean;
}

export type AuthChangeCallback = (session: Session | null) => void;

export interface Unsubscribe {
  unsubscribe: () => void;
}

// ---- Vendors ---------------------------------------------------------------

export interface GeoPoint {
  latitude: number;
  longitude: number;
  address?: string | null;
}

export interface ScheduleSlot {
  day: string;
  start: string;
  end: string;
  latitude?: number | null;
  longitude?: number | null;
  address?: string | null;
}

export interface Vendor {
  id: string;
  name: string;
  type: VendorType;
  tags: string[];
  description: string;
  ownerId: string;
  blockedUserIds: string[];
  schedule: ScheduleSlot[];
  currentLocation: GeoPoint | null;
  isOpen: boolean;
  rating: number;
  subscriptionTier: TierId;
  subscriptionStatus: SubscriptionStatus;
  createdAt: number;
  /** Enriched at read time by the client (Haversine from the viewer). */
  distanceKm?: number | null;
}

export interface VendorFilter {
  /** Hide vendors that blocked this viewer. */
  viewerUserId?: string;
  /** Full-text over name/type/description/tags. */
  query?: string;
  type?: VendorType;
  tag?: string;
  openOnly?: boolean;
}

export interface VendorRegistration {
  name: string;
  type?: VendorType;
  tags?: string[];
  description?: string;
  ownerId: string;
  schedule?: ScheduleSlot[];
  currentLocation?: GeoPoint | null;
  isOpen?: boolean;
  subscriptionTier?: TierId;
  subscriptionStatus?: SubscriptionStatus;
}

export type VendorPatch = Partial<
  Pick<
    Vendor,
    | 'name'
    | 'type'
    | 'tags'
    | 'description'
    | 'blockedUserIds'
    | 'schedule'
    | 'currentLocation'
    | 'isOpen'
    | 'subscriptionTier'
    | 'subscriptionStatus'
  >
>;

// ---- Broadcasts (typed vendor → follower notifications) --------------------

export interface VendorNotification {
  id: string;
  vendorId: string;
  type: NotificationTypeKey;
  title: string;
  body: string;
  buckets: QuotaBucket[];
  recipientIds: string[];
  at: number;
}

export interface SendNotificationInput {
  type: NotificationTypeKey;
  title?: string;
  body?: string;
}

export interface SendNotificationResult {
  notification: VendorNotification;
  followers: AppUser[];
  remaining: number;
}

export type WeeklyUsage = Partial<Record<QuotaBucket, number>>;

// ---- Subscriptions ---------------------------------------------------------

export interface SubscriptionSummary {
  vendorId: string;
  tier: TierId;
  status: SubscriptionStatus;
}

// ---- API surfaces ----------------------------------------------------------

/** The auth surface every backend must provide. */
export interface AuthApi {
  getSession(): Promise<Session | null>;
  refreshSession(): Promise<Session | null>;
  onAuthStateChange(cb: AuthChangeCallback): Unsubscribe;

  signUpWithEmail(input: SignUpInput): Promise<SignUpResult>;
  signInWithEmail(input: SignInInput): Promise<Session>;
  signInWithProvider(provider: OAuthProvider): Promise<Session | null>;
  signInWithMagicLink(email: string): Promise<void>;

  sendPasswordReset(email: string): Promise<void>;
  updatePassword(newPassword: string): Promise<void>;

  resendVerification(email: string): Promise<void>;
  /** Confirm a verification code (local demo) or re-read status (Supabase). */
  confirmVerification(code: string): Promise<Session | null>;

  signOut(): Promise<void>;
}

/** Profile + account operations for the CURRENT user. */
export interface ProfileApi {
  getProfile(userId: string): Promise<AppUser | null>;
  updateProfile(
    userId: string,
    patch: Partial<Pick<AppUser, 'displayName' | 'avatarUrl' | 'metadata' | 'interests'>>,
  ): Promise<AppUser>;
  /** Upload an avatar and return its public URL. `fileUri` is a local file URI. */
  uploadAvatar(userId: string, fileUri: string): Promise<string>;
  deleteAccount(userId: string): Promise<void>;
}

/** Cross-user directory — used by admin listing + impersonation. */
export interface UsersApi {
  get(id: string): Promise<AppUser | null>;
  list(): Promise<AppUser[]>;
  update(id: string, patch: Partial<AppUser>): Promise<AppUser>;
}

/** Vendor CRUD + realtime. */
export interface VendorsApi {
  list(filter?: VendorFilter): Promise<Vendor[]>;
  get(id: string): Promise<Vendor | null>;
  getByOwner(ownerId: string): Promise<Vendor | null>;
  register(data: VendorRegistration): Promise<Vendor>;
  update(id: string, patch: VendorPatch): Promise<Vendor>;
  remove(id: string): Promise<void>;
  /** Subscribe to the vendor list (realtime where supported). Returns unsubscribe. */
  subscribe(cb: (vendors: Vendor[]) => void): () => void;
}

/** Favorites (a user following a vendor) + follower management. */
export interface FavoritesApi {
  list(userId: string): Promise<string[]>;
  add(userId: string, vendorId: string): Promise<void>;
  remove(userId: string, vendorId: string): Promise<void>;
  listFollowers(vendorId: string): Promise<AppUser[]>;
  blockFollower(vendorId: string, userId: string): Promise<void>;
  unblockFollower(vendorId: string, userId: string): Promise<void>;
  removeFollower(vendorId: string, userId: string): Promise<void>;
}

/** Typed broadcasts with server-/engine-enforced weekly quotas. */
export interface BroadcastsApi {
  send(vendorId: string, input: SendNotificationInput): Promise<SendNotificationResult>;
  list(vendorId?: string): Promise<VendorNotification[]>;
  listForUser(userId: string): Promise<VendorNotification[]>;
  getWeeklyUsage(vendorId: string): Promise<WeeklyUsage>;
}

/** Vendor subscription tier read/write. */
export interface SubscriptionsApi {
  get(vendorId: string): Promise<SubscriptionSummary | null>;
  setTier(vendorId: string, tierId: TierId, status?: SubscriptionStatus): Promise<Vendor>;
}

/** Push notification token persistence. */
export interface NotificationsApi {
  registerPushToken(userId: string, token: string): Promise<void>;
  removePushToken(userId: string, token: string): Promise<void>;
}

export interface Backend {
  readonly mode: 'local' | 'supabase';
  auth: AuthApi;
  profile: ProfileApi;
  users: UsersApi;
  vendors: VendorsApi;
  favorites: FavoritesApi;
  broadcasts: BroadcastsApi;
  subscriptions: SubscriptionsApi;
  notifications: NotificationsApi;
}
