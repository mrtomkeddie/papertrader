export const WEBHOOK_KEY = "your-super-secret-key";
export const DEFAULT_SYMBOL = "OANDA:XAUUSD";
export const DEFAULT_TIMEFRAME = "15m";

export const PINE_SCRIPT_ALERT_MESSAGE = `{
    "signal": "{{strategy.order.action == 'buy' ? 'LONG' : 'SHORT'}}",
    "symbol": "{{ticker}}",
    "bar_time": {{time_close}},
    "close": {{close}},
    "atr": {{plot("ATR")}}
}`;

export const POPULAR_MARKETS = [
  // Forex only
  { symbol: 'FX:EURUSD', description: 'Euro / US Dollar', category: 'Forex' },
  // Metals (Gold)
  { symbol: 'OANDA:XAUUSD', description: 'Gold / US Dollar', category: 'Metals' },
];

export const SELECTED_INSTRUMENTS = [
  // Single, focused universe
  { symbol: 'OANDA:XAUUSD', description: 'Gold / US Dollar', category: 'Metals' },
];

export const TIMEFRAME_BY_SYMBOL: Record<string, string> = {
  'FX:EURUSD': '1h',
  'OANDA:XAUUSD': '15m',
};

export const SELECTED_METHODS = [
  // Strategy names must match signal.strategy from strategyService
  'ORB',
  'Trend Pullback',
  'VWAP Reversion',
];