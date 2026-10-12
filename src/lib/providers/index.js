/**
 * Vantoris provider boundary.
 * Production adapters plug in here. UI must not invent provider results.
 * LLM-independent: product flows do not require a language model.
 */

export const PROVIDER_STATUS = {
  CONNECTED: 'connected',
  UNAVAILABLE: 'unavailable',
  NOT_CONFIGURED: 'not_configured',
};

export const ORDER_STATES = [
  'PENDING',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
  'REFUNDED',
  'PARTIALLY_REFUNDED',
  'REVERSED',
];

export const SHIPMENT_STATES = [
  'ORDERED',
  'CONFIRMED',
  'PACKED',
  'SHIPPED',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
];

/** Config flags. Flip only when a real adapter is wired. */
export const PROVIDERS = {
  financialAccount: { id: 'financialAccount', label: 'USD account', status: PROVIDER_STATUS.CONNECTED, note: 'Reads member Account records from the connected backend when present.' },
  payments: { id: 'payments', label: 'Payments', status: PROVIDER_STATUS.NOT_CONFIGURED, note: 'Send requires a payments provider. Not connected.' },
  cards: { id: 'cards', label: 'Cards', status: PROVIDER_STATUS.NOT_CONFIGURED, note: 'No card issuer connected. Existing card records display only if the backend returns them.' },
  flights: { id: 'flights', label: 'Flights', status: PROVIDER_STATUS.NOT_CONFIGURED, note: 'No licensed flight inventory or booking provider connected.' },
  flightTracking: { id: 'flightTracking', label: 'Flight tracking', status: PROVIDER_STATUS.NOT_CONFIGURED, note: 'No commercial flight-status provider connected. Live positions are not simulated.' },
  hotels: { id: 'hotels', label: 'Hotels', status: PROVIDER_STATUS.NOT_CONFIGURED, note: 'No hotel inventory provider connected.' },
  cars: { id: 'cars', label: 'Cars', status: PROVIDER_STATUS.NOT_CONFIGURED, note: 'No car rental provider connected.' },
  homes: { id: 'homes', label: 'Homes', status: PROVIDER_STATUS.NOT_CONFIGURED, note: 'No licensed listing provider connected. Listings are not fabricated.' },
  marketplace: { id: 'marketplace', label: 'HeroBox marketplace', status: PROVIDER_STATUS.NOT_CONFIGURED, note: 'Catalog prices require a merchant feed. Sample prices are not shown.' },
  shipping: { id: 'shipping', label: 'Shipping', status: PROVIDER_STATUS.NOT_CONFIGURED, note: 'Carrier rating is not connected. Shipping quotes are not estimated.' },
  donations: { id: 'donations', label: 'Giving', status: PROVIDER_STATUS.NOT_CONFIGURED, note: 'No donation processor connected. External redirects are not used as a substitute checkout.' },
  news: { id: 'news', label: 'News', status: PROVIDER_STATUS.CONNECTED, note: 'BBC Business headlines and ECB USD rates. Licensed full feed is not connected.' },
  identity: { id: 'identity', label: 'Identity', status: PROVIDER_STATUS.CONNECTED, note: 'Member session comes from the connected auth provider.' },
};

export function isConnected(key) {
  return PROVIDERS[key]?.status === PROVIDER_STATUS.CONNECTED;
}
