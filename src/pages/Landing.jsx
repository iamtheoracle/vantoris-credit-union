import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  ShieldCheck,
  Landmark,
  CreditCard,
  Users,
  Lock,
  Phone,
  Heart,
  Plane,
  Home,
  ChevronRight,
  Menu,
  X,
} from 'lucide-react';

const NAV = [
  { label: 'Membership', href: '#membership' },
  { label: 'Accounts', href: '#accounts' },
  { label: 'Cards', href: '#cards' },
  { label: 'Transfers', href: '#transfers' },
  { label: 'Community', href: '#community' },
  { label: 'Security', href: '#security' },
  { label: 'Contact', href: '#contact' },
];

const ACCOUNTS = [
  { name: 'Share savings', detail: 'Your primary membership share. Balances come from your member account records.' },
  { name: 'Share draft', detail: 'Everyday spending account for transfers, deposits, and approved payments.' },
  { name: 'Certificates', detail: 'Term shares when offered. Rates are shown only when the ledger returns them.' },
  { name: 'Member loans', detail: 'Credit is requested, reviewed, and approved. No pre-approved offers are invented.' },
];

const SERVICES = [
  { icon: Landmark, title: 'Member accounts', text: 'Savings, draft, and certificates in one membership.' },
  { icon: CreditCard, title: 'Cards', text: 'Debit and credit cards appear only when issued to the member.' },
  { icon: Users, title: 'Member services', text: 'Transfers, requests, and operator review stay inside the membership.' },
  { icon: ShieldCheck, title: 'Protection', text: 'Sign-in, session control, and operator approvals on money movement.' },
];

