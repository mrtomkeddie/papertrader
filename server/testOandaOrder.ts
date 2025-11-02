import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { mapOandaSymbol, getInstrumentMidPrice, placeMarketOrder, closeTrade } from './broker/oanda';

async function main() {
  const symbol = 'OANDA:XAUUSD';
  const instrument = mapOandaSymbol(symbol);
  console.log('[OrderTest] Instrument:', instrument);
  try {
    const mid = await getInstrumentMidPrice(instrument);
    console.log('[OrderTest] Mid price:', mid);

    // Safe, tiny practice order: 1 unit, SL/TP ~1% away
    const sl = Number((mid * 0.99).toFixed(2));
    const tp = Number((mid * 1.01).toFixed(2));
    const { tradeID, price } = await placeMarketOrder(instrument, 1, sl, tp, 'papertrader-order-test');
    console.log('[OrderTest] Placed trade. ID:', tradeID, 'fill price:', price);

    if (tradeID) {
      console.log('[OrderTest] Closing trade to clean up...');
      await closeTrade(tradeID);
      console.log('[OrderTest] Closed trade:', tradeID);
    }
  } catch (e) {
    console.error('[OrderTest] Error:', e instanceof Error ? e.message : String(e));
    process.exitCode = 1;
  }
}

main();