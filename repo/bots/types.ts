export interface Bot {
  id: string;
  isEnabled(): boolean;
  isWindowOpen(now: Date): boolean;
  scan(): Promise<import('../types').StrategySignal[]>;
  selectSignals(candidates: import('../types').StrategySignal[]): NonNullable<import('../types').AiTradeAction['trade'][]>;
  diagnostics?: () => string[];
}