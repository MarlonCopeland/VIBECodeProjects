export type MembershipStatus = 'CURRENT' | 'EXPIRED' | 'PENDING_RENEWAL' | 'LIFETIME_ACTIVE';

export type MembershipType = 
  | 'YOUTH_UNDER_14' 
  | 'YOUTH_14_20' 
  | 'REGULAR_ANNUAL' 
  | 'SILVER_LIFE' 
  | 'GOLD_LIFE' 
  | 'DIAMOND_LIFE';

export interface AreaConference {
  id: string;
  name: string;
  regionCode: string;
  contactEmail: string;
  totalBranches: number;
}

export interface NAACPBranch {
  id: string;
  unitNumber: string;
  name: string;
  areaConferenceId: string;
  status: 'ACTIVE' | 'PROBATION' | 'INACTIVE';
  presidentName: string;
  contactEmail: string;
  phone: string;
  address: string;
}

export interface NAACP_Member {
  id: string;
  memberId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  membershipType: MembershipType;
  status: MembershipStatus;
  expirationDate: string | null;
  joinDate: string;
  unitNumber: string;
  areaConferenceId: string;
  photoUrl?: string;
}

export const membershipTypeLabels: Record<MembershipType, string> = {
  YOUTH_UNDER_14: 'Youth (Under 14)',
  YOUTH_14_20: 'Youth (14 - 20)',
  REGULAR_ANNUAL: 'Regular Annual',
  SILVER_LIFE: 'Silver Life Member',
  GOLD_LIFE: 'Gold Life Member',
  DIAMOND_LIFE: 'Diamond Life Member',
};

export const membershipStatusLabels: Record<MembershipStatus, string> = {
  CURRENT: 'Active / Current',
  EXPIRED: 'Expired',
  PENDING_RENEWAL: 'Pending Renewal',
  LIFETIME_ACTIVE: 'Lifetime Active',
};

export const MOCK_AREA_CONFERENCES: AreaConference[] = [
  {
    id: 'TX_AC',
    name: 'Texas State Conference',
    regionCode: 'Region VI',
    contactEmail: 'admin@texasnaacp.org',
    totalBranches: 12,
  },
  {
    id: 'MD_AC',
    name: 'Maryland State Conference',
    regionCode: 'Region II',
    contactEmail: 'info@marylandnaacp.org',
    totalBranches: 8,
  },
  {
    id: 'GA_AC',
    name: 'Georgia State Conference',
    regionCode: 'Region V',
    contactEmail: 'contact@georgianaacp.org',
    totalBranches: 15,
  }
];

export const MOCK_BRANCHES: NAACPBranch[] = [
  {
    id: 'BR_HOUSTON',
    unitNumber: '40AA',
    name: 'Houston NAACP Branch',
    areaConferenceId: 'TX_AC',
    status: 'ACTIVE',
    presidentName: 'Dr. James Mitchell',
    contactEmail: 'president@houstonnaacp.org',
    phone: '(713) 526-3389',
    address: '2002 Wheeler Ave, Houston, TX 77004'
  },
  {
    id: 'BR_BALTIMORE',
    unitNumber: '3112',
    name: 'Baltimore City NAACP Branch',
    areaConferenceId: 'MD_AC',
    status: 'ACTIVE',
    presidentName: 'Kobi Little',
    contactEmail: 'info@baltimorecitynaacp.org',
    phone: '(410) 366-3300',
    address: '1000 Cathedral St, Baltimore, MD 21201'
  },
  {
    id: 'BR_ATLANTA',
    unitNumber: '12AB',
    name: 'Atlanta NAACP Branch',
    areaConferenceId: 'GA_AC',
    status: 'ACTIVE',
    presidentName: 'Richard Rose',
    contactEmail: 'president@atlantanaacp.org',
    phone: '(404) 577-8977',
    address: '250 Georgia Ave SE, Atlanta, GA 30312'
  }
];

export const MOCK_MEMBERS: NAACP_Member[] = [
  {
    id: 'M_101',
    memberId: '10564893',
    firstName: 'Marcus',
    lastName: 'Garvey Smith',
    email: 'marcus.smith@example.org',
    phone: '(713) 555-0199',
    dateOfBirth: '1985-08-17',
    membershipType: 'SILVER_LIFE',
    status: 'LIFETIME_ACTIVE',
    expirationDate: null,
    joinDate: '2015-05-12',
    unitNumber: '40AA',
    areaConferenceId: 'TX_AC',
  },
  {
    id: 'M_102',
    memberId: '20874512',
    firstName: 'Aaliyah',
    lastName: 'Jackson',
    email: 'aaliyah.j@example.org',
    phone: '(713) 555-0245',
    dateOfBirth: '2008-11-03',
    membershipType: 'YOUTH_14_20',
    status: 'EXPIRED',
    expirationDate: '2025-01-10',
    joinDate: '2023-01-10',
    unitNumber: '40AA',
    areaConferenceId: 'TX_AC',
  },
  {
    id: 'M_103',
    memberId: '30541278',
    firstName: 'Coretta',
    lastName: 'Scott King',
    email: 'coretta.sk@example.org',
    phone: '(410) 555-0133',
    dateOfBirth: '1974-04-27',
    membershipType: 'GOLD_LIFE',
    status: 'LIFETIME_ACTIVE',
    expirationDate: null,
    joinDate: '2010-09-20',
    unitNumber: '3112',
    areaConferenceId: 'MD_AC',
  },
  {
    id: 'M_104',
    memberId: '40921834',
    firstName: 'Benjamin',
    lastName: 'Jealous',
    email: 'ben.jealous@example.org',
    phone: '(410) 555-0182',
    dateOfBirth: '1992-06-14',
    membershipType: 'REGULAR_ANNUAL',
    status: 'CURRENT',
    expirationDate: '2027-06-14',
    joinDate: '2025-06-14',
    unitNumber: '3112',
    areaConferenceId: 'MD_AC',
  },
  {
    id: 'M_105',
    memberId: '50321456',
    firstName: 'W.E.B.',
    lastName: 'Du Bois Jr.',
    email: 'web.dubois@example.org',
    phone: '(404) 555-0211',
    dateOfBirth: '1990-02-23',
    membershipType: 'REGULAR_ANNUAL',
    status: 'PENDING_RENEWAL',
    expirationDate: '2026-03-15',
    joinDate: '2021-03-15',
    unitNumber: '12AB',
    areaConferenceId: 'GA_AC',
  },
  {
    id: 'M_106',
    memberId: '60451289',
    firstName: 'Ida',
    lastName: 'B. Wells',
    email: 'ida.wells@example.org',
    phone: '(404) 555-0255',
    dateOfBirth: '1982-07-16',
    membershipType: 'DIAMOND_LIFE',
    status: 'LIFETIME_ACTIVE',
    expirationDate: null,
    joinDate: '2005-08-01',
    unitNumber: '12AB',
    areaConferenceId: 'GA_AC',
  }
];