export default function Landing() {
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#F7F3EA] text-[#122033]">
      <header className="sticky top-0 z-30 border-b border-[#E6DCC8] bg-[#F7F3EA]/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#071A2D] text-sm font-bold text-[#F7F3EA]">V</span>
            <span>
              <span className="block text-sm font-bold tracking-wide text-[#071A2D]">VANTORIS</span>
              <span className="block text-[10px] uppercase tracking-[0.16em] text-[#8A7344]">Member financial home</span>
            </span>
          </Link>
          <nav className="hidden items-center gap-5 lg:flex">
            {NAV.map((item) => (
              <a key={item.href} href={item.href} className="text-sm font-medium text-[#3D4A5C] hover:text-[#0B1F3A]">{item.label}</a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/login" className="hidden rounded-full px-4 py-2 text-sm font-semibold text-[#0B1F3A] sm:inline">Member sign in</Link>
            <Link to="/register" className="rounded-full bg-[#071A2D] px-4 py-2 text-sm font-semibold text-white">Join</Link>
            <button type="button" className="lg:hidden" onClick={() => setOpen((v) => !v)} aria-label="Menu">
              {open ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
        {open && (
          <div className="border-t border-[#E4DCCB] px-4 py-3 lg:hidden">
            {NAV.map((item) => (
              <a key={item.href} href={item.href} onClick={() => setOpen(false)} className="block py-2 text-sm font-medium">{item.label}</a>
            ))}
            <Link to="/login" className="mt-2 block text-sm font-semibold">Member sign in</Link>
          </div>
        )}
      </header>

      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 sm:px-6 lg:grid-cols-2 lg:py-20">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#C9A227]">Membership</p>
          <h1 className="mt-3 font-serif text-4xl leading-tight text-[#071A2D] sm:text-6xl">A member financial home, built like a credit union.</h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-[#3D4A5C]">
            Vantoris is organized around membership: share accounts, cards, transfers, and community service. You join, you sign in, and your own records are what you see.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/register" className="inline-flex items-center gap-2 rounded-full bg-[#071A2D] px-5 py-3 text-sm font-semibold text-white">
              Become a member <ArrowRight size={16} />
            </Link>
            <Link to="/login" className="inline-flex items-center gap-2 rounded-full border border-[#C9A227] bg-white px-5 py-3 text-sm font-semibold text-[#071A2D]">
              Member sign in
            </Link>
          </div>
        </div>
        <figure className="overflow-hidden rounded-[28px] shadow-[0_24px_60px_rgba(7,26,45,0.18)]">
          <img src="/brand/branch.jpg" alt="Member services desk in a Vantoris branch" className="h-[420px] w-full object-cover" />
        </figure>
      </section>

      <section id="membership" className="border-y border-[#E4DCCB] bg-white">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-16 sm:px-6 md:grid-cols-4">
          {SERVICES.map(({ icon: Icon, title, text }) => (
            <div key={title}>
              <Icon className="text-[#1F6B4A]" size={22} />
              <h2 className="mt-3 font-semibold text-[#0B1F3A]">{title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-[#3D4A5C]">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="accounts" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#1F6B4A]">Accounts</p>
        <h2 className="mt-2 font-serif text-3xl text-[#0B1F3A] sm:text-4xl">Shares, draft, and credit — in member language.</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {ACCOUNTS.map((item) => (
            <div key={item.name} className="rounded-3xl border border-[#E4DCCB] bg-white p-6">
              <h3 className="text-lg font-semibold text-[#0B1F3A]">{item.name}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[#3D4A5C]">{item.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="cards" className="bg-[#071A2D] text-white">
        <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 py-16 sm:px-6 lg:grid-cols-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#C9A227]">Cards</p>
            <h2 className="mt-2 font-serif text-3xl">Issued to the member. Not displayed until they exist.</h2>
            <p className="mt-4 max-w-md text-white/70">Debit and credit cards show the last four and status returned by the membership system. Freeze, spend controls, and new issuance stay with member services until a card program is connected.</p>
          </div>
          <figure className="overflow-hidden rounded-[28px]">
            <img src="/brand/card.jpg" alt="Navy and brass Vantoris member card" className="h-[320px] w-full object-cover" />
          </figure>
        </div>
      </section>

      <section id="transfers" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#1F6B4A]">Transfers</p>
        <h2 className="mt-2 font-serif text-3xl text-[#0B1F3A]">Money moves after a member request and an operator decision.</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {[
            ['Send', 'A member prepares a transfer. It stays pending until an operator approves it.'],
            ['Add funds', 'Deposits are requested against a share or draft account, then posted on approval.'],
            ['Member QR', 'Scan another member to start a transfer. Nothing is sent until it is reviewed.'],
          ].map(([title, text]) => (
            <div key={title} className="rounded-3xl bg-white p-6">
              <h3 className="font-semibold text-[#0B1F3A]">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[#3D4A5C]">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="community" className="border-y border-[#E6DCC8] bg-white">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#C9A227]">Community</p>
          <h2 className="mt-2 font-serif text-3xl text-[#071A2D]">Service, families, and everyday life.</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <figure className="overflow-hidden rounded-3xl"><img src="/brand/community.jpg" alt="Members packing care packages" className="h-56 w-full object-cover" /></figure>
            <figure className="overflow-hidden rounded-3xl"><img src="/brand/travel.jpg" alt="Travel from the member window" className="h-56 w-full object-cover" /></figure>
            <figure className="overflow-hidden rounded-3xl"><img src="/brand/home.jpg" alt="A member home at golden hour" className="h-56 w-full object-cover" /></figure>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div className="rounded-3xl bg-[#F7F3EA] p-6">
              <Heart className="text-[#1F6B4A]" />
              <h3 className="mt-3 font-semibold">Giving</h3>
              <p className="mt-2 text-sm text-[#3D4A5C]">Members can request support for verified organizations. Donations are not simulated.</p>
            </div>
            <div className="rounded-3xl bg-[#F7F3EA] p-6">
              <Plane className="text-[#1F6B4A]" />
              <h3 className="mt-3 font-semibold">Travel</h3>
              <p className="mt-2 text-sm text-[#3D4A5C]">Travel requests go to member services. Bookings appear only when a provider returns them.</p>
            </div>
            <div className="rounded-3xl bg-[#F7F3EA] p-6">
              <Home className="text-[#1F6B4A]" />
              <h3 className="mt-3 font-semibold">Homes</h3>
              <p className="mt-2 text-sm text-[#3D4A5C]">Housing help is a member request. Listings are not invented.</p>
            </div>
          </div>
        </div>
      </section>

      <section id="security" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="grid gap-8 lg:grid-cols-2">
          <div>
            <Lock className="text-[#1F6B4A]" />
            <h2 className="mt-3 font-serif text-3xl text-[#0B1F3A]">Member access, operator control.</h2>
            <p className="mt-3 text-[#3D4A5C]">Sign-in is required for accounts. Operators and administrators approve or decline pending transfers. The membership record is the source of balances and activity.</p>
          </div>
          <ol className="space-y-3">
            {['Join and complete membership details.', 'Sign in with your member email.', 'Open shares, cards, and transfers.', 'Operators review money movement before it posts.'].map((step, i) => (
              <li key={step} className="flex gap-3 rounded-2xl bg-white p-4">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#0B1F3A] text-xs font-bold text-white">{i + 1}</span>
                <span className="text-sm font-medium">{step}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="contact" className="bg-[#0B1F3A] text-white">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#C9B896]">Member services</p>
          <h2 className="mt-2 font-serif text-3xl">Talk to Vantoris.</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <a href="tel:+12055688741" className="rounded-3xl bg-white/8 p-6">
              <Phone size={18} />
              <p className="mt-3 text-xs uppercase tracking-wider text-white/50">United States</p>
              <p className="mt-1 text-2xl font-semibold">+1 (205) 568-8741</p>
            </a>
            <a href="tel:+447404767964" className="rounded-3xl bg-white/8 p-6">
              <Phone size={18} />
              <p className="mt-3 text-xs uppercase tracking-wider text-white/50">United Kingdom</p>
              <p className="mt-1 text-2xl font-semibold">+44 7404 767964</p>
            </a>
          </div>
        </div>
      </section>

      <footer className="border-t border-[#E4DCCB] bg-[#F6F1E7]">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-[#3D4A5C] sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>Vantoris membership. Credit-union style service. Not a claim of a bank or credit-union charter.</p>
          <Link to="/login" className="inline-flex items-center gap-1 font-semibold text-[#0B1F3A]">Member sign in <ChevronRight size={16} /></Link>
        </div>
      </footer>
    </div>
  );
}
