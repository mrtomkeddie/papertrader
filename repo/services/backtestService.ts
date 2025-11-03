import { fetchHistoricalOHLC } from './dataService';
import { evaluateORB } from '../strategies/orb';
import { evaluateTrendPullback } from '../strategies/trendPullback';
import { evaluateVWAPReversion } from '../strategies/vwapReversion';
import { OhlcData, StrategySignal } from '../types'; // Assume StrategySignal is defined in types.ts

export interface BacktestResult {
  totalTrades: number;
  winRate: number;
  avgR: number;
  maxDrawdown: number;
  totalProfit: number;
  trades: Array<{
    entryTime: number;
    entryPrice: number;
    exitTime: number;
    exitPrice: number;
    side: 'LONG' | 'SHORT';
    pnl: number;
    rMultiple: number;
  }>;
}

export async function runBacktest(
  symbol: string,
  strategy: 'ORB' | 'TrendPullback' | 'VWAPReversion',
  startDate: string,
  endDate: string,
  interval: string = '1h',
  initialCapital: number = 10000,
  riskPerTrade: number = 0.01 // 1% risk
): Promise<BacktestResult> {
  const data: OhlcData[] = await fetchHistoricalOHLC(symbol, interval, startDate, endDate);
  
  let equity = initialCapital;
  let peakEquity = initialCapital;
  let trades: BacktestResult['trades'] = [];
  let openPosition: { entryPrice: number; stop: number; tp: number; side: 'LONG' | 'SHORT'; entryTime: number; positionSize: number } | null = null;

  for (let i = 50; i < data.length; i++) { // Start after enough data for indicators
    const historicalData = data.slice(0, i + 1);
    let signal: StrategySignal | null = null;

    switch (strategy) {
      case 'ORB':
        signal = evaluateORB(historicalData);
        break;
      case 'TrendPullback':
        signal = evaluateTrendPullback(historicalData);
        break;
      case 'VWAPReversion':
        signal = evaluateVWAPReversion(historicalData);
        break;
    }

    const currentBar = data[i];

    if (signal && !openPosition && signal.rrr >= 1.5) {
      const riskAmount = equity * riskPerTrade;
      const riskPerUnit = Math.abs(signal.entry - signal.stop);
      const positionSize = riskAmount / riskPerUnit;

      openPosition = {
        entryPrice: signal.entry,
        stop: signal.stop,
        tp: signal.tp,
        side: signal.side,
        entryTime: currentBar.time,
        positionSize,
      };
    }

    if (openPosition) {
      let exitPrice: number | null = null;
      let rMultiple = 0;

      if (openPosition.side === 'LONG') {
        if (currentBar.low <= openPosition.stop) {
          exitPrice = openPosition.stop;
          rMultiple = (exitPrice - openPosition.entryPrice) / (openPosition.entryPrice - openPosition.stop);
        } else if (currentBar.high >= openPosition.tp) {
          exitPrice = openPosition.tp;
          rMultiple = (exitPrice - openPosition.entryPrice) / (openPosition.entryPrice - openPosition.stop);
        }
      } else { // SHORT
        if (currentBar.high >= openPosition.stop) {
          exitPrice = openPosition.stop;
          rMultiple = (openPosition.entryPrice - exitPrice) / (openPosition.stop - openPosition.entryPrice);
        } else if (currentBar.low <= openPosition.tp) {
          exitPrice = openPosition.tp;
          rMultiple = (openPosition.entryPrice - exitPrice) / (openPosition.stop - openPosition.entryPrice);
        }
      }

      if (exitPrice !== null) {
        const pnl = (exitPrice - openPosition.entryPrice) * openPosition.positionSize * (openPosition.side === 'LONG' ? 1 : -1);
        equity += pnl;
        peakEquity = Math.max(peakEquity, equity);

        trades.push({
          entryTime: openPosition.entryTime,
          entryPrice: openPosition.entryPrice,
          exitTime: currentBar.time,
          exitPrice,
          side: openPosition.side,
          pnl,
          rMultiple,
        });

        openPosition = null;
      }
    }
  }

  const totalTrades = trades.length;
  const wins = trades.filter(t => t.pnl > 0).length;
  const winRate = totalTrades > 0 ? wins / totalTrades : 0;
  const avgR = totalTrades > 0 ? trades.reduce((sum, t) => sum + t.rMultiple, 0) / totalTrades : 0;
  const totalProfit = equity - initialCapital;
  const maxDrawdown = ((peakEquity - Math.min(...trades.reduce((eqs, t) => { eqs.push(eqs[eqs.length - 1] + t.pnl); return eqs; }, [initialCapital]))) / peakEquity) * 100;

  return {
    totalTrades,
    winRate,
    avgR,
    maxDrawdown,
    totalProfit,
    trades,
  };
}