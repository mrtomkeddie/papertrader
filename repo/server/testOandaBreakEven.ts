import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { mapOandaSymbol, getInstrumentMidPrice, placeMarketOrder, updateStopLoss, closeTrade } from './broker/oanda';

async function main() {
  const symbol = 'OANDA:XAUUSD';
  const instrument = mapOandaSymbol(symbol);
  console.log('[BreakEvenTest] Instrument:', instrument);
  try {
    const mid = await getInstrumentMidPrice(instrument);
    console.log('[BreakEvenTest] Mid price:', mid);

    // Place a tiny practice order with ~1% SL/TP
    const sl = Number((mid * 0.99).toFixed(2));
    const tp = Number((mid * 1.01).toFixed(2));
    const { tradeID, price } = await placeMarketOrder(instrument, 1, sl, tp, 'papertrader-break-even-test');
    console.log('[BreakEvenTest] Placed trade. ID:', tradeID, 'fill price:', price);

    if (tradeID && price) {
      // Move stop to break-even (entry)
      const be = Number(price.toFixed(2));
      console.log('[BreakEvenTest] Updating stop to break-even at', be);
      await updateStopLoss(tradeID, be);
      console.log('[BreakEvenTest] Stop moved to break-even. Cleaning up...');
      try {
        await closeTrade(tradeID);
        console.log('[BreakEvenTest] Closed trade:', tradeID);
      } catch (err) {
        console.warn('[BreakEvenTest] Close failed (likely already closed by SL/TP):', err instanceof Error ? err.message : String(err));
      }
    }
  } catch (e) {
    console.error('[BreakEvenTest] Error:', e instanceof Error ? e.message : String(e));
    process.exitCode = 1;
  }
}

main();