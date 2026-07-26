// src/features/contacts/index.ts
// Public surface + manifest for Legend's core Contacts & Grading feature.

import { FEATURE_MANIFESTS, isFeatureEnabled } from '../../config/features';

export * from './types';
export * from './grading';
export { useContacts, ContactsProvider } from './ContactsContext';
export * as importExport from './importExport';
export { GradeBadge } from './components/GradeBadge';

export const contactsModule = {
  ...FEATURE_MANIFESTS.contacts,
  enabled: isFeatureEnabled('contacts'),
  routes: ['(app)/(tabs)/index', '(app)/contact/[id]', '(app)/contact/edit', '(app)/contacts-import'],
} as const;
