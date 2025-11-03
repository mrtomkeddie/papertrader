<div align="center">
  <img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Paper Trader

Single app lives in `repo/`. The old root app has been removed — use the `repo/` app for UI, build, and scheduler. Root `package.json` simply proxies all commands to `repo/`.

View in AI Studio: https://ai.studio/apps/drive/12Ze_JeS3qVf6P5v0sZZ0eh-0AZ73ZOwB

## Quick Start

- Prerequisites: Node.js 18+ and npm 9+
- Install dependencies: `npm install` (runs `postinstall` to install in `repo/`)
- Create env file: `repo/.env.local` with the required keys
- Run dev server: `npm run dev` (proxies to `repo/`)
- Build: `npm run build` (outputs to `repo/dist`)
- Preview build: `npm run preview`
- Scheduler: `npm run scheduler`

## Environment Variables (`repo/.env.local`)

Minimum for UI + Firebase:

```
# UI / LLM
VITE_API_KEY=your-google-ai-studio-key
VITE_LLM_PROVIDER=gemini

# Firebase
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
# Optional Firebase
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_VAPID_KEY=...  # for web push notifications
```

Optional autopilot + broker (OANDA practice example):

```
# Enable scheduler trades
AUTOPILOT_ENABLED=1
AUTOPILOT_BROKER=oanda

# OANDA practice
OANDA_ENV=practice
OANDA_API_TOKEN=...
OANDA_ACCOUNT_ID=...

# Risk tuning (optional)
AUTOPILOT_RISK_GBP=5
AUTOPILOT_ACCOUNT_GBP=250
AUTOPILOT_RISK_PCT=0.02
```

Notes:
- Many flags accept either `VITE_...` or non-`VITE_...` forms; the app reads both for convenience.
- Restart the dev server after changing `.env.local`.

## Development

- Root scripts proxy to `repo/` via `npm --prefix repo ...`.
- Dev server URL appears in the terminal (typically `http://localhost:5174/`).
- App code, server scripts, and assets live under `repo/`.

## Project Overview

This app scans a narrow set of liquid markets using deterministic strategy rules and provides human-readable summaries and failure explanations. Strategies cover impulse (ORB), continuation (Trend Pullback), and mean reversion (VWAP Reversion). The LLM narrates only — entries, stops, and targets are rule-based.

## Scanner Behavior
- Scans selected instruments during optimal hours.
- Forex: UTC 12–20 (London/NY overlap)
- Crypto: UTC 13–22 (US peak volume)
- Scan cadence: every 2 minutes during the open window.
- Deterministic entries/stops/take-profits live in services and strategies; LLM is UX-only.

## Autopilot Scheduler Rules
- Minimum risk-reward (RR): `1.0`.
- Volatility clamp (ATR% of price):
  - Gold (`XAUUSD`): `0.15%–1.4%`
  - Other instruments: `0.2%–1.2%`
- ORB minimum opening range size: `0.10%` of price.
- ORB and Trend Pullback strategies run concurrently across `12:00–20:00 UTC`.
- Daily trade cap: `2` AI-generated trades per UTC day.
- Skip logging includes reasons for: window closed, ATR clamp, RR below minimum, too-small opening range, duplicates, and concurrency on the same candle.

## Concurrency Controls
- `AUTOPILOT_SINGLE_POSITION=true` (or `VITE_AUTOPILOT_SINGLE_POSITION=true`)
  - Enforces a single open position at a time across the account.
  - New trades are rejected if any position is currently open.
- `AUTOPILOT_BLOCK_DUPLICATE_SYMBOL_SIDE=true` (or `VITE_AUTOPILOT_BLOCK_DUPLICATE_SYMBOL_SIDE=true`)
  - Blocks opening a new position that matches an existing open position’s `symbol` and `side`.
  - Allows multiple positions overall but prevents duplicates on the same instrument and direction.

Canonical docs live here; `repo/README.md` is a lightweight pointer to this file.
