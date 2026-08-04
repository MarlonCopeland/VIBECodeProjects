'use client';

import React from 'react';
import { MOCK_MEMBERS, MOCK_BRANCHES, MOCK_AREA_CONFERENCES } from './mockData';
import { Users, FileCheck, Landmark, ShieldAlert, Award, ChevronRight } from 'lucide-react';

export default function DashboardPage() {
  // Compute dashboard metrics
  const totalMembers = MOCK_MEMBERS.length;
  const activeMembers = MOCK_MEMBERS.filter(m => m.status === 'CURRENT' || m.status === 'LIFETIME_ACTIVE').length;
  const expiredMembers = MOCK_MEMBERS.filter(m => m.status === 'EXPIRED').length;
  const pendingMembers = MOCK_MEMBERS.filter(m => m.status === 'PENDING_RENEWAL').length;

  const lifeMembers = MOCK_MEMBERS.filter(m => 
    m.membershipType === 'SILVER_LIFE' || 
    m.membershipType === 'GOLD_LIFE' || 
    m.membershipType === 'DIAMOND_LIFE'
  ).length;

  // Percentage active
  const activeRate = Math.round((activeMembers / totalMembers) * 100);

  return (
    <div className="space-y-8">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-naacp-blue to-naacp-blue-light rounded-2xl p-8 border border-naacp-gold/40 shadow-lg text-white">
        <h2 className="text-3xl font-extrabold tracking-tight">NAACP Regional Administrative Command</h2>
        <p className="text-slate-200 mt-2 max-w-2xl text-sm leading-relaxed">
          Welcome to the unified NAACP Branch Administration Dashboard. Monitor multi-tenant local chapters, verify unit rosters, and maintain strict constitutional and bylaws compliance across all state divisions.
        </p>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        
        {/* KPI 1: Total Directory */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center gap-5">
          <div className="w-12 h-12 rounded-lg bg-naacp-blue/5 text-naacp-blue flex items-center justify-center">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Directory</p>
            <h3 className="text-2xl font-black text-slate-900 mt-1">{totalMembers} Members</h3>
            <p className="text-[11px] text-slate-400 mt-1">Across 3 active state conferences</p>
          </div>
        </div>

        {/* KPI 2: Active / Verified */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center gap-5">
          <div className="w-12 h-12 rounded-lg bg-green-50 text-green-600 flex items-center justify-center">
            <FileCheck className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Active & Current</p>
            <h3 className="text-2xl font-black text-slate-900 mt-1">{activeMembers} Members</h3>
            <p className="text-[11px] text-green-600 font-bold mt-1">{activeRate}% compliance rating</p>
          </div>
        </div>

        {/* KPI 3: Lifetime Subscriptions */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center gap-5">
          <div className="w-12 h-12 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
            <Award className="w-6 h-6 text-naacp-gold-dark" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Lifetime Active</p>
            <h3 className="text-2xl font-black text-slate-900 mt-1">{lifeMembers} Subscribers</h3>
            <p className="text-[11px] text-slate-400 mt-1">Silver, Gold & Diamond tiers</p>
          </div>
        </div>

        {/* KPI 4: Pending / Expired */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center gap-5">
          <div className="w-12 h-12 rounded-lg bg-red-50 text-red-600 flex items-center justify-center">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Lapsed / Pending</p>
            <h3 className="text-2xl font-black text-slate-900 mt-1">{expiredMembers + pendingMembers} Members</h3>
            <p className="text-[11px] text-red-500 mt-1">{expiredMembers} Expired | {pendingMembers} Pending</p>
          </div>
        </div>

      </div>

      {/* Main Grid: Statistics Breakdown & Compliance */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Branch Membership Distribution */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Branch Distribution</h3>
              <p className="text-xs text-slate-400">Total active counts by localized NAACP units</p>
            </div>
            <span className="text-xs font-bold text-naacp-blue bg-naacp-blue/5 px-2.5 py-1 rounded-full border border-naacp-blue/10">3 Units</span>
          </div>

          <div className="space-y-4">
            {MOCK_BRANCHES.map(branch => {
              // Calculate members in this branch
              const branchMembers = MOCK_MEMBERS.filter(m => m.unitNumber === branch.unitNumber);
              const branchActive = branchMembers.filter(m => m.status === 'CURRENT' || m.status === 'LIFETIME_ACTIVE').length;
              const ratioPercent = Math.round((branchMembers.length / totalMembers) * 100);

              return (
                <div key={branch.id} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <div className="font-bold text-slate-800">
                      {branch.name} <span className="text-xs text-slate-400 font-medium">(Unit {branch.unitNumber})</span>
                    </div>
                    <div className="text-slate-500 font-semibold">
                      {branchActive} Active / {branchMembers.length} Total ({ratioPercent}%)
                    </div>
                  </div>
                  {/* Progress bar */}
                  <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                    <div 
                      className="bg-naacp-blue h-full rounded-full transition-all duration-500" 
                      style={{ width: `${ratioPercent}%` }} 
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Compliance Checklist Panel */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Landmark className="w-5 h-5 text-naacp-gold-dark" />
              <span>Branch Compliance</span>
            </h3>
            <p className="text-xs text-slate-400">Critical deadlines & unit status indicators</p>
          </div>

          <ul className="space-y-4">
            <li className="flex items-start gap-3">
              <div className="w-5 h-5 rounded-full bg-green-100 text-green-600 flex items-center justify-center shrink-0 mt-0.5 font-bold text-xs">✓</div>
              <div>
                <h4 className="text-sm font-bold text-slate-800">Officer Elections</h4>
                <p className="text-xs text-slate-400 mt-0.5">All local units successfully completed bi-annual officer voting cycles.</p>
              </div>
            </li>
            
            <li className="flex items-start gap-3">
              <div className="w-5 h-5 rounded-full bg-green-100 text-green-600 flex items-center justify-center shrink-0 mt-0.5 font-bold text-xs">✓</div>
              <div>
                <h4 className="text-sm font-bold text-slate-800">IRS Form 990 Filing</h4>
                <p className="text-xs text-slate-400 mt-0.5">State and Area division tax-exempt filings verified for FY2025.</p>
              </div>
            </li>

            <li className="flex items-start gap-3">
              <div className="w-5 h-5 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 mt-0.5 font-bold text-xs">!</div>
              <div>
                <h4 className="text-sm font-bold text-slate-800">National Assessment Fee</h4>
                <p className="text-xs text-slate-400 mt-0.5">Unit 12AB (Atlanta) has a pending administrative assessment balance of $150.</p>
              </div>
            </li>
          </ul>

          <button 
            onClick={() => alert("Redirecting to national regulatory compliance handbook...")}
            className="w-full flex items-center justify-center gap-1 text-xs font-bold text-naacp-blue hover:text-naacp-blue-light transition-colors pt-2"
          >
            <span>View Full Compliance Portal</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

      </div>

      {/* State/Area Conference List */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
        <div className="border-b border-slate-100 pb-4">
          <h3 className="text-lg font-bold text-slate-900">Governing Area Conferences</h3>
          <p className="text-xs text-slate-400">Coordinating councils managing localized branches</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {MOCK_AREA_CONFERENCES.map(conference => (
            <div key={conference.id} className="p-5 rounded-xl border border-slate-200 bg-slate-50 flex flex-col justify-between hover:border-naacp-blue/30 transition-all">
              <div>
                <div className="text-xs font-black text-naacp-blue uppercase tracking-wider">{conference.regionCode}</div>
                <h4 className="font-extrabold text-slate-800 text-base mt-1">{conference.name}</h4>
                <p className="text-xs text-slate-400 mt-2">Assigned Liaison: {conference.contactEmail}</p>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 font-semibold">
                <span>Active Units</span>
                <span className="font-bold text-slate-800">{conference.totalBranches} Branches</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
