// src/backend/types.ts
// The backend contract. Both the local (demo) and Supabase implementations
// satisfy `Backend`, so the rest of the app is backend-agnostic. Add a new
// backend by implementing this interface and wiring it in `backend/index.ts`.

import type {
  Circle,
  CircleInput,
  CirclePatch,
  Contact,
  ContactInput,
  ContactPatch,
  Interaction,
  InteractionInput,
} from '../features/contacts/types';

export type {
  Circle,
  CircleInput,
  CirclePatch,
  Contact,
  ContactInput,
  ContactPatch,
  Interaction,
  InteractionInput,
} from '../features/contacts/types';

export type UserRole = 'admin' | 'user';

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
}

export interface Session {
  user: AppUser;
  accessToken?: string;
  expiresAt?: number;
}

export type OAuthProvider = 'google' | 'apple';

export interface SignUpInput {
  email: string;
  password: string;
  displayName: string;
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

/** Which emailed code is being redeemed. */
export type EmailOtpKind = 'signup' | 'recovery';

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
  /**
   * Consume an auth redirect deep link (password recovery, email
   * confirmation) and establish whatever session it carries. Returns null
   * when the link carries no credentials. Throws when the link is expired or
   * malformed, so callers can show the user a real reason.
   */
  redeemAuthLink(url: string): Promise<Session | null>;
  /**
   * Confirm a signup, or open a password reset, using the emailed CODE instead
   * of the link. A code works from any device; a link only works on the device
   * that opens it, which strands anyone who signs up on one device and reads
   * email on another.
   */
  verifyEmailOtp(email: string, token: string, kind: EmailOtpKind): Promise<Session>;

  resendVerification(email: string): Promise<void>;

  signOut(): Promise<void>;
}

/** Profile + account operations. */
export interface ProfileApi {
  getProfile(userId: string): Promise<AppUser | null>;
  updateProfile(userId: string, patch: Partial<Pick<AppUser, 'displayName' | 'avatarUrl' | 'metadata'>>): Promise<AppUser>;
  /** Upload an avatar and return its public URL. `data` is a local file URI. */
  uploadAvatar(userId: string, fileUri: string): Promise<string>;
  deleteAccount(userId: string): Promise<void>;
}

/** Push notification token persistence. */
export interface NotificationsApi {
  registerPushToken(userId: string, token: string): Promise<void>;
  removePushToken(userId: string, token: string): Promise<void>;
}

/**
 * Legend's contact graph: contacts, the interaction log (the source of truth
 * for grading), and circles of influence. Everything is owner-scoped.
 */
export interface ContactsApi {
  listContacts(ownerId: string): Promise<Contact[]>;
  createContact(ownerId: string, input: ContactInput): Promise<Contact>;
  /** Bulk create (device/CSV import). Returns the created rows. */
  createContacts(ownerId: string, inputs: ContactInput[]): Promise<Contact[]>;
  updateContact(ownerId: string, id: string, patch: ContactPatch): Promise<Contact>;
  /** Also removes the contact's interactions. */
  deleteContact(ownerId: string, id: string): Promise<void>;

  listInteractions(ownerId: string): Promise<Interaction[]>;
  logInteraction(ownerId: string, input: InteractionInput): Promise<Interaction>;
  deleteInteraction(ownerId: string, id: string): Promise<void>;

  listCircles(ownerId: string): Promise<Circle[]>;
  createCircle(ownerId: string, input: CircleInput): Promise<Circle>;
  updateCircle(ownerId: string, id: string, patch: CirclePatch): Promise<Circle>;
  deleteCircle(ownerId: string, id: string): Promise<void>;
}

export interface Backend {
  readonly mode: 'local' | 'supabase';
  auth: AuthApi;
  profile: ProfileApi;
  notifications: NotificationsApi;
  contacts: ContactsApi;
}
