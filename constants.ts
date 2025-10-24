export const WEBHOOK_KEY = "your-super-secret-key";
export const DEFAULT_SYMBOL = "AAPL";
export const DEFAULT_TIMEFRAME = "1D";

export const PINE_SCRIPT_ALERT_MESSAGE = `{
    "signal": "{{strategy.order.action == 'buy' ? 'LONG' : 'SHORT'}}",
    "symbol": "{{ticker}}",
    "bar_time": {{time_close}},
    "close": {{close}},
    "atr": {{plot("ATR")}}
}`;

export const POPULAR_MARKETS = [
  // Stocks
  { symbol: 'AAPL', description: 'Apple Inc.', category: 'Stocks' },
  { symbol: 'TSLA', description: 'Tesla, Inc.', category: 'Stocks' },
  { symbol: 'NVDA', description: 'NVIDIA Corporation', category: 'Stocks' },
  { symbol: 'GOOGL', description: 'Alphabet Inc.', category: 'Stocks' },
  { symbol: 'AMZN', description: 'Amazon.com, Inc.', category: 'Stocks' },
  { symbol: 'MSFT', description: 'Microsoft Corporation', category: 'Stocks' },
  { symbol: 'SPY', description: 'SPDR S&P 500 ETF', category: 'Stocks' },
  { symbol: 'QQQ', description: 'Invesco QQQ Trust', category: 'Stocks' },

  // Crypto
  { symbol: 'COINBASE:BTCUSD', description: 'Bitcoin / US Dollar', category: 'Crypto' },
  { symbol: 'COINBASE:ETHUSD', description: 'Ethereum / US Dollar', category: 'Crypto' },
  { symbol: 'BINANCE:SOLUSDT', description: 'Solana / Tether', category: 'Crypto' },
  { symbol: 'BINANCE:XRPUSDT', description: 'Ripple / Tether', category: 'Crypto' },
  { symbol: 'BINANCE:DOGEUSDT', description: 'Dogecoin / Tether', category: 'Crypto' },
  { symbol: 'COINBASE:AVAXUSD', description: 'Avalanche / US Dollar', category: 'Crypto' },
  { symbol: 'BINANCE:LINKUSDT', description: 'Chainlink / Tether', category: 'Crypto' },
  { symbol: 'BINANCE:ADAUSDT', description: 'Cardano / Tether', category: 'Crypto' },
  { symbol: 'BINANCE:MATICUSDT', description: 'Polygon / Tether', category: 'Crypto' },
  { symbol: 'BINANCE:LTCUSDT', description: 'Litecoin / Tether', category: 'Crypto' },

  // Forex
  { symbol: 'FX:EURUSD', description: 'Euro / US Dollar', category: 'Forex' },
  { symbol: 'FX:GBPUSD', description: 'Great British Pound / US Dollar', category: 'Forex' },
  { symbol: 'FX:USDJPY', description: 'US Dollar / Japanese Yen', category: 'Forex' },
  { symbol: 'FX:AUDUSD', description: 'Australian Dollar / US Dollar', category: 'Forex' },
  { symbol: 'FX:USDCAD', description: 'US Dollar / Canadian Dollar', category: 'Forex' },
  { symbol: 'FX:USDCHF', description: 'US Dollar / Swiss Franc', category: 'Forex' },
  { symbol: 'FX:NZDUSD', description: 'New Zealand Dollar / US Dollar', category: 'Forex' },
  { symbol: 'FX:EURJPY', description: 'Euro / Japanese Yen', category: 'Forex' },
  { symbol: 'FX:GBPJPY', description: 'Great British Pound / Japanese Yen', category: 'Forex' },
  { symbol: 'FX:EURGBP', description: 'Euro / Great British Pound', category: 'Forex' },
  { symbol: 'OANDA:XAUUSD', description: 'Gold / US Dollar', category: 'Forex' },
];

export const SELECTED_INSTRUMENTS = [
  // Narrowed universe for higher predictability and liquidity
  { symbol: 'BINANCE:BTCUSDT', description: 'Bitcoin / Tether', category: 'Crypto' },
  { symbol: 'FX:EURUSD', description: 'Euro / US Dollar', category: 'Forex' },
  { symbol: 'FX:GBPUSD', description: 'Great British Pound / US Dollar', category: 'Forex' },
];

export const SELECTED_METHODS = [
  // Strategy names must match signal.strategy from strategyService
  'ORB',
  'Trend Pullback',
  'VWAP Reversion',
];