// src/app/routes.tsx
// Every desktop screen, mapped to the phone route it mirrors. Screens are
// lazy so the 3D map (three.js) only loads when the Network view opens.

import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

export interface RouteDef {
  pattern: string;
  screen: LazyExoticComponent<ComponentType>;
}

const s = (load: () => Promise<{ default: ComponentType }>) => lazy(load);

/** Signed-out (auth) routes — phone: app/(auth)/*. */
export const AUTH_ROUTES: RouteDef[] = [
  { pattern: '/login', screen: s(() => import('../screens/auth/LoginScreen')) },
  { pattern: '/signup', screen: s(() => import('../screens/auth/SignupScreen')) },
  { pattern: '/forgot-password', screen: s(() => import('../screens/auth/ForgotPasswordScreen')) },
  { pattern: '/reset-password', screen: s(() => import('../screens/auth/ResetPasswordScreen')) },
  { pattern: '/verify-email', screen: s(() => import('../screens/auth/VerifyEmailScreen')) },
];

/** Signed-in routes — phone: app/(app)/*. */
export const APP_ROUTES: RouteDef[] = [
  // Contacts tab + contact detail (master/detail on desktop).
  { pattern: '/contacts', screen: s(() => import('../screens/contacts/ContactsScreen')) },
  { pattern: '/contacts/:id', screen: s(() => import('../screens/contacts/ContactsScreen')) },
  { pattern: '/contact/new', screen: s(() => import('../screens/contacts/ContactEditScreen')) },
  { pattern: '/contact/:id/edit', screen: s(() => import('../screens/contacts/ContactEditScreen')) },
  { pattern: '/import', screen: s(() => import('../screens/contacts/ImportScreen')) },
  // Desktop-only: 3D map of contacts, premises and Knows Connections.
  { pattern: '/network', screen: s(() => import('../screens/network/NetworkScreen')) },
  // Circles + outreach.
  { pattern: '/circles', screen: s(() => import('../screens/circles/CirclesScreen')) },
  { pattern: '/circle/new', screen: s(() => import('../screens/circles/CircleEditScreen')) },
  { pattern: '/circle/:id/edit', screen: s(() => import('../screens/circles/CircleEditScreen')) },
  { pattern: '/circle/:id', screen: s(() => import('../screens/circles/CircleDetailScreen')) },
  { pattern: '/outreach/text', screen: s(() => import('../screens/outreach/TextBlastScreen')) },
  { pattern: '/outreach/email', screen: s(() => import('../screens/outreach/EmailBlastScreen')) },
  { pattern: '/outreach/calls', screen: s(() => import('../screens/outreach/CallListScreen')) },
  // Profile + settings.
  { pattern: '/profile', screen: s(() => import('../screens/profile/ProfileScreen')) },
  { pattern: '/profile/edit', screen: s(() => import('../screens/profile/ProfileEditScreen')) },
  { pattern: '/settings', screen: s(() => import('../screens/settings/SettingsScreen')) },
  { pattern: '/settings/grading', screen: s(() => import('../screens/settings/GradingScreen')) },
  { pattern: '/settings/rarity', screen: s(() => import('../screens/settings/RarityScreen')) },
  { pattern: '/settings/sync', screen: s(() => import('../screens/settings/SyncScreen')) },
  { pattern: '/settings/templates', screen: s(() => import('../screens/settings/TemplatesScreen')) },
  { pattern: '/subscription', screen: s(() => import('../screens/settings/SubscriptionScreen')) },
  { pattern: '/tutorial', screen: s(() => import('../screens/settings/TutorialScreen')) },
];
