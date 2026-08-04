'use client';

import React, { useState, useMemo } from 'react';
import { 
  MOCK_MEMBERS, 
  MOCK_BRANCHES, 
  MOCK_AREA_CONFERENCES,
  NAACP_Member, 
  membershipTypeLabels, 
  membershipStatusLabels,
  MembershipStatus,
  MembershipType
} from '../mockData';
import { Search, Filter, ShieldCheck, Mail, Phone, Calendar, User, Eye, X, RefreshCw, AlertCircle, Award } from 'lucide-react';

export default function RosterPage() {
  // State for dynamic member directory
  const [members, setMembers] = useState<NAACP_Member[]>(MOCK_MEMBERS);
  const [selectedMember, setSelectedMember] = useState<NAACP_Member | null>(MOCK_MEMBERS[0]); // Select first by default

  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [unitFilter, setUnitFilter] = useState<string>('ALL');

  // Filter & Search Logic
  const filteredMembers = useMemo(() => {
    return members.filter(member => {
      // Search match
      const fullName = `${member.firstName} ${member.lastName}`.toLowerCase();
      const matchSearch = 
        fullName.includes(searchTerm.toLowerCase()) || 
        member.memberId.includes(searchTerm) || 
        member.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        member.unitNumber.includes(searchTerm);

      // Status match
      const matchStatus = statusFilter === 'ALL' || member.status === statusFilter;

      // Type match
      const matchType = typeFilter === 'ALL' || member.membershipType === typeFilter;

      // Unit match
      const matchUnit = unitFilter === 'ALL' || member.unitNumber === unitFilter;

      return matchSearch && matchStatus && matchType && matchUnit;
    });
  }, [members, searchTerm, statusFilter, typeFilter, unitFilter]);

  // Handle member selection
  const handleSelectMember = (member: NAACP_Member) => {
    setSelectedMember(member);
  };

  // Action: Toggle Member Active/Expired Status (Demonstrating interactive admin ops!)
  const toggleMemberStatus = (memberId: string) => {
    const updated = members.map(m => {
      if (m.id === memberId) {
        let nextStatus: MembershipStatus;
        let nextExp: string | null = m.expirationDate;

        if (m.status === 'CURRENT' || m.status === 'LIFETIME_ACTIVE') {
          nextStatus = 'EXPIRED';
          nextExp = '2025-01-10'; // Simulated expired date
        } else {
          nextStatus = m.membershipType.includes('LIFE') ? 'LIFETIME_ACTIVE' : 'CURRENT';
          nextExp = m.membershipType.includes('LIFE') ? null : '2028-07-11';
        }

        const updatedMember = { ...m, status: nextStatus, expirationDate: nextExp };
        // Sync selected member view
        if (selectedMember && selectedMember.id === memberId) {
          setSelectedMember(updatedMember);
        }
        return updatedMember;
      }
      return m;
    });
    setMembers(updated);
  };

  // Action: Renew Member Membership (Demonstrating interactive admin ops!)
  const renewMember = (memberId: string) => {
    const updated = members.map(m => {
      if (m.id === memberId) {
        const updatedMember = {
          ...m,
          status: m.membershipType.includes('LIFE') ? ('LIFETIME_ACTIVE' as const) : ('CURRENT' as const),
          expirationDate: m.membershipType.includes('LIFE') ? null : '2028-07-11' // Extend to 2028
        };
        // Sync selected member view
        if (selectedMember && selectedMember.id === memberId) {
          setSelectedMember(updatedMember);
        }
        return updatedMember;
      }
      return m;
    });
    setMembers(updated);
  };

  // Find currently selected member's unit/branch details
  const selectedMemberBranch = useMemo(() => {
    if (!selectedMember) return null;
    return MOCK_BRANCHES.find(b => b.unitNumber === selectedMember.unitNumber) || null;
  }, [selectedMember]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h2 className="text-2xl font-black text-slate-900">Member Roster & Audit Directory</h2>
        <p className="text-slate-500 text-sm">Review, audit, and manage statuses for local NAACP branch members.</p>
      </div>

      {/* Roster Controls (Filters) */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name, ID, unit..."
            className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-naacp-blue text-slate-700"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Status Filter */}
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400 shrink-0" />
          <select
            className="w-full bg-slate-50 border border-slate-200 text-slate-700 rounded-lg py-2 px-3 text-xs font-semibold focus:outline-none focus:border-naacp-blue"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="ALL">All Statuses</option>
            <option value="CURRENT">Current / Active</option>
            <option value="LIFETIME_ACTIVE">Lifetime Active</option>
            <option value="PENDING_RENEWAL">Pending Renewal</option>
            <option value="EXPIRED">Expired</option>
          </select>
        </div>

        {/* Membership Type Filter */}
        <div className="flex items-center gap-2">
          <Award className="w-4 h-4 text-slate-400 shrink-0" />
          <select
            className="w-full bg-slate-50 border border-slate-200 text-slate-700 rounded-lg py-2 px-3 text-xs font-semibold focus:outline-none focus:border-naacp-blue"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="ALL">All Levels</option>
            <option value="YOUTH_UNDER_14">Youth (Under 14)</option>
            <option value="YOUTH_14_20">Youth (14 - 20)</option>
            <option value="REGULAR_ANNUAL">Regular Annual</option>
            <option value="SILVER_LIFE">Silver Life Member</option>
            <option value="GOLD_LIFE">Gold Life Member</option>
            <option value="DIAMOND_LIFE">Diamond Life Member</option>
          </select>
        </div>

        {/* Branch Unit Filter */}
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400 shrink-0" />
          <select
            className="w-full bg-slate-50 border border-slate-200 text-slate-700 rounded-lg py-2 px-3 text-xs font-semibold focus:outline-none focus:border-naacp-blue"
            value={unitFilter}
            onChange={(e) => setUnitFilter(e.target.value)}
          >
            <option value="ALL">All Branches</option>
            {MOCK_BRANCHES.map(b => (
              <option key={b.id} value={b.unitNumber}>
                {b.name} (Unit {b.unitNumber})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Split Layout: Directory Table vs Detail Sidebar Panel */}
      <div className="flex flex-col lg:flex-row gap-6 items-start">
        
        {/* Left Side: Members Directory Table */}
        <div className={`w-full transition-all duration-300 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden ${selectedMember ? 'lg:w-2/3' : 'lg:w-full'}`}>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-black uppercase text-slate-500 tracking-wider">
                  <th className="py-3.5 px-5">Member Credentials</th>
                  <th className="py-3.5 px-4">Member ID</th>
                  <th className="py-3.5 px-4">Unit</th>
                  <th className="py-3.5 px-4">Class</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700 text-sm">
                {filteredMembers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400 font-medium">
                      No matching records found in NAACP directory database.
                    </td>
                  </tr>
                ) : (
                  filteredMembers.map(member => {
                    const isSelected = selectedMember?.id === member.id;
                    const isActive = member.status === 'CURRENT' || member.status === 'LIFETIME_ACTIVE';
                    const isLife = member.membershipType.includes('LIFE');

                    return (
                      <tr 
                        key={member.id} 
                        onClick={() => handleSelectMember(member)}
                        className={`hover:bg-slate-50 cursor-pointer transition-colors ${isSelected ? 'bg-naacp-blue/5' : ''}`}
                      >
                        {/* Member Name */}
                        <td className="py-3.5 px-5 flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs ${isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {member.firstName[0]}{member.lastName[0]}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900">{`${member.firstName} ${member.lastName}`}</div>
                            <div className="text-[11px] text-slate-400 font-medium">{member.email}</div>
                          </div>
                        </td>

                        {/* ID */}
                        <td className="py-3.5 px-4 font-mono text-xs font-semibold text-slate-600">
                          {member.memberId}
                        </td>

                        {/* Unit */}
                        <td className="py-3.5 px-4 text-xs font-bold text-slate-600">
                          Unit {member.unitNumber}
                        </td>

                        {/* Level */}
                        <td className="py-3.5 px-4">
                          <span className={`text-[11px] font-bold px-2 py-1 rounded-md ${isLife ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'}`}>
                            {membershipTypeLabels[member.membershipType]}
                          </span>
                        </td>

                        {/* Status */}
                        <td className="py-3.5 px-4">
                          <span className={`text-xs font-bold inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full ${
                            member.status === 'LIFETIME_ACTIVE' ? 'bg-blue-100 text-blue-700' :
                            member.status === 'CURRENT' ? 'bg-green-100 text-green-700' :
                            member.status === 'PENDING_RENEWAL' ? 'bg-amber-100 text-amber-700' :
                            'bg-red-100 text-red-700'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${
                              member.status === 'LIFETIME_ACTIVE' ? 'bg-blue-600' :
                              member.status === 'CURRENT' ? 'bg-green-600' :
                              member.status === 'PENDING_RENEWAL' ? 'bg-amber-600' :
                              'bg-red-600'
                            }`} />
                            {membershipStatusLabels[member.status]}
                          </span>
                        </td>

                        {/* Action link */}
                        <td className="py-3.5 px-5 text-right" onClick={(e) => e.stopPropagation()}>
                          <button 
                            onClick={() => handleSelectMember(member)}
                            className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-500 hover:text-naacp-blue transition-colors"
                            title="View member audit details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Side: Member Details Slide-Over / Sidebar Panel */}
        {selectedMember && (
          <div className="w-full lg:w-1/3 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden sticky top-20 flex flex-col">
            {/* Header / Brand Badge */}
            <div className="bg-naacp-blue text-white p-5 border-b border-naacp-gold/30 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-naacp-gold" />
                <span className="font-extrabold tracking-wider text-sm text-naacp-gold uppercase">Credentials Audit</span>
              </div>
              <button 
                onClick={() => setSelectedMember(null)}
                className="p-1 hover:bg-white/10 rounded-lg text-slate-300 hover:text-white transition-colors"
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>

            {/* Profile Core */}
            <div className="p-6 space-y-6 flex-1 overflow-y-auto">
              {/* Profile Card Header */}
              <div className="text-center space-y-3 pb-6 border-b border-slate-100">
                <div className="w-16 h-16 rounded-full bg-naacp-blue/5 border border-slate-200 flex items-center justify-center mx-auto text-naacp-blue font-bold text-xl">
                  {selectedMember.firstName[0]}{selectedMember.lastName[0]}
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900">{`${selectedMember.firstName} ${selectedMember.lastName}`}</h3>
                  <p className="text-xs text-slate-400 font-semibold mt-0.5">National Member ID: {selectedMember.memberId}</p>
                </div>
                
                {/* Large Status Badge */}
                <div className="inline-flex">
                  <span className={`text-xs font-black inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full ${
                    selectedMember.status === 'LIFETIME_ACTIVE' ? 'bg-blue-100 text-blue-700' :
                    selectedMember.status === 'CURRENT' ? 'bg-green-100 text-green-700' :
                    selectedMember.status === 'PENDING_RENEWAL' ? 'bg-amber-100 text-amber-700' :
                    'bg-red-100 text-red-700'
                  }`}>
                    <span className={`w-2 h-2 rounded-full ${
                      selectedMember.status === 'LIFETIME_ACTIVE' ? 'bg-blue-600' :
                      selectedMember.status === 'CURRENT' ? 'bg-green-600' :
                      selectedMember.status === 'PENDING_RENEWAL' ? 'bg-amber-600' :
                      'bg-red-600'
                    }`} />
                    {membershipStatusLabels[selectedMember.status].toUpperCase()}
                  </span>
                </div>
              </div>

              {/* Roster Fields */}
              <div className="space-y-4 text-sm">
                <h4 className="text-xs font-black uppercase text-slate-400 tracking-wider">Administrative Metadata</h4>
                
                <div className="flex items-start gap-3">
                  <User className="w-4.5 h-4.5 text-slate-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">Membership Level</p>
                    <p className="font-bold text-slate-800">{membershipTypeLabels[selectedMember.membershipType]}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Calendar className="w-4.5 h-4.5 text-slate-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">Join Date</p>
                    <p className="font-semibold text-slate-800">{selectedMember.joinDate}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Calendar className="w-4.5 h-4.5 text-slate-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">Expiration Date</p>
                    <p className="font-semibold text-slate-800">
                      {selectedMember.expirationDate ? selectedMember.expirationDate : 'LIFETIME MEMBER / NO EXP'}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Mail className="w-4.5 h-4.5 text-slate-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">Primary Email</p>
                    <p className="font-medium text-slate-800">{selectedMember.email}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Phone className="w-4.5 h-4.5 text-slate-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">Phone Line</p>
                    <p className="font-medium text-slate-800">{selectedMember.phone}</p>
                  </div>
                </div>
              </div>

              {/* Unit Association Details */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-sm space-y-3">
                <h4 className="text-xs font-black uppercase text-slate-400 tracking-wider">Assigned Unit Standing</h4>
                <div>
                  <p className="text-[10px] text-slate-400 font-bold">BRANCH / UNIT</p>
                  <p className="font-bold text-slate-800">{selectedMemberBranch?.name || 'Loading...'}</p>
                  <p className="text-xs text-slate-500 mt-0.5">Official Unit ID: {selectedMember.unitNumber}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 font-bold">BRANCH PRESIDENT</p>
                  <p className="font-bold text-slate-700 text-xs">{selectedMemberBranch?.presidentName || 'Loading...'}</p>
                </div>
              </div>

              {/* Warning notice if expired */}
              {selectedMember.status === 'EXPIRED' && (
                <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl p-4 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <h5 className="font-bold text-xs">Membership Lapsed</h5>
                    <p className="text-[11px] mt-0.5 text-red-700 leading-normal">
                      The member has bypassed renewal grace periods. Access credentials on mobile are currently disabled.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Action Bar */}
            <div className="p-5 border-t border-slate-100 bg-slate-50 flex gap-3">
              <button
                onClick={() => toggleMemberStatus(selectedMember.id)}
                className="flex-1 border border-slate-300 hover:border-slate-400 text-slate-700 bg-white hover:bg-slate-50 font-bold text-xs py-2.5 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-all"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Toggle Standing</span>
              </button>
              
              <button
                onClick={() => renewMember(selectedMember.id)}
                className="flex-1 bg-naacp-blue hover:bg-naacp-blue-light border border-naacp-gold text-white font-bold text-xs py-2.5 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-all shadow-sm"
              >
                <span>Renew (Extend)</span>
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
