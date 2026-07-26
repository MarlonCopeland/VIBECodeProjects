// src/backend/supabase/supabaseContacts.ts
// Supabase implementation of ContactsApi.
//
// Data model (see supabase/migrations/0002_contacts.sql):
//   public.contacts      : owner-scoped contact rows (jsonb for phones/emails/
//                          premises/where_met)
//   public.interactions  : the interaction log (grading source of truth)
//   public.circles       : circles of influence (jsonb premise query)
// RLS restricts every row to auth.uid() = owner_id, so the ownerId argument
// is belt-and-braces on top of policy enforcement.

import { getSupabase } from './client';
import type { ContactsApi } from '../types';
import type {
  Circle,
  CircleInput,
  CirclePatch,
  Contact,
  ContactInput,
  ContactPatch,
  Interaction,
  InteractionInput,
} from '../../features/contacts/types';

type Row = Record<string, unknown>;

function toContact(r: Row): Contact {
  return {
    id: r.id as string,
    ownerId: r.owner_id as string,
    firstName: (r.first_name as string) ?? '',
    lastName: (r.last_name as string) ?? '',
    nickname: (r.nickname as string) ?? undefined,
    company: (r.company as string) ?? undefined,
    title: (r.title as string) ?? undefined,
    phones: (r.phones as Contact['phones']) ?? [],
    emails: (r.emails as Contact['emails']) ?? [],
    avatarUrl: (r.avatar_url as string) ?? null,
    whereMet: (r.where_met as Contact['whereMet']) ?? null,
    premises: (r.premises as Contact['premises']) ?? [],
    notes: (r.notes as string) ?? undefined,
    favorite: !!r.favorite,
    source: (r.source as Contact['source']) ?? 'manual',
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

function contactRow(ownerId: string | null, input: ContactPatch): Row {
  const row: Row = {};
  if (ownerId) row.owner_id = ownerId;
  if (input.firstName !== undefined) row.first_name = input.firstName;
  if (input.lastName !== undefined) row.last_name = input.lastName;
  if (input.nickname !== undefined) row.nickname = input.nickname ?? null;
  if (input.company !== undefined) row.company = input.company ?? null;
  if (input.title !== undefined) row.title = input.title ?? null;
  if (input.phones !== undefined) row.phones = input.phones;
  if (input.emails !== undefined) row.emails = input.emails;
  if (input.avatarUrl !== undefined) row.avatar_url = input.avatarUrl;
  if (input.whereMet !== undefined) row.where_met = input.whereMet;
  if (input.premises !== undefined) row.premises = input.premises;
  if (input.notes !== undefined) row.notes = input.notes ?? null;
  if (input.favorite !== undefined) row.favorite = input.favorite;
  if (input.source !== undefined) row.source = input.source;
  return row;
}

function toInteraction(r: Row): Interaction {
  return {
    id: r.id as string,
    contactId: r.contact_id as string,
    kind: r.kind as Interaction['kind'],
    occurredAt: r.occurred_at as string,
    note: (r.note as string) ?? undefined,
    premiseId: (r.premise_id as string) ?? undefined,
  };
}

function toCircle(r: Row): Circle {
  return {
    id: r.id as string,
    ownerId: r.owner_id as string,
    name: (r.name as string) ?? '',
    query: (r.query as Circle['query']) ?? { kinds: [], tags: [] },
    pinnedContactIds: (r.pinned_contact_ids as string[]) ?? [],
    excludedContactIds: (r.excluded_contact_ids as string[]) ?? [],
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

export const supabaseContacts: ContactsApi = {
  async listContacts(ownerId: string): Promise<Contact[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase.from('contacts').select('*').eq('owner_id', ownerId);
    if (error) throw error;
    return (data ?? []).map(toContact);
  },

  async createContact(ownerId: string, input: ContactInput): Promise<Contact> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('contacts')
      .insert(contactRow(ownerId, input))
      .select('*')
      .single();
    if (error) throw error;
    return toContact(data);
  },

  async createContacts(ownerId: string, inputs: ContactInput[]): Promise<Contact[]> {
    if (inputs.length === 0) return [];
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('contacts')
      .insert(inputs.map((i) => contactRow(ownerId, i)))
      .select('*');
    if (error) throw error;
    return (data ?? []).map(toContact);
  },

  async updateContact(ownerId: string, id: string, patch: ContactPatch): Promise<Contact> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('contacts')
      .update({ ...contactRow(null, patch), updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('owner_id', ownerId)
      .select('*')
      .single();
    if (error) throw error;
    return toContact(data);
  },

  async deleteContact(ownerId: string, id: string): Promise<void> {
    // interactions cascade via FK; pins/exclusions are cleaned client-side on
    // next circle save (they're just dangling ids until then).
    const supabase = getSupabase();
    const { error } = await supabase.from('contacts').delete().eq('id', id).eq('owner_id', ownerId);
    if (error) throw error;
  },

  async listInteractions(ownerId: string): Promise<Interaction[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('interactions')
      .select('*')
      .eq('owner_id', ownerId);
    if (error) throw error;
    return (data ?? []).map(toInteraction);
  },

  async logInteraction(ownerId: string, input: InteractionInput): Promise<Interaction> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('interactions')
      .insert({
        owner_id: ownerId,
        contact_id: input.contactId,
        kind: input.kind,
        occurred_at: input.occurredAt ?? new Date().toISOString(),
        note: input.note ?? null,
        premise_id: input.premiseId ?? null,
      })
      .select('*')
      .single();
    if (error) throw error;
    return toInteraction(data);
  },

  async deleteInteraction(ownerId: string, id: string): Promise<void> {
    const supabase = getSupabase();
    const { error } = await supabase
      .from('interactions')
      .delete()
      .eq('id', id)
      .eq('owner_id', ownerId);
    if (error) throw error;
  },

  async listCircles(ownerId: string): Promise<Circle[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase.from('circles').select('*').eq('owner_id', ownerId);
    if (error) throw error;
    return (data ?? []).map(toCircle);
  },

  async createCircle(ownerId: string, input: CircleInput): Promise<Circle> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('circles')
      .insert({
        owner_id: ownerId,
        name: input.name,
        query: input.query,
        pinned_contact_ids: input.pinnedContactIds ?? [],
        excluded_contact_ids: input.excludedContactIds ?? [],
      })
      .select('*')
      .single();
    if (error) throw error;
    return toCircle(data);
  },

  async updateCircle(ownerId: string, id: string, patch: CirclePatch): Promise<Circle> {
    const supabase = getSupabase();
    const row: Row = { updated_at: new Date().toISOString() };
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.query !== undefined) row.query = patch.query;
    if (patch.pinnedContactIds !== undefined) row.pinned_contact_ids = patch.pinnedContactIds;
    if (patch.excludedContactIds !== undefined) row.excluded_contact_ids = patch.excludedContactIds;
    const { data, error } = await supabase
      .from('circles')
      .update(row)
      .eq('id', id)
      .eq('owner_id', ownerId)
      .select('*')
      .single();
    if (error) throw error;
    return toCircle(data);
  },

  async deleteCircle(ownerId: string, id: string): Promise<void> {
    const supabase = getSupabase();
    const { error } = await supabase.from('circles').delete().eq('id', id).eq('owner_id', ownerId);
    if (error) throw error;
  },
};
