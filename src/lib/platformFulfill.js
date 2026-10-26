import { base44 } from '@/api/base44Client';

/**
 * Approval records are platform workflow only. No external card issuer,
 * wallet tokenization service, or IRA custodian is configured.
 * Never fabricate issued cards, wallet provisioning, or financial accounts.
 */
export async function fulfillService(request, approved) {
  if (!approved) return { done: false, note: 'Request rejected; no service was provisioned.' };

  const type = String(request.service_type || '').toLowerCase();
  const unavailable = {
    card: 'Request approved for manual follow-up only. No card issuer is connected, so no card was issued.',
    apple: 'Request approved for manual follow-up only. Apple Wallet provisioning is not connected.',
    google: 'Request approved for manual follow-up only. Google Wallet provisioning is not connected.',
    ira: 'Request approved for manual follow-up only. No IRA custodian or account-opening provider is connected.',
  };

  if (unavailable[type]) return { done: false, note: unavailable[type] };

  // These are platform service requests, not evidence of external execution.
  if (['zelle', 'check', 'wire', 'flight', 'home', 'community'].includes(type)) {
    return {
      done: false,
      note: 'Request approved for operator follow-up. No external provider action was performed.',
    };
  }

  return {
    done: false,
    note: 'Request reviewed on the platform only. No external service was provisioned.',
  };
}
