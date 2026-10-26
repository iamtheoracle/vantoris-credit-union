import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { notifyOperators } from '@/lib/notifyOperators';
import { formatCurrency } from '@/lib/formatCurrency';
import {
  CreditCard,
  Smartphone,
  QrCode,
  Landmark,
  FileText,
  Wallet,
  ArrowLeft,
} from 'lucide-react';

const SERVICES = [
  { id: 'card', title: 'Member card', text: 'Request a share-draft debit card. It appears only after issuance.', icon: CreditCard },
  { id: 'apple', title: 'Apple Wallet', text: 'Request to add your member card to Apple Pay.', icon: Smartphone },
  { id: 'google', title: 'Google Wallet', text: 'Request to add your member card to Google Pay.', icon: Smartphone },
  { id: 'zelle', title: 'Zelle', text: 'Request Zelle enrollment or send a pending Zelle transfer.', icon: Landmark },
  { id: 'check', title: 'Check deposit', text: 'Submit a check for operator review before it posts.', icon: FileText },
  { id: 'qr', title: 'QR payment', text: 'Pay or receive another member with a membership QR.', icon: QrCode, href: '/qr' },
  { id: 'wire', title: 'Wire', text: 'Request a domestic or international wire. It stays pending.', icon: Landmark },
  { id: 'ira', title: 'IRA', text: 'Request a Traditional or Roth IRA share.', icon: Wallet },
];

export default function MemberServices() {
  const [active, setActive] = useState(null);
  const [amount, setAmount] = useState('');
  const [detail, setDetail] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const navigate = useNavigate();

  async function submit(kind) {
    setBusy(true);
    setMessage('');
    try {
      const me = await base44.auth.me();
      const who = me.full_name || me.email || 'A member';
      const value = Number(amount);
      const accounts = await base44.entities.Account.filter({ user_id: me.id }, '-created_date').catch(() => []);
      const account = Array.isArray(accounts) ? accounts[0] : null;

      if (kind === 'check' || kind === 'wire' || kind === 'zelle') {
        if (!account) throw new Error('No share account is on this membership yet.');
        if (!value || value <= 0) throw new Error('Enter an amount.');
        const type = kind === 'check' ? 'deposit' : 'wire';
        const txn = await base44.entities.Transaction.create({
          account_id: account.id,
          user_id: me.id,
          type,
          amount: kind === 'check' ? value : -value,
          description: `${kind === 'check' ? 'Check deposit' : kind === 'wire' ? 'Wire' : 'Zelle'} ${detail || ''}`.trim(),
          status: 'pending',
          counterparty: detail || '',
        });
        await notifyOperators({
          title: `${kind === 'check' ? 'Check deposit' : kind === 'wire' ? 'Wire' : 'Zelle'} requested`,
          message: `${who} requested ${formatCurrency(value)}. ${detail || ''} txn:${txn?.id || ''}`,
          type: 'warning',
        });
        setMessage(`Queued. ${formatCurrency(value)} is pending operator approval. Transaction ${txn?.id || 'created'}.`);
      } else {
        const row = await base44.entities.ServiceRequest.create({
          user_id: me.id,
          service_type: kind,
          details: detail || `${kind} request`,
          status: 'pending',
        });
        await notifyOperators({
          title: `${kind} requested`,
          message: `${who} requested ${kind}. ${detail || ''}`,
          type: 'warning',
        });
        setMessage(`Request ${row?.id || 'created'}. Operators were notified. Nothing is provisioned until they approve it.`);
      }
      setAmount('');
      setDetail('');
    } catch (e) {
      setMessage(e.message || 'The membership backend rejected this request.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#F7F3EA] px-4 pb-28 pt-5 text-[#122033]">
      <button type="button" onClick={() => navigate(-1)} className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-[#071A2D]">
        <ArrowLeft size={16} /> Back
      </button>
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#C9A227]">Member services</p>
      <h1 className="mt-1 font-serif text-3xl text-[#071A2D]">Move money the credit-union way.</h1>
      <p className="mt-2 text-sm text-[#3D4A5C]">Card, wallets, Zelle, check, QR, wire, and IRA. Each request writes a real record. External networks are not claimed until a provider accepts them.</p>

      <div className="mt-6 grid grid-cols-2 gap-3">
        {SERVICES.map((item) => {
          const Icon = item.icon;
          if (item.href) {
            return (
              <Link key={item.id} to={item.href} className="rounded-3xl bg-white p-4 shadow-sm">
                <Icon className="text-[#1F6B4A]" size={20} />
                <p className="mt-3 font-semibold text-[#071A2D]">{item.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-[#3D4A5C]">{item.text}</p>
              </Link>
            );
          }
          return (
            <button key={item.id} type="button" onClick={() => { setActive(item); setMessage(''); }} className="rounded-3xl bg-white p-4 text-left shadow-sm">
              <Icon className="text-[#1F6B4A]" size={20} />
              <p className="mt-3 font-semibold text-[#071A2D]">{item.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-[#3D4A5C]">{item.text}</p>
            </button>
          );
        })}
      </div>

      {active && (
        <div className="mt-5 rounded-3xl bg-[#071A2D] p-5 text-white">
          <p className="text-xs uppercase tracking-[0.16em] text-[#C9A227]">{active.title}</p>
          <p className="mt-2 text-sm text-white/70">{active.text}</p>
          {['check', 'wire', 'zelle'].includes(active.id) && (
            <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="Amount" className="mt-4 h-11 w-full rounded-xl border-0 px-3 text-sm text-[#122033]" />
          )}
          <input value={detail} onChange={(e) => setDetail(e.target.value)} placeholder={active.id === 'ira' ? 'Traditional or Roth' : 'Memo or beneficiary'} className="mt-3 h-11 w-full rounded-xl border-0 px-3 text-sm text-[#122033]" />
          <button type="button" disabled={busy} onClick={() => submit(active.id)} className="mt-4 h-11 w-full rounded-xl bg-[#C9A227] text-sm font-semibold text-[#071A2D] disabled:opacity-50">
            {busy ? 'Writing…' : 'Submit request'}
          </button>
          {message && <p className="mt-3 text-sm text-white/80">{message}</p>}
        </div>
      )}
    </div>
  );
}
