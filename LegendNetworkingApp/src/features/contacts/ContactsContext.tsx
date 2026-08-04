// src/features/contacts/ContactsContext.tsx
// Central state for Legend's contact graph. Loads contacts + the interaction
// log + circles once per signed-in user, computes grades in memory, and
// exposes CRUD that keeps local state in sync with the backend. Screens use
// `useContacts()` and never touch `backend.contacts` directly.

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { backend } from '../../backend';
import { useAuth } from '../auth/AuthContext';
import { useAppSettings } from '../settings/AppSettingsContext';
import { computeGrade, type Grade } from './grading';
import { dedupeAgainst } from './importExport';
import type {
  Circle,
  CircleInput,
  CirclePatch,
  Contact,
  ContactInput,
  ContactPatch,
  Interaction,
  InteractionInput,
} from './types';

export interface GradedContact {
  contact: Contact;
  grade: Grade;
}

export interface ImportSummary {
  added: number;
  skippedDuplicates: number;
}

interface ContactsContextValue {
  loading: boolean;
  contacts: Contact[];
  interactions: Interaction[];
  circles: Circle[];
  /** Contacts joined with their computed grade, unsorted. */
  graded: GradedContact[];
  gradeFor(contactId: string): Grade;
  contactById(id: string): Contact | undefined;
  interactionsFor(contactId: string): Interaction[];
  refresh(): Promise<void>;

  createContact(input: ContactInput): Promise<Contact>;
  updateContact(id: string, patch: ContactPatch): Promise<Contact>;
  deleteContact(id: string): Promise<void>;
  /** Bulk add with duplicate filtering (device/CSV import). */
  importContacts(inputs: ContactInput[]): Promise<ImportSummary>;

  logInteraction(input: InteractionInput): Promise<Interaction>;

  createCircle(input: CircleInput): Promise<Circle>;
  updateCircle(id: string, patch: CirclePatch): Promise<Circle>;
  deleteCircle(id: string): Promise<void>;
}

const ContactsContext = createContext<ContactsContextValue | null>(null);

const EMPTY_GRADE_INTERACTIONS: Interaction[] = [];

export function ContactsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { gradingConfig } = useAppSettings();
  const ownerId = user?.id ?? null;

  const [loading, setLoading] = useState(true);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [circles, setCircles] = useState<Circle[]>([]);

  const refresh = useCallback(async () => {
    if (!ownerId) {
      setContacts([]);
      setInteractions([]);
      setCircles([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [cs, is, cir] = await Promise.all([
        backend.contacts.listContacts(ownerId),
        backend.contacts.listInteractions(ownerId),
        backend.contacts.listCircles(ownerId),
      ]);
      setContacts(cs);
      setInteractions(is);
      setCircles(cir);
    } finally {
      setLoading(false);
    }
  }, [ownerId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const interactionsByContact = useMemo(() => {
    const map = new Map<string, Interaction[]>();
    for (const i of interactions) {
      const list = map.get(i.contactId);
      if (list) list.push(i);
      else map.set(i.contactId, [i]);
    }
    return map;
  }, [interactions]);

  const grades = useMemo(() => {
    const now = Date.now();
    const map = new Map<string, Grade>();
    for (const c of contacts) {
      map.set(
        c.id,
        computeGrade(interactionsByContact.get(c.id) ?? EMPTY_GRADE_INTERACTIONS, now, gradingConfig),
      );
    }
    return map;
  }, [contacts, interactionsByContact, gradingConfig]);

  const graded = useMemo<GradedContact[]>(
    () => contacts.map((contact) => ({ contact, grade: grades.get(contact.id)! })),
    [contacts, grades],
  );

  const requireOwner = useCallback((): string => {
    if (!ownerId) throw new Error('Not signed in');
    return ownerId;
  }, [ownerId]);

  const value: ContactsContextValue = useMemo(
    () => ({
      loading,
      contacts,
      interactions,
      circles,
      graded,
      gradeFor: (contactId) =>
        grades.get(contactId) ?? computeGrade(EMPTY_GRADE_INTERACTIONS, Date.now(), gradingConfig),
      contactById: (id) => contacts.find((c) => c.id === id),
      interactionsFor: (contactId) =>
        [...(interactionsByContact.get(contactId) ?? [])].sort(
          (a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt),
        ),
      refresh,

      async createContact(input) {
        const row = await backend.contacts.createContact(requireOwner(), input);
        setContacts((prev) => [...prev, row]);
        return row;
      },
      async updateContact(id, patch) {
        const row = await backend.contacts.updateContact(requireOwner(), id, patch);
        setContacts((prev) => prev.map((c) => (c.id === id ? row : c)));
        return row;
      },
      async deleteContact(id) {
        await backend.contacts.deleteContact(requireOwner(), id);
        setContacts((prev) => prev.filter((c) => c.id !== id));
        setInteractions((prev) => prev.filter((i) => i.contactId !== id));
      },
      async importContacts(inputs) {
        const owner = requireOwner();
        const { fresh, duplicates } = dedupeAgainst(contacts, inputs);
        const rows = await backend.contacts.createContacts(owner, fresh);
        setContacts((prev) => [...prev, ...rows]);
        return { added: rows.length, skippedDuplicates: duplicates.length };
      },

      async logInteraction(input) {
        const row = await backend.contacts.logInteraction(requireOwner(), input);
        setInteractions((prev) => [...prev, row]);
        return row;
      },

      async createCircle(input) {
        const row = await backend.contacts.createCircle(requireOwner(), input);
        setCircles((prev) => [...prev, row]);
        return row;
      },
      async updateCircle(id, patch) {
        const row = await backend.contacts.updateCircle(requireOwner(), id, patch);
        setCircles((prev) => prev.map((c) => (c.id === id ? row : c)));
        return row;
      },
      async deleteCircle(id) {
        await backend.contacts.deleteCircle(requireOwner(), id);
        setCircles((prev) => prev.filter((c) => c.id !== id));
      },
    }),
    [
      loading,
      contacts,
      interactions,
      circles,
      graded,
      grades,
      interactionsByContact,
      gradingConfig,
      refresh,
      requireOwner,
    ],
  );

  return <ContactsContext.Provider value={value}>{children}</ContactsContext.Provider>;
}

export function useContacts(): ContactsContextValue {
  const ctx = useContext(ContactsContext);
  if (!ctx) throw new Error('useContacts must be used inside ContactsProvider');
  return ctx;
}
