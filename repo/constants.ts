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
  // Indices (NAS100)
  { symbol: 'OANDA:NAS100_USD', description: 'NASDAQ 100 / US Dollar', category: 'Index' },
];

export const SELECTED_INSTRUMENTS = [
  // Single, focused universe
  { symbol: 'OANDA:XAUUSD', description: 'Gold / US Dollar', category: 'Metals' },
  { symbol: 'OANDA:NAS100_USD', description: 'NASDAQ 100 / US Dollar', category: 'Index' },
];

export const TIMEFRAME_BY_SYMBOL: Record<string, string> = {
  'OANDA:XAUUSD': '15m',
  'OANDA:NAS100_USD': '15m',
};

export const SELECTED_METHODS = [
  // Only the new fixed strategy
  'FIXED ORB + FVG + LVN',
  'London Liquidity Sweep (Gold)'
  ,'London Continuation (Gold)'
];

// Symbol-specific protection parameters for live trailing and stop logic
export const BREAK_EVEN_R_BY_SYMBOL: Record<string, number> = {
  // Move to break-even at +1.5R (TP1 stage)
  'OANDA:XAUUSD': 1.5,
  'OANDA:NAS100_USD': 1.5,
};

export const LOCK_R_BY_SYMBOL: Record<string, number> = {
  // Disable legacy lock stage (handled via partial closes)
  'OANDA:XAUUSD': 0,
  'OANDA:NAS100_USD': 0,
};

export const LOCK_OFFSET_R_BY_SYMBOL: Record<string, number> = {
  'OANDA:XAUUSD': 0,
  'OANDA:NAS100_USD': 0,
};

export const ATR_TRAIL_START_R_BY_SYMBOL: Record<string, number> = {
  // Start ATR trailing at +3R (TP2 stage)
  'OANDA:XAUUSD': 3.0,
  'OANDA:NAS100_USD': 3.0,
};

export const ATR_MULT_BY_SYMBOL: Record<string, number> = {
  // ATR(14) multiplier fixed at 1.5
  'OANDA:XAUUSD': 1.5,
  'OANDA:NAS100_USD': 1.5,
};