# omni-variational

> **Paper trading grid bot** for [Variational Omni](https://variational.io) — uses the public read-only API for live prices and simulates grid trading logic in real time.

> ⚠️ This is a **simulation only**. Variational's Trading API is not yet publicly available. No real funds are used.

---

## What is a Grid Bot?

A grid bot divides a price range into evenly spaced levels. It automatically:

- **Buys** when price drops through a level
- **Sells** when price rises back through that level
- **Profits** from the price difference between each grid step

It works best in sideways / oscillating markets.

---

## Features

- **Live prices** — polls Variational's public API every 5 seconds
- **Paper trading** — full buy/sell simulation with virtual balance and P&L tracking
- **Two modes** to run the bot:
  - CLI mode — terminal dashboard with real-time stats
  - Web panel — browser-based control panel with charts, trade history, and config form
- **Configurable** — ticker, price range, grid count, order size, balance, poll interval
- **Rate-limit safe** — respects Variational's 10 req/10s limit

---

## Variational API

| | |
|---|---|
| Base URL | `https://omni-client-api.prod.ap-northeast-1.variational.io` |
| Endpoint | `GET /metadata/stats` |
| Auth | None (public) |
| Rate limit | 10 req/10s per IP, 1000 req/min global |

All prices are in **USDC**. Numeric values are returned as strings for decimal precision.

---

## Project Structure

```
omni-variational/
├── artifacts/
│   ├── api-server/          # Express 5 backend — hosts bot engine + REST API
│   │   └── src/
│   │       ├── lib/grid-bot-engine.ts   # Core grid bot logic
│   │       └── routes/bot.ts            # REST endpoints
│   └── grid-panel/          # React + Vite web dashboard
│       └── src/
│           ├── pages/Dashboard.tsx
│           ├── components/
│           │   ├── StatCard.tsx
│           │   ├── GridVisualizer.tsx
│           │   ├── TradeHistory.tsx
│           │   ├── BotInfoBar.tsx
│           │   └── ConfigModal.tsx
│           └── hooks/use-bot.ts
├── scripts/
│   └── src/grid-bot.ts      # Standalone CLI bot (no server needed)
├── lib/
│   ├── api-spec/openapi.yaml            # OpenAPI 3.1 contract
│   ├── api-client-react/                # Generated React Query hooks
│   └── api-zod/                         # Generated Zod validation schemas
└── pnpm-workspace.yaml
```

---

## Getting Started

### Requirements

- Node.js 24+
- pnpm 9+

### Install

```bash
git clone https://github.com/hokireceh/omni-variational
cd omni-variational
pnpm install
```

---

## Mode 1 — CLI Bot (Terminal)

Runs a standalone grid bot directly in your terminal with a live dashboard. No server or browser needed.

```bash
pnpm --filter @workspace/scripts run grid-bot
```

**Configure** by editing the `CONFIG` block at the top of `scripts/src/grid-bot.ts`:

```ts
const CONFIG = {
  ticker:          "BTC",
  gridLow:         70_000,   // lower price bound (USDC)
  gridHigh:        80_000,   // upper price bound (USDC)
  gridCount:       10,       // number of grid levels
  orderSizeUsdc:   100,      // USDC per order
  initialBalance:  5_000,    // starting paper balance
  pollIntervalMs:  5_000,    // poll interval in ms
};
```

Press `Ctrl+C` to stop. Final P&L summary is printed on exit.

**Terminal output:**

```
══════════════════════════════════════════════════════════════
  VARIATIONAL GRID BOT  [Paper Trading]  ✅ DALAM RANGE
══════════════════════════════════════════════════════════════
  Aset         : BTC
  Harga        : $73,950.24
  Range Grid   : $70,000 — $80,000
  Step         : $1,000 (10 level)
  Funding Rate : 6.86%
  Volume 24h   : $498.70M
──────────────────────────────────────────────────────────────
  Saldo USDC   : $4,800.00
  Posisi Buka  : 2 / 11 level
  Unrealized   : +$12.40
  Realized     : +$3.20
  Total P&L    : +$15.60
```

---

## Mode 2 — Web Panel

A full browser-based control panel. The bot runs inside the Express backend and exposes a REST API. The React frontend polls it every 3 seconds.

### Start the backend

```bash
pnpm --filter @workspace/api-server run dev
```

### Start the frontend

```bash
pnpm --filter @workspace/grid-panel run dev
```

Open `http://localhost:PORT` in your browser.

### Web Panel Features

| Feature | Description |
|---|---|
| START / STOP | Toggle the bot from the browser |
| Account Balance | Current virtual USDC balance |
| Realized P&L | Profit from closed positions |
| Unrealized P&L | Floating P&L from open positions |
| Total P&L | Realized + Unrealized |
| Grid Visualizer | Visual grid with open/closed level indicators |
| Trade History | Real-time log of all BUY/SELL fills |
| Bot Info Bar | Ticker, range, fills, funding rate, volume |
| Configure | Edit all bot parameters from a form |
| Reset | Clear trades and restore balance |

---

## REST API

Base path: `/api`

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/bot/status` | Full bot state + stats |
| `POST` | `/bot/start` | Start the grid bot |
| `POST` | `/bot/stop` | Stop the grid bot |
| `GET` | `/bot/config` | Get current configuration |
| `PATCH` | `/bot/config` | Update configuration (bot must be stopped) |
| `GET` | `/bot/trades?limit=50` | Trade history |
| `POST` | `/bot/reset` | Reset all state and restore balance |

Example:

```bash
# Start bot
curl -X POST http://localhost:8080/api/bot/start

# Check status
curl http://localhost:8080/api/bot/status | jq .

# Update config
curl -X PATCH http://localhost:8080/api/bot/config \
  -H "Content-Type: application/json" \
  -d '{"ticker":"ETH","gridLow":2000,"gridHigh":2500,"gridCount":10,"orderSizeUsdc":50,"initialBalance":5000,"pollIntervalMs":5000}'
```

---

## How Grid Trading Works

```
Price Range: $70,000 — $80,000
Grid Count:  10 levels
Grid Step:   $1,000

Level grid:
  $80,000  ← upper bound
  $79,000
  $78,000
  $77,000  ← price crosses DOWN → BUY @ $77,000
  $76,000
  ...
  $70,000  ← lower bound

Later, price crosses UP through $77,000 → SELL → profit = step spread
```

Each grid level acts as an independent buy/sell pair. The bot captures profit each time price oscillates through a level.

---

## Tip: Setting Your Grid Range

The bot only fills orders when price is **inside the configured range**. Check the current BTC/ETH price on Variational before configuring:

```bash
curl https://omni-client-api.prod.ap-northeast-1.variational.io/metadata/stats \
  | jq '.listings[] | select(.ticker=="BTC") | .mark_price'
```

Set `gridLow` and `gridHigh` around the current price, leaving some buffer above and below.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 24 |
| Language | TypeScript 5.9 |
| Package manager | pnpm workspaces |
| Backend | Express 5 |
| Frontend | React 19 + Vite 7 |
| Data fetching | TanStack React Query v5 |
| API contract | OpenAPI 3.1 + Orval codegen |
| Validation | Zod v4 |
| UI components | Radix UI + Tailwind CSS v4 |
| Animations | Framer Motion |

---

## Notes

- **Paper trading only** — no real funds, no real orders
- Variational Trading API is in development; [join the waitlist](https://variational.typeform.com/api-request) to be notified
- All numeric values from the API are strings (decimal precision) — the bot parses them with `parseFloat`
- Funding rates are returned as decimals — multiply by 100 for percentage

---

## License

MIT © Hokireceh
