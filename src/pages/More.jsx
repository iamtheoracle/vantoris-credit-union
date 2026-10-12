import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useWhatsAppConfig, whatsappLinkFromConfig } from '@/hooks/useWhatsAppConfig';
import { User, Bell, Settings, CreditCard, FileText, MessageCircle, Sparkles, Phone, Info, LogOut, ChevronRight, Shield, Compass, QrCode, TrendingUp, Package } from 'lucide-react';
import ShieldLogo from '@/components/vantoris/ShieldLogo';
import { getRoleLabel, isSuperAdmin } from '@/lib/operationsAccess';

const SECTIONS = [
  {
    title: 'Platform',
    items: [
      { id: 'travel', label: 'Travel', desc: 'Flights, hotels, cars — provider required', icon: Compass, route: '/travel', color: 'bg-navy/8 text-navy' },
      { id: 'homes', label: 'Homes', desc: 'Licensed listings only', icon: Info, route: '/homes', color: 'bg-navy/8 text-navy' },
      { id: 'news', label: 'News', desc: 'Attributed sources only', icon: FileText, route: '/news', color: 'bg-navy/8 text-navy' },
      { id: 'ask', label: 'Ask Vantoris', desc: 'Rules-based, no language model', icon: Sparkles, route: '/ask', color: 'bg-brass/10 text-brass' },
      { id: 'support', label: 'Support', desc: 'Help and contact', icon: Phone, route: '/support', color: 'bg-emerald-500/10 text-emerald-700' },
    ],
  },
  {
    title: 'Account',
    items: [
      { id: 'profile', label: 'Profile', desc: 'Your personal information', icon: User, route: '/profile', color: 'bg-brass/10 text-brass' },
      { id: 'security', label: 'Security Center', desc: 'PIN, sessions & security', icon: Shield, route: '/profile', color: 'bg-crimson/10 text-crimson' },
      { id: 'settings', label: 'Settings', desc: 'App preferences', icon: Settings, route: '/profile', color: 'bg-gray-100 text-gray' },
    ],
  },
  {
    title: 'Discover',
    items: [
      { id: 'discover', label: 'Discover hub', desc: 'Invest, HeroBox, news, NGO, FX', icon: Compass, route: '/discover', color: 'bg-navy/8 text-navy' },
      { id: 'investment', label: 'Investment', desc: 'Portfolios & capital', icon: TrendingUp, route: '/investment', color: 'bg-brass/10 text-brass' },
      { id: 'herobox', label: 'HeroBox', desc: 'Care packages & missions', icon: Package, route: '/herobox', color: 'bg-emerald-500/10 text-emerald-700' },
      { id: 'tx', label: 'Transactions', desc: 'Records returned for this account', icon: FileText, route: '/transactions', color: 'bg-navy/8 text-navy' },
      { id: 'qr', label: 'Member QR', desc: 'Pay & locate members', icon: QrCode, route: '/qr', color: 'bg-blue-500/10 text-blue-600' },
    ],
  },
  {
    title: 'Banking',
    items: [
      { id: 'cards', label: 'Cards', desc: 'Manage your debit cards', icon: CreditCard, route: '/services', color: 'bg-brass/10 text-brass' },
      { id: 'accounts', label: 'Accounts', desc: 'Accounts, payments and transfers', icon: CreditCard, route: '/accounts', color: 'bg-blue-500/10 text-blue-600' },
      { id: 'statements', label: 'Statements & Documents', desc: 'Account documents', icon: FileText, route: '/documents', color: 'bg-blue-500/10 text-blue-600' },
    ],
  },
  {
    title: 'Support',
    items: [
      { id: 'messages', label: 'Messages', desc: 'Your support conversations', icon: MessageCircle, route: '/messages', color: 'bg-navy/8 text-navy' },
      { id: 'advisor', label: 'Member Advisor', desc: 'AI banking assistant', icon: Sparkles, route: '/advisor', color: 'bg-brass/10 text-brass' },
      { id: 'contact', label: 'Contact Support', desc: 'WhatsApp & email support', icon: Phone, external: true, color: 'bg-emerald-500/10 text-emerald-600' },
    ],
  },
  {
    title: 'About',
    items: [
      { id: 'about', label: 'About Vantoris', desc: 'Learn about us', icon: Info, color: 'bg-blue-500/10 text-blue-600' },
    ],
  },
];

