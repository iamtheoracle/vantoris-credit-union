import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, FileText, Users, Building2, ShieldCheck,
  DollarSign, ArrowDownToLine, ArrowUpRight, ArrowLeftRight,
  Wallet, CreditCard, UserCheck, FolderOpen,
  BarChart3, TrendingUp, ScrollText, Activity,
  Bot, Settings, Code, Plug, Bell, Lock, Flag, Cog, HeartPulse,
  ChevronRight, Wrench, Users2, MessageSquare, Crown, Briefcase,
  AlertTriangle, Scale, GitBranch, Database, ServerCog,
  Search, Eye, ShieldAlert, Network, Globe, Zap,
  PanelLeftClose, FileUp, CalendarDays, Gavel, FileSpreadsheet, Trophy, Radar,
  Shield, Package,
  Truck, Heart, Headphones, PieChart, Coins, Signal,
} from 'lucide-react';
import ShieldLogo from './ShieldLogo';
import {
  getDomainsForRole, hasDomainAccess, getDefaultWorkspace,
  WORKSPACE_LABELS, getRoleLabel, isSuperAdmin,
} from '@/lib/operationsAccess';

const DOMAIN_CONFIG = {
  management: {
    icon: Briefcase,
    accent: 'text-navy',
    bg: 'bg-navy/10',
    sections: [
      {
        label: 'Dashboard',
        items: [
          { label: 'Operations Overview', path: '/operations', icon: LayoutDashboard },
        ],
      },
      {
        label: 'Operations',
        items: [
          { label: 'Approvals', path: '/operations/approvals', icon: Gavel },
          { label: 'Pending Applications', path: '/operations/applications', icon: FileText },
          { label: 'Accounts', path: '/operations/accounts', icon: Wallet },
          { label: 'Pending Deposits', path: '/operations/deposits', icon: ArrowDownToLine },
          { label: 'Pending Withdrawals', path: '/operations/withdrawals', icon: ArrowUpRight },
          { label: 'Transfers', path: '/operations/transfers', icon: ArrowLeftRight },
          { label: 'Cards', path: '/operations/cards', icon: CreditCard },
          { label: 'Bulk Import', path: '/operations/bulk-import', icon: FileUp },
          { label: 'Documents', path: '/operations/documents', icon: FolderOpen },
        ],
      },
      {
        label: 'KYC / Compliance',
        items: [
          { label: 'KYC Queue', path: '/operations/kyc', icon: ShieldCheck },
          { label: 'Verification Requests', path: '/operations/verification-requests', icon: Eye },
          { label: 'Members', path: '/operations/members', icon: Users },
          { label: 'Organizations', path: '/operations/organizations', icon: Building2 },
        ],
      },
      {
        label: 'Customer & Account Management',
        items: [
          { label: 'Service Requests', path: '/operations/service-requests', icon: Wrench },
          { label: 'Member Messages', path: '/operations/member-messages', icon: MessageSquare },
          { label: 'Operational Profiles', path: '/operations/operational-profiles', icon: UserCheck },
          { label: 'Referrals', path: '/operations/referrals', icon: Users2 },
        ],
      },
      {
        label: 'Reports & Data',
        items: [
          { label: 'Reports', path: '/operations/reports', icon: BarChart3 },
          { label: 'Executive Reports', path: '/operations/executive-reports', icon: TrendingUp },
          { label: 'AUM Growth', path: '/operations/aum-growth', icon: TrendingUp },
          { label: 'Transaction Summaries', path: '/operations/transaction-summaries', icon: CalendarDays },
          { label: 'Activity Timeline', path: '/operations/activity', icon: Activity },
          { label: 'Data Integrity Audit', path: '/operations/data-integrity', icon: Database },
          { label: 'Transaction Export', path: '/operations/transaction-export', icon: FileSpreadsheet },
        ],
      },
      {
        label: 'Discovery & Intelligence',
        items: [
          { label: 'Discovery Network', path: '/operations/discovery-network', icon: Search },
          { label: 'Humanitarian Cases', path: '/operations/humanitarian-cases', icon: Heart },
        ],
      },
      {
        label: 'Security',
        items: [
          { label: 'Security Dashboard', path: '/operations/security-dashboard', icon: ShieldAlert },
          { label: 'Withdrawal Limits', path: '/operations/withdrawal-limits', icon: Scale },
          { label: 'Security Center', path: '/operations/security', icon: Lock },
          { label: 'System Health', path: '/operations/system-health', icon: HeartPulse },
        ],
      },
      {
        label: 'System Administration',
        items: [
          { label: 'Configuration', path: '/operations/configuration', icon: Settings },
          { label: 'Feature Flags', path: '/operations/feature-flags', icon: Flag },
          { label: 'API Management', path: '/operations/api-management', icon: Code },
          { label: 'Integrations', path: '/operations/integrations', icon: Plug },
          { label: 'Notifications', path: '/operations/notifications', icon: Bell },
          { label: 'Background Jobs', path: '/operations/background-jobs', icon: ServerCog },
        ],
      },
      {
        label: 'Administration',
        items: [
          { label: 'Audit Logs', path: '/operations/audit-logs', icon: ScrollText },
          { label: 'Withdrawal Audit Log', path: '/operations/withdrawal-audit-log', icon: GitBranch },
        ],
      },
    ],
  },
  support: {
    icon: Headphones,
    accent: 'text-champagne',
    bg: 'bg-champagne/10',
    sections: [
      {
        label: 'Customer Support',
        items: [
          { label: 'Support Overview', path: '/operations', icon: LayoutDashboard },
          { label: 'Service Requests', path: '/operations/service-requests', icon: Wrench },
          { label: 'Member Messages', path: '/operations/member-messages', icon: MessageSquare },
          { label: 'Verification Requests', path: '/operations/verification-requests', icon: Eye },
          { label: 'Members', path: '/operations/members', icon: Users },
        ],
      },
      {
        label: 'Escalations',
        items: [
          { label: 'Pending Applications', path: '/operations/applications', icon: FileText },
          { label: 'Pending Withdrawals', path: '/operations/withdrawals', icon: ArrowUpRight },
          { label: 'KYC Queue', path: '/operations/kyc', icon: ShieldCheck },
        ],
      },
    ],
  },
  herobox: {
    icon: Radar,
    accent: 'text-brass',
    bg: 'bg-brass/10',
    sections: [
      {
        label: 'Command',
        items: [
          { label: 'Mission Control', path: '/operations/herobox', icon: Radar },
        ],
      },
      {
        label: 'Catalog',
        items: [
          { label: 'Care Packages', path: '/operations/herobox/care-packages', icon: Package },
          { label: 'Products', path: '/operations/herobox/products', icon: Package },
        ],
      },
      {
        label: 'Orders & Shipping',
        items: [
          { label: 'Orders', path: '/operations/herobox/orders', icon: Package },
          { label: 'Funds & Shipping', path: '/operations/herobox/funds-shipping', icon: Truck },
          { label: 'Heroes', path: '/operations/herobox/heroes', icon: Shield },
          { label: 'Volunteers', path: '/operations/herobox/volunteers', icon: Users },
        ],
      },
      {
        label: 'Intelligence',
        items: [
          { label: 'Discovery Network', path: '/operations/discovery-network', icon: Search },
          { label: 'Humanitarian Cases', path: '/operations/humanitarian-cases', icon: Heart },
          { label: 'Impact Analytics', path: '/operations/impact-analytics', icon: BarChart3 },
          { label: 'Supporter Leaderboard', path: '/operations/leaderboard', icon: Trophy },
        ],
      },
      {
        label: 'Operations',
        items: [
          { label: 'Support Requests', path: '/operations/service-requests', icon: Wrench },
          { label: 'Member Messages', path: '/operations/member-messages', icon: MessageSquare },
          { label: 'Finance', path: '/operations/finance', icon: DollarSign },
        ],
      },
    ],
  },
  investment: {
    icon: TrendingUp,
    accent: 'text-mint',
    bg: 'bg-mint/10',
    sections: [
      {
        label: 'Investment Operations',
        items: [
          { label: 'Investment Dashboard', path: '/operations/investment', icon: PieChart },
        ],
      },
      {
        label: 'Deposits & Withdrawals',
        items: [
          { label: 'Deposit Requests', path: '/operations/investment/deposits', icon: ArrowDownToLine },
          { label: 'Withdrawal Requests', path: '/operations/investment/withdrawals', icon: ArrowUpRight },
        ],
      },
      {
        label: 'Portfolio & Products',
        items: [
          { label: 'Portfolios', path: '/operations/investment/portfolios', icon: PieChart },
          { label: 'Signals', path: '/operations/investment/signals', icon: Signal },
        ],
      },
      {
        label: 'Reports',
        items: [
          { label: 'Investment Reports', path: '/operations/investment/reports', icon: BarChart3 },
          { label: 'Audit Logs', path: '/operations/audit-logs', icon: ScrollText },
        ],
      },
    ],
  },
};

