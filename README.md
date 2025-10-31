<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Paper Trader

Note: This repository is the single app. The previous root app has been removed; use this repo for all commands, UI, and the scheduler.

Run this app locally and scan a narrow set of liquid markets using deterministic strategy rules, while a lightweight LLM provides summaries and failure explanations.

View your app in AI Studio: https://ai.studio/apps/drive/12Ze_JeS3qVf6P5v0sZZ0eh-0AZ73ZOwB

## Run Locally

Prerequisites: Node.js

1. Install dependencies: `npm install`
2. Create `.env.local` with:
   - `VITE_API_KEY=<your-google-ai-studio-key>`
   - Optional: `VITE_LLM_PROVIDER=gemini` (default)
   - Firebase (required):
     - `VITE_FIREBASE_API_KEY=<your-firebase-api-key>`
     - `VITE_FIREBASE_AUTH_DOMAIN=<your-project>.firebaseapp.com`
     - `VITE_FIREBASE_PROJECT_ID=<your-project-id>`
     - Optional: `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`
3. Start dev server: `npm run dev`

Example `.env.local`:
```
VITE_API_KEY=...
VITE_LLM_PROVIDER=gemini

VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

## Selections (for profit focus)

- Instruments: `BINANCE:BTCUSDT`, `BINANCE:ETHUSDT`, `FX:EURUSD`, `FX:GBPUSD`
- Methods: `Opening-Range Breakout (ORB)`, `Trend Pullback / Break-and-Retest`, `VWAP Reversion`
- Rationale:
  - ORB captures session impulse moves (London/NY overlap; US peak crypto).
  - Trend Pullback targets clean continuation with defined retest risk.
  - VWAP Reversion monetizes midday mean-reversion on liquid instruments.

## Scanner Behavior

- Scans only selected instruments during optimal hours.
  - Forex: UTC 12–20 (London/NY overlap)
  - Crypto: UTC 13–22 (US peak volume)
- Uses `geminiService` to request AI trade actions; all qualifying opportunities are shown, and when autopilot is enabled the scheduler executes them without ranking.
- Deterministic entries/stops/take-profits live in services and strategies; LLM is UX-only.

## LLM Architecture

- `services/geminiService.ts` implements:
  - `generateExplanationText` (Gemini 2.5 Flash)
  - `generateFailureAnalysis` (Gemini 2.5 Pro)
  - `getAiTradeAction` (Gemini 2.5 Flash)
- Swap providers later by setting `VITE_LLM_PROVIDER`.

## Why this setup

- Narrow scope improves signal quality and expectancy.
- Three complementary methods cover impulse, continuation, and mean-reversion regimes.
- Cheap LLM handles narration and post-mortems; it does not choose entries/stops/targets.

## Next Steps

- Add backtest harness for the three methods on the two instruments.
- Enforce risk limits (per-trade GBP risk, daily loss cap, slippage filters).
- Log metrics per instrument/session (win rate, R, expectancy, drawdown).

## OANDA Demo Trading (Practice)

Enable autopilot trades to route to an OANDA Practice account using env flags:

1. Create `.env.local` entries:

```
AUTOPILOT_ENABLED=1
AUTOPILOT_BROKER=oanda
OANDA_ENV=practice
OANDA_API_TOKEN=<your-oanda-practice-token>
OANDA_ACCOUNT_ID=<your-oanda-practice-account-id>

# Optional tuning
AUTOPILOT_RISK_GBP=5
AUTOPILOT_ACCOUNT_GBP=250
AUTOPILOT_RISK_PCT=0.02
```

2. Start the scheduler via the dev server; when qualifying signals are found, orders are sent as OANDA market orders with `stopLossOnFill` and `takeProfitOnFill` populated. If env flags are missing or an error occurs, the system falls back to simulated fills.

Notes:
- Symbols are mapped automatically (e.g., `OANDA:XAUUSD` → `XAU_USD`, `FX:EURUSD` → `EUR_USD`).
- Units use the app’s lot-based sizing; long = positive units, short = negative.
- Closing via the admin price check will attempt to close the OANDA trade if it was broker-backed.