export default function More() {
  const navigate = useNavigate();
  const whatsappNumber = useWhatsAppConfig();
  const [user, setUser] = useState(null);
  const [showAbout, setShowAbout] = useState(false);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(console.error);
  }, []);

  function handleItemClick(item) {
    if (item.external) {
      window.open(
        whatsappLinkFromConfig(whatsappNumber, 'Hello Vantoris Support, I have a question regarding my account.'),
        '_blank', 'noopener,noreferrer'
      );
      return;
    }
    if (item.id === 'about') {
      setShowAbout(true);
      return;
    }
    if (item.route) navigate(item.route);
  }

  return (
    <div className="px-5 pt-6 pb-4">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="vantoris-glass-premium p-5 mb-5">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brass/20 to-brass/5 border border-brass/15 flex items-center justify-center">
            <span className="text-brass text-lg font-bold">{(user?.full_name || 'M').charAt(0).toUpperCase()}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-foreground font-semibold text-base truncate">{(user?.first_name || (user?.full_name && !String(user.full_name).includes('@') ? String(user.full_name).split(/\s+/)[0] : null) || 'Member')}</p>
            <p className="text-gray text-xs truncate">{user?.email}</p>
            <span className="text-brass text-[10px] font-medium">{isSuperAdmin(user) ? 'Super Administrator' : getRoleLabel(user?.role)}</span>
          </div>
          <ChevronRight size={18} className="text-gray/40" />
        </div>
      </motion.div>

      {(isSuperAdmin(user) || /admin|operator|executive|operations/i.test(user?.role || '')) && (
        <button onClick={() => navigate('/operations/approvals')} className="mb-4 w-full rounded-2xl bg-navy px-4 py-3 text-left text-sm font-semibold text-white">Operator approvals</button>
      )}
      {SECTIONS.map((section, sIdx) => (
        <motion.div key={section.title} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: sIdx * 0.05 }} className="mb-5">
          <h2 className="text-foreground font-semibold text-sm mb-3 px-1">{section.title}</h2>
          <div className="vantoris-glass-premium overflow-hidden">
            {section.items.map((item, idx) => {
              const Icon = item.icon;
              return (
                <button key={item.id} onClick={() => handleItemClick(item)} className={`w-full flex items-center gap-3 p-3.5 hover:bg-slate-50 transition-colors text-left ${idx > 0 ? 'border-t border-border/50' : ''}`}>
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${item.color}`}><Icon size={16} strokeWidth={2} /></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-foreground font-medium text-sm">{item.label}</p>
                    <p className="text-gray text-xs truncate">{item.desc}</p>
                  </div>
                  <ChevronRight size={16} className="text-gray/40 flex-shrink-0" />
                </button>
              );
            })}
          </div>
        </motion.div>
      ))}

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="vantoris-glass-premium overflow-hidden mb-5">
        <button onClick={() => base44.auth.logout('/')} className="w-full flex items-center gap-3 p-3.5 hover:bg-crimson/5 transition-colors text-left">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-crimson/10"><LogOut size={16} className="text-crimson" /></div>
          <p className="text-crimson font-medium text-sm flex-1">Sign Out</p>
        </button>
      </motion.div>

      <div className="mt-6 mb-2 flex flex-col items-center">
        <ShieldLogo size={28} className="mb-2 opacity-40" />
        <p className="text-gray/40 text-[10px] tracking-widest uppercase">Secure. Trusted. Tailored for you.</p>
      </div>

      {showAbout && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center" onClick={() => setShowAbout(false)}>
          <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} onClick={e => e.stopPropagation()} className="vantoris-glass-premium w-full sm:max-w-sm p-6 rounded-t-3xl sm:rounded-3xl safe-bottom">
            <div className="text-center">
              <ShieldLogo size={48} className="mx-auto mb-3" />
              <h3 className="text-foreground font-bold text-lg">VANTORIS</h3>
              <p className="text-gray text-xs mt-1">Private Banking Solutions</p>
              <p className="text-gray/60 text-[10px] mt-3 leading-relaxed">A secure, American banking platform providing personal banking, seamless money movement, and dedicated member support.</p>
              <button onClick={() => setShowAbout(false)} className="mt-5 w-full py-2.5 bg-brass text-white font-semibold rounded-xl text-sm hover:bg-brass/90 transition-all">Close</button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}
