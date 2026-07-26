// src/backend/local/sql/sqliteContacts.ts
// ContactsApi implemented directly over SQL. Depends only on the SqlDriver
// interface (types.ts) plus an injected clock + id generator — never on
// expo-sqlite directly — so this exact file runs on-device (wired up in
// ../localContacts.ts with expoSqlDriver + the real HLC clock) and in plain
// Node tests (test/support/nodeSqlDriver.ts + a fake clock) against a real
// SQLite engine either way. See SYNC_DESIGN.md for why.
//
// KNOWN LIMITATION: PhoneEntry/EmailEntry have no stable id in the domain
// model, so phone/email edits are delete-and-reinsert (whole-array replace)
// rather than true per-item merge — tracked as TASKS.md Phase 8.2. Premises
// already carry an id, so they get real upsert-by-id merge. Circle
// pins/excludes are keyed by contact_id, already stable, so they also get
// real per-item merge.

import type { ContactsApi } from '../../types';
import type {
  Circle,
  CircleInput,
  CirclePatch,
  Contact,
  ContactInput,
  ContactPatch,
  Interaction,
  Premise,
} from '../../../features/contacts/types';
import { migrate } from './schema';
import type { Clock, IdGenerator, SqlDriver } from './types';

export type SqliteContactsDeps = Clock & IdGenerator;

// ---- raw row shapes ---------------------------------------------------

interface ContactRow {
  id: string;
  owner_id: string;
  first_name: string;
  last_name: string;
  nickname: string | null;
  company: string | null;
  title: string | null;
  avatar_url: string | null;
  where_met_place: string | null;
  where_met_city: string | null;
  where_met_note: string | null;
  notes: string | null;
  favorite: number;
  source: string;
  created_at: string;
  updated_at: string;
}
interface PhoneRow { id: string; contact_id: string; label: string; number: string }
interface EmailRow { id: string; contact_id: string; label: string; address: string }
interface PremiseRow { id: string; contact_id: string; kind: string; label: string; tags: string }
interface InteractionRow {
  id: string;
  contact_id: string;
  kind: string;
  occurred_at: string;
  note: string | null;
  premise_id: string | null;
}
interface CircleRow {
  id: string;
  owner_id: string;
  name: string;
  query_kinds: string;
  query_tags: string;
  query_text: string | null;
  created_at: string;
  updated_at: string;
}
interface LinkRow { circle_id: string; contact_id: string }

function inClause(n: number): string {
  return `(${Array(n).fill('?').join(',')})`;
}

function groupBy<T, K>(items: T[], key: (t: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k);
    if (list) list.push(item);
    else map.set(k, [item]);
  }
  return map;
}

