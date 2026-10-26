import React, { useState } from 'react';
import ProductShell from './ProductShell';
import { parseCommand, runAssignment } from '@/lib/memberActions';

export default function Ask() {
  const [input, setInput] = useState('');
  const [log, setLog] = useState([]);
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);

  function push(role, text) {
    setLog((prev) => [...prev, { role, text }]);
  }

  async function ask() {
    const q = input.trim();
    if (!q || busy) return;
    setInput('');
    push('you', q);
    const command = parseCommand(q);
    if (['send', 'deposit', 'freeze', 'check', 'wire', 'zelle', 'wallet', 'ira'].includes(command.type)) {
      setDraft({ q, command });
      push('vantoris', command.type === 'freeze'
        ? 'Prepared a freeze on your primary share account. Confirm to write it.'
        : `Prepared ${command.type} of $${Number(command.amount || 0).toFixed(2)}. Confirm to write the pending record. Nothing posts until an operator approves it.`);
      return;
    }
    setBusy(true);
    try {
      const result = await runAssignment(command);
      push('vantoris', result.text);
    } catch (e) {
      push('vantoris', e.message || 'The membership backend rejected this assignment.');
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!draft) return;
    setBusy(true);
    try {
      const result = await runAssignment(draft.command);
      push('vantoris', result.text);
      setDraft(null);
    } catch (e) {
      push('vantoris', e.message || 'The membership backend rejected this assignment.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ProductShell kicker="Member assistant" title="Ask" subtitle="Connected to your membership. No language model. Assignments write real records.">
      <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-[12px] text-emerald-900">
        Runs on this platform. Agents queue the work. Operators approve it. Cards, wallets, Zelle, checks, wires, and IRA open only after approval.
      </div>
      <div className="space-y-2 mb-4">
        {log.map((m, i) => (
          <div key={i} className={`rounded-2xl px-4 py-3 text-sm ${m.role === 'you' ? 'bg-navy text-white' : 'bg-white border border-slate-200'}`}>
            <p>{m.text}</p>
          </div>
        ))}
      </div>
      {draft && (
        <div className="mb-4 rounded-2xl border border-brass/40 bg-brass/10 p-4 text-sm">
          <p className="font-semibold text-navy">{draft.q}</p>
          <div className="mt-3 flex gap-2">
            <button type="button" disabled={busy} onClick={confirm} className="rounded-full bg-navy px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">{busy ? 'Writing…' : 'Confirm'}</button>
            <button type="button" onClick={() => setDraft(null)} className="rounded-full border border-slate-300 px-4 py-2 text-xs font-semibold">Cancel</button>
          </div>
        </div>
      )}
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && ask()}
          placeholder="check $100 · zelle $40 to Ada · open IRA"
          className="h-11 flex-1 rounded-xl border border-slate-200 px-3 text-sm"
        />
        <button type="button" disabled={busy} onClick={ask} className="rounded-xl bg-navy px-4 text-sm font-semibold text-white disabled:opacity-50">Ask</button>
      </div>
    </ProductShell>
  );
}
