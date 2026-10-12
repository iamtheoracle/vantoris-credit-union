import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import {
  TrendingUp,
  Heart,
  Newspaper,
  Globe2,
  Megaphone,
  Package,
  ChevronRight,
  Lock,
  BadgeCheck,
  Sparkles,
  Plane,
  Building2,
} from 'lucide-react';

/**
 * Discover hub — Investment, HeroBox, News, NGO, Marketing, FX.
 * Visible to all members; activation requires an explicit request (ops review).
 */

const MODULES = [
  {
    id: 'investment',
    title: 'Investment',
    desc: 'Portfolios, deposits, withdrawals, signals',
    icon: TrendingUp,
    route: '/investment',
    image:
      'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?auto=format&fit=crop&w=900&q=80',
    color: 'from-navy to-[#0E2A4A]',
  },
  {
    id: 'herobox',
    title: 'HeroBox',
    desc: 'Care packages, military & community logistics',
    icon: Package,
    route: '/herobox',
    image:
      'https://images.unsplash.com/photo-1469571486292-0ba58a3f068b?auto=format&fit=crop&w=900&q=80',
    color: 'from-[#0B3D2E] to-navy',
  },
  {
    id: 'ngo',
    title: 'NGO & impact',
    desc: 'Partner causes, humanitarian discovery',
    icon: Heart,
    route: '/discover/ngo',
    image:
      'https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?auto=format&fit=crop&w=900&q=80',
    color: 'from-[#3B1F4A] to-navy',
  },
  {
    id: 'news',
    title: 'Markets & news',
    desc: 'Currency and financial headlines',
    icon: Newspaper,
    route: '/discover/news',
    image:
      'https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?auto=format&fit=crop&w=900&q=80',
    color: 'from-[#1a2332] to-[#0A1628]',
  },
  {
    id: 'fx',
    title: 'Currency desk',
    desc: 'FX reference rates (indicative)',
    icon: Globe2,
    route: '/discover/fx',
    image:
      'https://images.unsplash.com/photo-1580519542036-c47de6196ba5?auto=format&fit=crop&w=900&q=80',
    color: 'from-[#1F3A5F] to-navy',
  },
  {
    id: 'marketing',
    title: 'Member marketing',
    desc: 'Campaigns, templates, brand kits',
    icon: Megaphone,
    route: '/discover/marketing',
    image:
      'https://images.unsplash.com/photo-1557804506-669a67965ba0?auto=format&fit=crop&w=900&q=80',
    color: 'from-[#4A3728] to-navy',
  },
  {
    id: 'flights',
    title: 'Flight tracking',
    desc: 'Live airborne positions & travel desk',
    icon: Plane,
    route: '/discover/flights',
    image:
      'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?auto=format&fit=crop&w=900&q=80',
    color: 'from-[#0A3A5C] to-navy',
  },
  {
    id: 'housing',
    title: 'Housing',
    desc: 'Market samples & carrying-cost cues',
    icon: Building2,
    route: '/discover/housing',
    image:
      'https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=900&q=80',
    color: 'from-[#2A4A3A] to-navy',
  },

];

const ACTIVE_KEY = 'vantoris_module_access';

function loadAccess() {
  try {
    return JSON.parse(localStorage.getItem(ACTIVE_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveAccess(map) {
  localStorage.setItem(ACTIVE_KEY, JSON.stringify(map));
}

export default function Discover() {
  const [user, setUser] = useState(null);
  const [access, setAccess] = useState({});
  const [msg, setMsg] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
    setAccess(loadAccess());
  }, []);

  async function requestAccess(mod) {
    const next = {
      ...access,
      [mod.id]: { status: 'pending', requested_at: new Date().toISOString() },
    };
    setAccess(next);
    saveAccess(next);
    try {
      await base44.entities.Notification.create({
        user_id: user?.id || 'unknown',
        title: `Access request: ${mod.title}`,
        message: `${user?.email || 'Member'} requested activation of ${mod.title} (${mod.id}).`,
        type: 'info',
      }).catch(() => {});
    } catch (_) {}
    setMsg(`Request sent for ${mod.title}. You’ll be notified when ops activates it.`);
  }

  function openModule(mod) {
    const st = access[mod.id]?.status;
    if (st === 'active') {
      navigate(mod.route);
      return;
    }
    if (st === 'pending') {
      setMsg(`${mod.title} is pending review. You can still preview public info.`);
      navigate(mod.route);
      return;
    }
    // allow browse but show gate CTA on destination; still navigate for real pages
    navigate(mod.route);
  }

  return (
    <div className="min-h-screen bg-[#F4F6F9] pb-28">
      <div className="relative overflow-hidden bg-navy text-white px-5 pt-6 pb-10">
        <div className="absolute inset-0 opacity-40">
          <img src="https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=1200&q=80" alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-navy/80 to-navy" />
        </div>
        <div className="relative">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-brass">Discover</p>
        <h1 className="font-heading text-2xl font-bold mt-1">Products & missions</h1>
        <p className="text-white/60 text-sm mt-2 leading-relaxed">
          Browse everything. <strong className="text-white/90">Request access</strong> to activate
          investment, HeroBox, NGO, news, FX, and marketing inside your membership.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-mono text-brass">
            <BadgeCheck size={12} /> Since 2015
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2.5 py-1 text-[10px] font-mono text-emerald-300">
            Verified banking rails
          </span>
        </div>
      </div>
      </div>

      {msg && (
        <div className="mx-5 mt-4 rounded-xl border border-brass/30 bg-brass/10 px-4 py-3 text-sm text-navy">
          {msg}
        </div>
      )}

      <div className="px-5 mt-5 space-y-4">
        {MODULES.map((mod) => {
          const Icon = mod.icon;
          const st = access[mod.id]?.status;
          return (
            <article
              key={mod.id}
              className="rounded-2xl overflow-hidden bg-white border border-slate-200/80 shadow-sm"
            >
              <button type="button" onClick={() => openModule(mod)} className="w-full text-left">
                <div className="relative h-36 bg-slate-200">
                  <img
                    src={mod.image}
                    alt=""
                    className="w-full h-full object-cover"
                    loading="lazy"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                  <div className={`absolute inset-0 bg-gradient-to-t ${mod.color} opacity-70`} />
                  <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between">
                    <div>
                      <p className="text-white font-heading font-bold text-lg flex items-center gap-2">
                        <Icon size={18} /> {mod.title}
                      </p>
                      <p className="text-white/80 text-xs mt-0.5">{mod.desc}</p>
                    </div>
                    <ChevronRight className="text-white/80" size={20} />
                  </div>
                </div>
              </button>
              <div className="px-4 py-3 flex items-center justify-between gap-2">
                <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
                  {st === 'active' ? 'Active' : st === 'pending' ? 'Pending review' : 'View · request to activate'}
                </span>
                {st === 'active' ? (
                  <Link
                    to={mod.route}
                    className="text-xs font-bold text-navy inline-flex items-center gap-1"
                  >
                    Open <ChevronRight size={14} />
                  </Link>
                ) : st === 'pending' ? (
                  <span className="text-xs text-amber-700 font-semibold inline-flex items-center gap-1">
                    <Lock size={12} /> Pending
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => requestAccess(mod)}
                    className="text-xs font-bold bg-navy text-white px-3 py-1.5 rounded-full inline-flex items-center gap-1"
                  >
                    <Sparkles size={12} /> Request access
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
