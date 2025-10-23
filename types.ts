
export enum Side {
  LONG = "LONG",
  SHORT = "SHORT",
}

export enum StopLogic {
  ATR = "ATR",
  SWING = "SWING",
}

export enum PositionStatus {
  OPEN = "open",
  CLOSED = "closed",
}

export interface Strategy {
  id: string;
  name: string;
  symbol: string;
  timeframe: string;
  risk_per_trade_gbp: number;
  stop_logic: StopLogic;
  atr_mult: number;
  take_profit_R: number;
  slippage_bps: number;
  fee_bps: number;
  enabled: boolean;
}

export interface Signal {
  id: string;
  ts: string; // ISO
  symbol: string;
  side: Side;
  bar_time: number; // ms
  price_tv: number;
  atr: number;
  strategy_id: string;
  raw_payload: string; // JSON string
}

export interface Position {
  id: string;
  status: PositionStatus;
  side: Side;
  symbol: string;
  entry_ts: string; // ISO
  entry_price: number;
  qty: number;
  stop_price: number;
  tp_price: number;
  exit_ts: string | null; // ISO
  exit_price: number | null;
  pnl_gbp: number | null;
  R_multiple: number | null;
  strategy_id: string;
  signal_id: string;
  slippage_bps: number;
  fee_bps: number;
  method_name?: string;
}

export interface Explanation {
  id: string; // Added to align with Firestore document IDs
  position_id: string;
  plain_english_entry: string;
  exit_reason: string | null;
  failure_analysis?: string | null;
  review_notes?: string;
  tags?: string[];
}

export enum LedgerRefType {
    ENTRY = "entry",
    EXIT = "exit",
    FEE = "fee",
}

export interface LedgerEntry {
    id: string;
    ts: string; // ISO
    delta_gbp: number;
    cash_after: number;
    ref_type: LedgerRefType;
    ref_id: string; // position id
}

export interface TradingViewPayload {
    signal: "LONG" | "SHORT";
    symbol: string;
    bar_time: number;
    close: number;
    atr: number;
}

export interface AiTradeAction {
    action: "TRADE" | "HOLD";
    trade?: {
        side: Side;
        entry_price: number;
        stop_price: number;
        tp_price: number;
        reason: string;
        strategy_type: string;
        slippage_bps: number;
        fee_bps: number;
        risk_reward_ratio: number;
        suggested_timeframe: string;
    };
    hold_reason?: string;
}

// For Market Scanner results
export interface Opportunity {
  symbol: string;
  action: AiTradeAction;
}

export interface RankedOpportunity {
  rank: number;
  symbol: string;
  justification: string;
  opportunity: Opportunity;
}

export interface SchedulerActivity {
  id?: string;
  last_run_ts: number;
  window: 'forex' | 'crypto' | 'none';
  ops_found: number;
  trades_placed: number;
  universe_symbols: string[];
  messages?: string[];
}