export default function AdminSidebar({ user, activeWorkspace, onWorkspaceChange, onNavigate, onHide }) {
  const location = useLocation();
  const navigate = useNavigate();

  const availableDomains = user ? getDomainsForRole(user.role) : [];
  const currentDomain = activeWorkspace || getDefaultWorkspace(user?.role) || 'management';
  const config = DOMAIN_CONFIG[currentDomain] || DOMAIN_CONFIG.management;

  function handleDomainSelect(domain) {
    onWorkspaceChange?.(domain);
    const domainConfig = DOMAIN_CONFIG[domain];
    if (domainConfig?.sections[0]?.items[0]) {
      navigate(domainConfig.sections[0].items[0].path);
    }
  }

  return (
    <aside className="vantoris-glass-sidebar flex flex-col h-full w-64" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      {/* Brand header */}
      <div className="px-5 py-4 flex items-center gap-3 flex-shrink-0 border-b border-slate-200" style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 1rem)' }}>
        <ShieldLogo size={32} />
        <div className="min-w-0 flex-1">
          <h1 className="text-foreground font-bold text-base tracking-[0.2em] leading-tight">VANTORIS</h1>
          <p className="text-gray/60 text-[9px] tracking-[0.18em] uppercase font-medium">Command Center</p>
        </div>
        {onHide && (
          <button
            onClick={onHide}
            className="p-1.5 rounded-lg text-gray hover:bg-slate-100 hover:text-foreground transition-all flex-shrink-0"
            title="Hide sidebar"
          >
            <PanelLeftClose size={18} />
          </button>
        )}
      </div>

      {/* Domain selector tabs */}
      {availableDomains.length > 1 && (
        <div className="p-2 flex-shrink-0 border-b border-slate-200">
          <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${availableDomains.length}, 1fr)` }}>
            {availableDomains.map(domain => {
              const dConfig = DOMAIN_CONFIG[domain];
              const DIcon = dConfig.icon;
              const isActive = currentDomain === domain;
              return (
                <button
                  key={domain}
                  onClick={() => handleDomainSelect(domain)}
                  className={`flex flex-col items-center gap-1 py-2.5 rounded-lg transition-all text-[10px] font-semibold ${
                    isActive
                      ? `${dConfig.bg} ${dConfig.accent} shadow-sm`
                      : 'text-gray hover:bg-slate-100 hover:text-foreground'
                  }`}
                  title={WORKSPACE_LABELS[domain]}
                >
                  <DIcon size={16} />
                  <span className="truncate max-w-full px-0.5">{WORKSPACE_LABELS[domain]}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Navigation sections */}
      <nav className="flex-1 px-2.5 overflow-y-auto overflow-x-hidden py-3 vantoris-scroll">
        {config.sections.map((section, sIdx) => (
          <div key={sIdx} className="mb-4">
            {section.label && (
              <p className="text-gray/50 text-[10px] font-semibold uppercase tracking-[0.12em] px-3 mb-1.5">
                {section.label}
              </p>
            )}
            {section.items.map(item => {
              const isActive = item.path === '/operations'
                ? location.pathname === '/operations'
                : location.pathname.startsWith(item.path);
              const Icon = item.icon;
              return (
                <Link
                  key={item.path + item.label}
                  to={item.path}
                  onClick={onNavigate}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg mb-0.5 transition-all duration-200 text-sm font-medium ${
                    isActive
                      ? 'bg-brass/10 text-brass shadow-sm border-l-2 border-brass'
                      : 'text-gray hover:bg-slate-50 hover:text-foreground'
                  }`}
                >
                  <Icon size={15} className="flex-shrink-0" />
                  <span className="truncate">{item.label}</span>
                  {isActive && <ChevronRight size={13} className="ml-auto flex-shrink-0" />}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* User footer */}
      <div className="p-2.5 border-t border-slate-200 flex-shrink-0">
        <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl bg-slate-50 border border-slate-200">
          <div className="w-8 h-8 rounded-full bg-navy/10 border border-navy/15 flex items-center justify-center flex-shrink-0">
            <span className="text-navy text-xs font-bold">
              {(user?.full_name || 'A').charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-foreground text-xs font-medium truncate">{user?.full_name || 'Administrator'}</p>
            <p className="text-gray/60 text-[10px]">{getRoleLabel(user?.role)}</p>
          </div>
          {isSuperAdmin(user) && (
            <Crown size={14} className="text-brass flex-shrink-0" />
          )}
        </div>
      </div>
    </aside>
  );
}