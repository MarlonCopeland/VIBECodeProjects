// src/backend/local/sql/seed.ts
// Demo network, seeded once through the real ContactsApi (so it exercises
// the exact same code path a user's own writes would) and gated on a
// persisted `meta` flag — not an in-memory boolean — so deleting every
// contact doesn't bring the demo network back on next launch.

import * as Crypto from 'expo-crypto';
import type { ContactsApi } from '../../types';
import type { SqlDriver } from './types';
import { hasSeeded, markSeeded } from './schema';
import type { Interaction, Premise } from '../../../features/contacts/types';

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString();
}

function premise(kind: Premise['kind'], label: string, tags: string[]): Premise {
  return { id: Crypto.randomUUID(), kind, label, tags };
}

interface SeedSpec {
  first: string;
  last: string;
  company?: string;
  title?: string;
  phone?: string;
  email?: string;
  place?: string;
  city?: string;
  premises: Premise[];
  log: [Interaction['kind'], number, string?][];
}

function buildSpecs(): SeedSpec[] {
  return [
    {
      first: 'Andre', last: 'Whitfield', company: 'Whitfield Realty', title: 'Broker',
      phone: '+15551230001', email: 'andre@whitfieldrealty.com',
      place: 'Chamber of Commerce mixer', city: 'Atlanta',
      premises: [
        premise('topic', 'real estate investing', ['real-estate', 'investing']),
        premise('event', 'Chamber mixer', ['chamber', 'business']),
      ],
      log: [['visit', 3], ['call', 6], ['visit', 12, 'Walked the Eastside property'], ['text', 1], ['call', 18], ['visit', 25], ['premise', 9, 'Chamber breakfast'], ['text', 4]],
    },
    {
      first: 'Simone', last: 'Baptiste', company: 'Baptiste & Cole LLP', title: 'Attorney',
      phone: '+15551230002', email: 'simone@baptistecole.com',
      place: 'NAACP Gala', city: 'Atlanta',
      premises: [
        premise('expertise', 'contract law', ['legal', 'contracts']),
        premise('event', 'NAACP Gala 2026', ['naacp', 'civic', 'fundraiser']),
      ],
      log: [['call', 8], ['email', 15], ['visit', 30, 'Lunch downtown'], ['text', 5], ['premise', 40, 'Sat together at the gala'], ['call', 50]],
    },
    {
      first: 'Marcus', last: 'Okafor', company: 'Okafor Analytics', title: 'Founder',
      phone: '+15551230003', email: 'marcus@okafor.ai',
      place: 'AI Builders meetup', city: 'Atlanta',
      premises: [
        premise('topic', 'applied AI', ['ai', 'startups', 'tech']),
        premise('interest', 'jazz', ['jazz', 'music']),
      ],
      log: [['visit', 20, 'Demo night'], ['text', 10], ['email', 35], ['call', 55], ['premise', 14, 'Meetup panel']],
    },
    {
      first: 'Keisha', last: 'Daniels', company: 'City of Atlanta', title: 'Program Manager',
      phone: '+15551230004', email: 'kdaniels@atlantaga.gov',
      place: 'Community town hall', city: 'Atlanta',
      premises: [premise('topic', 'civic engagement', ['civic', 'community', 'policy'])],
      log: [['call', 28], ['email', 45], ['text', 60], ['visit', 90, 'Town hall follow-up coffee']],
    },
    {
      first: 'Darnell', last: 'Reeves', company: 'Reeves Financial', title: 'CPA',
      phone: '+15551230005', email: 'darnell@reevesfin.com',
      place: 'Golf outing', city: 'Decatur',
      premises: [
        premise('expertise', 'small-business accounting', ['accounting', 'small-business', 'taxes']),
        premise('hobby', 'golf', ['golf']),
      ],
      log: [['visit', 40, 'Back nine at Sugar Creek'], ['text', 22], ['email', 70]],
    },
    {
      first: 'Alicia', last: 'Fontaine', company: 'Fontaine Creative', title: 'Designer',
      phone: '+15551230006', email: 'alicia@fontaine.design',
      place: 'Design conference', city: 'Nashville',
      premises: [premise('expertise', 'brand design', ['design', 'branding', 'creative'])],
      log: [['email', 65], ['call', 95], ['text', 120]],
    },
    {
      first: 'Terrence', last: 'Hood', company: 'Hood Logistics',
      phone: '+15551230007', email: 'terrence@hoodlogistics.com',
      place: 'Church', city: 'Atlanta',
      premises: [
        premise('place', 'New Hope Baptist', ['church', 'community']),
        premise('hobby', 'basketball', ['basketball', 'sports']),
      ],
      log: [['premise', 50, 'Sunday service'], ['text', 75], ['visit', 130, 'Pickup game']],
    },
    {
      first: 'Renee', last: 'Calloway', company: 'Morehouse College', title: 'Professor',
      phone: '+15551230008', email: 'rcalloway@morehouse.edu',
      place: 'Alumni panel', city: 'Atlanta',
      premises: [premise('topic', 'education equity', ['education', 'mentorship', 'civic'])],
      log: [['email', 85], ['call', 140]],
    },
    {
      first: 'Jamal', last: 'Pierce', title: 'Chess club organizer',
      phone: '+15551230009', email: 'jamal.pierce@gmail.com',
      place: 'Piedmont Park chess tables', city: 'Atlanta',
      premises: [premise('hobby', 'chess', ['chess', 'games'])],
      log: [['visit', 160, 'Casual games in the park'], ['text', 200]],
    },
    {
      first: 'Yvette', last: 'Sandoval', company: 'Sandoval Imports',
      phone: '+15551230010', email: 'yvette@sandovalimports.com',
      place: 'Trade expo', city: 'Miami',
      premises: [premise('topic', 'import/export', ['trade', 'business'])],
      log: [['email', 240, 'Post-expo intro thread']],
    },
    {
      first: 'Omar', last: 'Bennett', company: 'Bennett Builds', title: 'Contractor',
      phone: '+15551230011', email: 'omar@bennettbuilds.com',
      place: 'Job site walkthrough', city: 'Atlanta',
      premises: [premise('expertise', 'construction', ['construction', 'real-estate'])],
      log: [['call', 16], ['visit', 48, 'Walked the duplex renovation']],
    },
    {
      first: 'Tanya', last: 'Ellison', company: 'WriteHouse Media', title: 'Journalist',
      phone: '+15551230012', email: 'tanya@writehouse.media',
      place: 'Podcast interview', city: 'Remote',
      premises: [
        premise('topic', 'local media', ['media', 'storytelling']),
        premise('interest', 'jazz', ['jazz', 'music']),
      ],
      log: [],
    },
  ];
}

export async function seedIfNeeded(driver: SqlDriver, api: ContactsApi, ownerId: string): Promise<void> {
  if (await hasSeeded(driver)) return;
  // Mark first: if the app crashes mid-seed, we don't retry into duplicates.
  await markSeeded(driver);

  for (const s of buildSpecs()) {
    const contact = await api.createContact(ownerId, {
      firstName: s.first,
      lastName: s.last,
      company: s.company,
      title: s.title,
      phones: s.phone ? [{ label: 'mobile', number: s.phone }] : [],
      emails: s.email ? [{ label: 'work', address: s.email }] : [],
      avatarUrl: null,
      whereMet: s.place ? { placeName: s.place, city: s.city } : null,
      premises: s.premises,
      favorite: false,
      source: 'manual',
    });
    for (const [kind, age, note] of s.log) {
      await api.logInteraction(ownerId, { contactId: contact.id, kind, occurredAt: daysAgo(age), note });
    }
  }

  await api.createCircle(ownerId, {
    name: 'Civic & Community',
    query: { kinds: [], tags: ['civic', 'community', 'naacp'], text: '' },
  });
}