export function createSqliteContacts(driver: SqlDriver, deps: SqliteContactsDeps): ContactsApi {
  const ready = migrate(driver);

  async function db(): Promise<SqlDriver> {
    await ready;
    return driver;
  }

  async function assembleContacts(rows: ContactRow[]): Promise<Contact[]> {
    if (rows.length === 0) return [];
    const d = await db();
    const ids = rows.map((r) => r.id);
    const clause = inClause(ids.length);
    const [phones, emails, premises] = await Promise.all([
      d.getAllAsync<PhoneRow>(
        `SELECT id, contact_id, label, number FROM contact_phones WHERE deleted_at IS NULL AND contact_id IN ${clause}`,
        ids,
      ),
      d.getAllAsync<EmailRow>(
        `SELECT id, contact_id, label, address FROM contact_emails WHERE deleted_at IS NULL AND contact_id IN ${clause}`,
        ids,
      ),
      d.getAllAsync<PremiseRow>(
        `SELECT id, contact_id, kind, label, tags FROM premises WHERE deleted_at IS NULL AND contact_id IN ${clause}`,
        ids,
      ),
    ]);

    const phonesBy = groupBy(phones, (p) => p.contact_id);
    const emailsBy = groupBy(emails, (e) => e.contact_id);
    const premisesBy = groupBy(premises, (p) => p.contact_id);

    return rows.map((r) => ({
      id: r.id,
      ownerId: r.owner_id,
      firstName: r.first_name,
      lastName: r.last_name,
      nickname: r.nickname ?? undefined,
      company: r.company ?? undefined,
      title: r.title ?? undefined,
      phones: (phonesBy.get(r.id) ?? []).map((p) => ({ label: p.label, number: p.number })),
      emails: (emailsBy.get(r.id) ?? []).map((e) => ({ label: e.label, address: e.address })),
      avatarUrl: r.avatar_url,
      whereMet: r.where_met_place
        ? {
            placeName: r.where_met_place,
            city: r.where_met_city ?? undefined,
            note: r.where_met_note ?? undefined,
          }
        : null,
      premises: (premisesBy.get(r.id) ?? []).map<Premise>((p) => ({
        id: p.id,
        kind: p.kind as Premise['kind'],
        label: p.label,
        tags: JSON.parse(p.tags) as string[],
      })),
      notes: r.notes ?? undefined,
      favorite: !!r.favorite,
      source: r.source as Contact['source'],
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  /** Replace phones/emails wholesale (see file header); upsert premises by id. */
  async function writeContactChildren(
    d: SqlDriver,
    contactId: string,
    input: Pick<ContactInput, 'phones' | 'emails' | 'premises'>,
    hlc: string,
    which: { phones: boolean; emails: boolean; premises: boolean },
  ): Promise<void> {
    if (which.phones) {
      await d.runAsync(
        `UPDATE contact_phones SET deleted_at = ? WHERE contact_id = ? AND deleted_at IS NULL`,
        [hlc, contactId],
      );
      for (const p of input.phones) {
        await d.runAsync(
          `INSERT INTO contact_phones (id, contact_id, label, number, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, NULL)`,
          [deps.genId(), contactId, p.label, p.number, hlc],
        );
      }
    }

    if (which.emails) {
      await d.runAsync(
        `UPDATE contact_emails SET deleted_at = ? WHERE contact_id = ? AND deleted_at IS NULL`,
        [hlc, contactId],
      );
      for (const e of input.emails) {
        await d.runAsync(
          `INSERT INTO contact_emails (id, contact_id, label, address, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, NULL)`,
          [deps.genId(), contactId, e.label, e.address, hlc],
        );
      }
    }

    if (which.premises) {
      const existing = await d.getAllAsync<{ id: string }>(
        `SELECT id FROM premises WHERE contact_id = ? AND deleted_at IS NULL`,
        [contactId],
      );
      const existingIds = new Set(existing.map((r) => r.id));
      const incomingIds = new Set(input.premises.map((p) => p.id));
      for (const id of existingIds) {
        if (!incomingIds.has(id)) {
          await d.runAsync(`UPDATE premises SET deleted_at = ? WHERE id = ?`, [hlc, id]);
        }
      }
      for (const p of input.premises) {
        if (existingIds.has(p.id)) {
          await d.runAsync(
            `UPDATE premises SET kind = ?, label = ?, tags = ?, updated_at = ? WHERE id = ?`,
            [p.kind, p.label, JSON.stringify(p.tags), hlc, p.id],
          );
        } else {
          await d.runAsync(
            `INSERT INTO premises (id, contact_id, kind, label, tags, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, NULL)`,
            [p.id, contactId, p.kind, p.label, JSON.stringify(p.tags), hlc],
          );
        }
      }
    }
  }

  function toInteraction(r: InteractionRow): Interaction {
    return {
      id: r.id,
      contactId: r.contact_id,
      kind: r.kind as Interaction['kind'],
      occurredAt: r.occurred_at,
      note: r.note ?? undefined,
      premiseId: r.premise_id ?? undefined,
    };
  }

  async function assembleCircles(d: SqlDriver, rows: CircleRow[]): Promise<Circle[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const clause = inClause(ids.length);
    const [pins, excludes] = await Promise.all([
      d.getAllAsync<LinkRow>(
        `SELECT circle_id, contact_id FROM circle_pins WHERE deleted_at IS NULL AND circle_id IN ${clause}`,
        ids,
      ),
      d.getAllAsync<LinkRow>(
        `SELECT circle_id, contact_id FROM circle_excludes WHERE deleted_at IS NULL AND circle_id IN ${clause}`,
        ids,
      ),
    ]);
    const pinsBy = groupBy(pins, (p) => p.circle_id);
    const excludesBy = groupBy(excludes, (e) => e.circle_id);
    return rows.map((r) => ({
      id: r.id,
      ownerId: r.owner_id,
      name: r.name,
      query: {
        kinds: JSON.parse(r.query_kinds),
        tags: JSON.parse(r.query_tags),
        text: r.query_text ?? undefined,
      },
      pinnedContactIds: (pinsBy.get(r.id) ?? []).map((p) => p.contact_id),
      excludedContactIds: (excludesBy.get(r.id) ?? []).map((e) => e.contact_id),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  async function currentLinks(
    d: SqlDriver,
    table: 'circle_pins' | 'circle_excludes',
    circleId: string,
  ): Promise<string[]> {
    const rows = await d.getAllAsync<LinkRow>(
      `SELECT circle_id, contact_id FROM ${table} WHERE circle_id = ? AND deleted_at IS NULL`,
      [circleId],
    );
    return rows.map((r) => r.contact_id);
  }

  async function syncLinks(
    d: SqlDriver,
    table: 'circle_pins' | 'circle_excludes',
    circleId: string,
    current: string[],
    next: string[],
    hlc: string,
  ): Promise<void> {
    const currentSet = new Set(current);
    const nextSet = new Set(next);
    for (const contactId of currentSet) {
      if (!nextSet.has(contactId)) {
        await d.runAsync(
          `UPDATE ${table} SET deleted_at = ? WHERE circle_id = ? AND contact_id = ? AND deleted_at IS NULL`,
          [hlc, circleId, contactId],
        );
      }
    }
    for (const contactId of nextSet) {
      if (!currentSet.has(contactId)) {
        await d.runAsync(
          `INSERT INTO ${table} (id, circle_id, contact_id, updated_at, deleted_at) VALUES (?, ?, ?, ?, NULL)`,
          [deps.genId(), circleId, contactId, hlc],
        );
      }
    }
  }

  const api: ContactsApi = {
    async listContacts(ownerId) {
      const d = await db();
      const rows = await d.getAllAsync<ContactRow>(
        `SELECT * FROM contacts WHERE owner_id = ? AND deleted_at IS NULL`,
        [ownerId],
      );
      return assembleContacts(rows);
    },

    async createContact(ownerId, input) {
      const d = await db();
      const id = deps.genId();
      const hlc = await deps.nextHlc();
      await d.runAsync(
        `INSERT INTO contacts (id, owner_id, first_name, last_name, nickname, company, title, avatar_url,
          where_met_place, where_met_city, where_met_note, notes, favorite, source, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
        [
          id,
          ownerId,
          input.firstName,
          input.lastName,
          input.nickname ?? null,
          input.company ?? null,
          input.title ?? null,
          input.avatarUrl,
          input.whereMet?.placeName ?? null,
          input.whereMet?.city ?? null,
          input.whereMet?.note ?? null,
          input.notes ?? null,
          input.favorite ? 1 : 0,
          input.source,
          hlc,
          hlc,
        ],
      );
      await writeContactChildren(d, id, input, hlc, { phones: true, emails: true, premises: true });
      const rows = await d.getAllAsync<ContactRow>(`SELECT * FROM contacts WHERE id = ?`, [id]);
      return (await assembleContacts(rows))[0]!;
    },

    async createContacts(ownerId, inputs) {
      const results: Contact[] = [];
      for (const input of inputs) {
        results.push(await api.createContact(ownerId, input));
      }
      return results;
    },

    async updateContact(ownerId, id, patch) {
      const d = await db();
      const existingRows = await d.getAllAsync<ContactRow>(
        `SELECT * FROM contacts WHERE id = ? AND owner_id = ? AND deleted_at IS NULL`,
        [id, ownerId],
      );
      if (existingRows.length === 0) throw new Error('Contact not found');
      const hlc = await deps.nextHlc();

      const sets: string[] = ['updated_at = ?'];
      const params: unknown[] = [hlc];
      const simpleFields: [keyof ContactPatch, string][] = [
        ['firstName', 'first_name'],
        ['lastName', 'last_name'],
        ['nickname', 'nickname'],
        ['company', 'company'],
        ['title', 'title'],
        ['avatarUrl', 'avatar_url'],
        ['notes', 'notes'],
        ['source', 'source'],
      ];
      for (const [key, col] of simpleFields) {
        if (patch[key] !== undefined) {
          sets.push(`${col} = ?`);
          params.push(patch[key] ?? null);
        }
      }
      if (patch.favorite !== undefined) {
        sets.push('favorite = ?');
        params.push(patch.favorite ? 1 : 0);
      }
      if (patch.whereMet !== undefined) {
        sets.push('where_met_place = ?', 'where_met_city = ?', 'where_met_note = ?');
        params.push(
          patch.whereMet?.placeName ?? null,
          patch.whereMet?.city ?? null,
          patch.whereMet?.note ?? null,
        );
      }
      params.push(id, ownerId);
      await d.runAsync(`UPDATE contacts SET ${sets.join(', ')} WHERE id = ? AND owner_id = ?`, params);

      if (patch.phones !== undefined || patch.emails !== undefined || patch.premises !== undefined) {
        await writeContactChildren(
          d,
          id,
          { phones: patch.phones ?? [], emails: patch.emails ?? [], premises: patch.premises ?? [] },
          hlc,
          {
            phones: patch.phones !== undefined,
            emails: patch.emails !== undefined,
            premises: patch.premises !== undefined,
          },
        );
      }

      const rows = await d.getAllAsync<ContactRow>(`SELECT * FROM contacts WHERE id = ?`, [id]);
      return (await assembleContacts(rows))[0]!;
    },

    async deleteContact(ownerId, id) {
      const d = await db();
      const hlc = await deps.nextHlc();
      await d.runAsync(`UPDATE contacts SET deleted_at = ? WHERE id = ? AND owner_id = ?`, [hlc, id, ownerId]);
      await d.runAsync(
        `UPDATE contact_phones SET deleted_at = ? WHERE contact_id = ? AND deleted_at IS NULL`,
        [hlc, id],
      );
      await d.runAsync(
        `UPDATE contact_emails SET deleted_at = ? WHERE contact_id = ? AND deleted_at IS NULL`,
        [hlc, id],
      );
      await d.runAsync(`UPDATE premises SET deleted_at = ? WHERE contact_id = ? AND deleted_at IS NULL`, [hlc, id]);
      await d.runAsync(
        `UPDATE interactions SET deleted_at = ? WHERE contact_id = ? AND deleted_at IS NULL`,
        [hlc, id],
      );
      await d.runAsync(
        `UPDATE circle_pins SET deleted_at = ? WHERE contact_id = ? AND deleted_at IS NULL`,
        [hlc, id],
      );
      await d.runAsync(
        `UPDATE circle_excludes SET deleted_at = ? WHERE contact_id = ? AND deleted_at IS NULL`,
        [hlc, id],
      );
    },

    async listInteractions(ownerId) {
      const d = await db();
      const contactRows = await d.getAllAsync<{ id: string }>(
        `SELECT id FROM contacts WHERE owner_id = ? AND deleted_at IS NULL`,
        [ownerId],
      );
      if (contactRows.length === 0) return [];
      const ids = contactRows.map((r) => r.id);
      const rows = await d.getAllAsync<InteractionRow>(
        `SELECT * FROM interactions WHERE deleted_at IS NULL AND contact_id IN ${inClause(ids.length)}`,
        ids,
      );
      return rows.map(toInteraction);
    },

    async logInteraction(ownerId, input) {
      const d = await db();
      const owned = await d.getFirstAsync<{ id: string }>(
        `SELECT id FROM contacts WHERE id = ? AND owner_id = ? AND deleted_at IS NULL`,
        [input.contactId, ownerId],
      );
      if (!owned) throw new Error('Contact not found');
      const id = deps.genId();
      const occurredAt = input.occurredAt ?? new Date().toISOString();
      await d.runAsync(
        `INSERT INTO interactions (id, contact_id, kind, occurred_at, note, premise_id, deleted_at) VALUES (?, ?, ?, ?, ?, ?, NULL)`,
        [id, input.contactId, input.kind, occurredAt, input.note ?? null, input.premiseId ?? null],
      );
      return {
        id,
        contactId: input.contactId,
        kind: input.kind,
        occurredAt,
        note: input.note,
        premiseId: input.premiseId,
      };
    },

    async deleteInteraction(ownerId, id) {
      const d = await db();
      const hlc = await deps.nextHlc();
      await d.runAsync(
        `UPDATE interactions SET deleted_at = ?
         WHERE id = ? AND contact_id IN (SELECT id FROM contacts WHERE owner_id = ?)`,
        [hlc, id, ownerId],
      );
    },

    async listCircles(ownerId) {
      const d = await db();
      const rows = await d.getAllAsync<CircleRow>(
        `SELECT * FROM circles WHERE owner_id = ? AND deleted_at IS NULL`,
        [ownerId],
      );
      return assembleCircles(d, rows);
    },

    async createCircle(ownerId, input: CircleInput) {
      const d = await db();
      const id = deps.genId();
      const hlc = await deps.nextHlc();
      await d.runAsync(
        `INSERT INTO circles (id, owner_id, name, query_kinds, query_tags, query_text, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
        [
          id,
          ownerId,
          input.name,
          JSON.stringify(input.query.kinds),
          JSON.stringify(input.query.tags),
          input.query.text ?? null,
          hlc,
          hlc,
        ],
      );
      await syncLinks(d, 'circle_pins', id, [], input.pinnedContactIds ?? [], hlc);
      await syncLinks(d, 'circle_excludes', id, [], input.excludedContactIds ?? [], hlc);
      const row = await d.getFirstAsync<CircleRow>(`SELECT * FROM circles WHERE id = ?`, [id]);
      return (await assembleCircles(d, [row!]))[0]!;
    },

    async updateCircle(ownerId, id, patch: CirclePatch) {
      const d = await db();
      const existing = await d.getFirstAsync<CircleRow>(
        `SELECT * FROM circles WHERE id = ? AND owner_id = ? AND deleted_at IS NULL`,
        [id, ownerId],
      );
      if (!existing) throw new Error('Circle not found');
      const hlc = await deps.nextHlc();

      const sets: string[] = ['updated_at = ?'];
      const params: unknown[] = [hlc];
      if (patch.name !== undefined) {
        sets.push('name = ?');
        params.push(patch.name);
      }
      if (patch.query !== undefined) {
        sets.push('query_kinds = ?', 'query_tags = ?', 'query_text = ?');
        params.push(
          JSON.stringify(patch.query.kinds),
          JSON.stringify(patch.query.tags),
          patch.query.text ?? null,
        );
      }
      params.push(id, ownerId);
      await d.runAsync(`UPDATE circles SET ${sets.join(', ')} WHERE id = ? AND owner_id = ?`, params);

      if (patch.pinnedContactIds !== undefined) {
        const current = await currentLinks(d, 'circle_pins', id);
        await syncLinks(d, 'circle_pins', id, current, patch.pinnedContactIds, hlc);
      }
      if (patch.excludedContactIds !== undefined) {
        const current = await currentLinks(d, 'circle_excludes', id);
        await syncLinks(d, 'circle_excludes', id, current, patch.excludedContactIds, hlc);
      }

      const row = await d.getFirstAsync<CircleRow>(`SELECT * FROM circles WHERE id = ?`, [id]);
      return (await assembleCircles(d, [row!]))[0]!;
    },

    async deleteCircle(ownerId, id) {
      const d = await db();
      const hlc = await deps.nextHlc();
      await d.runAsync(`UPDATE circles SET deleted_at = ? WHERE id = ? AND owner_id = ?`, [hlc, id, ownerId]);
      await d.runAsync(
        `UPDATE circle_pins SET deleted_at = ? WHERE circle_id = ? AND deleted_at IS NULL`,
        [hlc, id],
      );
      await d.runAsync(
        `UPDATE circle_excludes SET deleted_at = ? WHERE circle_id = ? AND deleted_at IS NULL`,
        [hlc, id],
      );
    },
  };

  return api;
}
