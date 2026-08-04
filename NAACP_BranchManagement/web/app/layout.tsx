import React from 'react';
import type { Metadata } from 'next';
import './globals.css';
import { ShieldCheck, Users, Building, FileText, Settings, Sparkles } from 'lucide-react';

export const metadata: Metadata = {
  title: 'NAACP Admin Portal - Operations Center',
  description: 'Hierarchical Management Platform for State Conferences and local Units',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-slate-50 text-slate-900 font-sans antialiased flex min-h-screen">
        {/* Left Sidebar Menu */}
        <aside className="w-64 bg-naacp-blue text-white flex flex-col border-r border-naacp-gold/30 shrink-0 sticky top-0 h-screen">
          {/* Header Branding */}
          <div className="p-6 border-b border-white/10 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-naacp-gold flex items-center justify-center text-naacp-blue font-bold shadow-md shrink-0">
              NA
            </div>
            <div>
              <h1 className="font-extrabold text-lg text-naacp-gold tracking-wide leading-tight">NAACP ADMIN</h1>
              <p className="text-[10px] text-slate-300 font-medium tracking-widest uppercase">Operations Portal</p>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto">
            <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold px-3 mb-2">Main Menu</div>
            
            <a 
              href="/" 
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-100 hover:bg-white/10 hover:text-naacp-gold transition-all group font-medium text-sm"
            >
              <ShieldCheck className="w-4.5 h-4.5 text-slate-400 group-hover:text-naacp-gold transition-colors" />
              <span>HQ Dashboard</span>
            </a>

            <a 
              href="/roster" 
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-100 hover:bg-white/10 hover:text-naacp-gold transition-all group font-medium text-sm"
            >
              <Users className="w-4.5 h-4.5 text-slate-400 group-hover:text-naacp-gold transition-colors" />
              <span>Member Roster</span>
            </a>

            <a 
              href="#" 
              onClick={(e) => { e.preventDefault(); alert("Branches configuration interface is available for Area/State admins."); }}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-100 hover:bg-white/10 hover:text-naacp-gold transition-all group font-medium text-sm"
            >
              <Building className="w-4.5 h-4.5 text-slate-400 group-hover:text-naacp-gold transition-colors" />
              <span>Branch Registry</span>
            </a>

            <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold px-3 pt-6 mb-2">Compliance</div>

            <a 
              href="#" 
              onClick={(e) => { e.preventDefault(); alert("Bylaws modification logs are available for Legal Redress Committees."); }}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-100 hover:bg-white/10 hover:text-naacp-gold transition-all group font-medium text-sm"
            >
              <FileText className="w-4.5 h-4.5 text-slate-400 group-hover:text-naacp-gold transition-colors" />
              <span>Charter Bylaws</span>
            </a>

            <a 
              href="#" 
              onClick={(e) => { e.preventDefault(); alert("Setting up database integrations & SSO configurations."); }}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-100 hover:bg-white/10 hover:text-naacp-gold transition-all group font-medium text-sm"
            >
              <Settings className="w-4.5 h-4.5 text-slate-400 group-hover:text-naacp-gold transition-colors" />
              <span>Portal Settings</span>
            </a>
          </nav>

          {/* User Profile Footer */}
          <div className="p-4 border-t border-white/10 bg-black/10 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-naacp-blue-light border border-naacp-gold/50 flex items-center justify-center font-bold text-sm text-naacp-gold">
              SM
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-xs font-bold truncate text-white">Sherrilyn Ifill</h2>
              <p className="text-[10px] text-slate-400 truncate">Regional Administrator</p>
            </div>
          </div>
        </aside>

        {/* Right Main Content Panel */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Top Banner */}
          <header className="h-16 bg-white border-b border-slate-200 px-8 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-full">
              <Sparkles className="w-3.5 h-3.5 text-naacp-gold-dark" />
              <span>Current Tenant:</span>
              <span className="text-naacp-blue font-bold">Texas State Conference & Unit 40AA</span>
            </div>
            
            <div className="flex items-center gap-4">
              <span className="text-xs text-slate-500 font-medium">Last synced: Just now</span>
              <div className="h-4 w-px bg-slate-200" />
              <button 
                onClick={() => alert("Simulating a fresh roster backup and security scan.")}
                className="bg-naacp-blue hover:bg-naacp-blue-light text-white text-xs font-bold px-4 py-2 rounded-lg border border-naacp-gold transition-colors"
              >
                Sync Directory
              </button>
            </div>
          </header>

          {/* Main Dashboard Pages */}
          <main className="flex-1 p-8 overflow-y-auto">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
