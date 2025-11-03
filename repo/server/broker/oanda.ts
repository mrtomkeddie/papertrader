// Minimal OANDA v20 REST adapter with practice/live toggle
// Uses Node 18+ global fetch

const resolveBaseUrl = (): string => {
  const env = (process.env.OANDA_ENV || process.env.VITE_OANDA_ENV || 'practice').toLowerCase();
  return env === 'live' ? 'https://api-fxtrade.oanda.com/v3' : 'https://api-fxpractice.oanda.com/v3';
};

const baseUrl = resolveBaseUrl();

const authHeader = () => ({
  'Authorization': `Bearer ${process.env.OANDA_API_TOKEN ?? process.env.VITE_OANDA_API_TOKEN}`,
  'Content-Type': 'application/json',
});

export const mapOandaSymbol = (symbol: string): string => {
  const s = symbol.toUpperCase();
  if (s.includes('XAUUSD')) return 'XAU_USD';
  if (s.startsWith('OANDA:')) {
    const p = s.split(':')[1];
    if (p.includes('_')) return p; // e.g., NAS100_USD
    if (p.length === 6) return `${p.slice(0,3)}_${p.slice(3,6)}`;
    return p; // fallback: drop prefix, pass through (e.g., NAS100)
  }
  if (s.startsWith('FX:')) {
    const p = s.split(':')[1];
    if (p.length === 6) return `${p.slice(0,3)}_${p.slice(3,6)}`;
  }
  return s.replace(':', '_');
};

export async function placeMarketOrder(
  instrument: string,
  units: number,
  stopLossPrice: number,
  takeProfitPrice: number,
  clientTag?: string
): Promise<{ tradeID?: string; price?: number }> {
  const accountId = process.env.OANDA_ACCOUNT_ID ?? process.env.VITE_OANDA_ACCOUNT_ID;
  if (!accountId) throw new Error('OANDA account ID missing');

  const body: any = {
    order: {
      type: 'MARKET',
      instrument,
      units: Math.round(units), // positive buy, negative sell
      timeInForce: 'FOK',
      positionFill: 'DEFAULT',
      clientExtensions: clientTag ? { tag: clientTag } : undefined,
      stopLossOnFill: { price: Number(stopLossPrice).toFixed(2) },
      takeProfitOnFill: { price: Number(takeProfitPrice).toFixed(2) },
    },
  };

  const res = await fetch(`${baseUrl}/accounts/${accountId}/orders`, {
    method: 'POST',
    headers: authHeader(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`OANDA order failed: ${res.status} ${text}`);
  }
  const data = await res.json();
  const tx = data?.orderFillTransaction || data?.lastTransaction;
  const tradeOpened = tx?.tradeOpened || tx?.tradesOpened?.[0];
  const tradeID = tradeOpened?.tradeID || tradeOpened?.id;
  const price = tx?.price ? Number(tx.price) : undefined;
  return { tradeID, price };
}

export async function closeTrade(tradeID: string): Promise<void> {
  const accountId = process.env.OANDA_ACCOUNT_ID ?? process.env.VITE_OANDA_ACCOUNT_ID;
  if (!accountId) throw new Error('OANDA account ID missing');
  const res = await fetch(`${baseUrl}/accounts/${accountId}/trades/${tradeID}/close`, {
    method: 'PUT',
    headers: authHeader(),
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`OANDA close failed: ${res.status} ${text}`);
  }
}

// Update the stop-loss price for an existing trade
export async function updateStopLoss(tradeID: string, price: number): Promise<void> {
  const accountId = process.env.OANDA_ACCOUNT_ID ?? process.env.VITE_OANDA_ACCOUNT_ID;
  if (!accountId) throw new Error('OANDA account ID missing');
  const body = {
    stopLoss: {
      timeInForce: 'GTC',
      price: Number(price).toFixed(2),
    },
  } as const;
  const res = await fetch(`${baseUrl}/accounts/${accountId}/trades/${tradeID}/orders`, {
    method: 'PUT',
    headers: authHeader(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`OANDA stop update failed: ${res.status} ${text}`);
  }
}

export async function getAccountSummary(): Promise<any> {
  const accountId = process.env.OANDA_ACCOUNT_ID ?? process.env.VITE_OANDA_ACCOUNT_ID;
  if (!accountId) throw new Error('OANDA account ID missing');
  const res = await fetch(`${baseUrl}/accounts/${accountId}/summary`, {
    method: 'GET',
    headers: authHeader(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`OANDA summary failed: ${res.status} ${text}`);
  }
  return res.json();
}

export async function getInstrumentMidPrice(instrument: string): Promise<number> {
  const accountId = process.env.OANDA_ACCOUNT_ID ?? process.env.VITE_OANDA_ACCOUNT_ID;
  if (!accountId) throw new Error('OANDA account ID missing');
  const url = `${baseUrl}/accounts/${accountId}/pricing?instruments=${encodeURIComponent(instrument)}`;
  const res = await fetch(url, { method: 'GET', headers: authHeader() });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`OANDA pricing failed: ${res.status} ${text}`);
  }
  const data = await res.json();
  const price = data?.prices?.[0];
  const bid = price?.bids?.[0]?.price ? Number(price.bids[0].price) : undefined;
  const ask = price?.asks?.[0]?.price ? Number(price.asks[0].price) : undefined;
  if (!bid || !ask) throw new Error('OANDA pricing malformed');
  return (bid + ask) / 2;
}