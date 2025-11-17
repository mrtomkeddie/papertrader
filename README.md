<div align="center">
  <img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Paper Trader

Single app lives in `repo/`. Root `package.json` proxies all commands to `repo/`. Canonical docs live here; `repo/README.md` is a pointer to this file.

View in AI Studio: https://ai.studio/apps/drive/12Ze_JeS3qVf6P5v0sZZ0eh-0AZ73ZOwB

## Quick Start

- Prerequisites: Node.js 18+ and npm 9+
- Install dependencies: `npm install` (runs `postinstall` to install in `repo/`)
- Create env file: `repo/.env.local` with the required keys
- Run dev server: `npm run dev`
- Build: `npm run build`
- Preview build: `npm run preview`
- Scheduler: `npm run scheduler`

## Current Live Setup

- Active strategies only:
  - `Fixed ORB + FVG + LVN (Gold)` → `fixed-xau`
  - `Fixed ORB + FVG + LVN (NAS100)` → `fixed-nas`
- Scheduler runs only these two bots during the NY Opening Range window:
  - NY cash open + 15 minutes (OR completes) → +3 hours
  - Monday–Friday, DST-aware
- Risk, partials, ATR trailing, and spread/news filters are enforced server-side in `tradingServiceAdmin`.

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

### How to Run in Paper Mode vs Live OANDA

Paper Mode (simulated orders, no broker integration):

```
# Enable scheduler trades
AUTOPILOT_ENABLED=1

# Broker disabled (omit or set to none)
# AUTOPILOT_BROKER=none

# Optional tuning
AUTOPILOT_RISK_GBP=5
AUTOPILOT_ACCOUNT_GBP=250
AUTOPILOT_RISK_PCT=0.02
AUTOPILOT_SCHEDULER_SCAN_MINUTES=2
AUTOPILOT_BLOCK_DUPLICATE_SYMBOL_SIDE=true
```

Live OANDA Mode (real orders via OANDA):

```
# Enable scheduler trades and OANDA broker
AUTOPILOT_ENABLED=1
AUTOPILOT_BROKER=oanda

# OANDA live credentials
OANDA_ENV=live
OANDA_API_TOKEN=...
OANDA_ACCOUNT_ID=...

# Optional tuning
AUTOPILOT_RISK_GBP=5
AUTOPILOT_ACCOUNT_GBP=250
AUTOPILOT_RISK_PCT=0.02
AUTOPILOT_SCHEDULER_SCAN_MINUTES=2
AUTOPILOT_BLOCK_DUPLICATE_SYMBOL_SIDE=true
SPREAD_FILTER_MULT=1.2
```

Notes:
- Many flags accept either `VITE_...` or non-`VITE_...` forms; the app reads both.
- Restart the dev server after changing `.env.local`.

## Behavior (Fixed-Only)

- Universe: `OANDA:XAUUSD`, `OANDA:NAS100_USD` only.
- Strategies: fixed ORB + FVG + LVN logic with deterministic entries/stops/targets.
- Window gating: trades only considered after NY OR completes (+15m) until +3h, Mon–Fri (DST-aware).
- Server-side execution enforces:
  - Volatility guard (ATR% of price) and optional risk scaling
  - Spread filter relative to recent average (OANDA)
  - High-impact USD news lock (±15m)
  - Duplicate symbol/side blocking and optional daily caps
  - Close-only protection stages (break-even, lock, ATR trail)

## Development

- Root scripts proxy to `repo/` via `npm --prefix repo ...`.
- Dev server URL appears in the terminal (typically `http://localhost:5174/`).
- App code, server scripts, and assets live under `repo/`.
