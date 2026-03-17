/**
 * Variational Grid Bot — Real Trading
 *
 * Auth: Sign-In with Ethereum (SIWE) via omni.variational.io
 * Trading: POST /api/orders/new/market (real orders)
 *
 * Cara kerja:
 *   - Login dulu pakai wallet (WALLET_PRIVATE_KEY)
 *   - Ambil harga real-time dari /api/metadata/supported_assets
 *   - Eksekusi BUY/SELL market order saat harga melewati level grid
 */

import { Wallet } from "ethers";

const OMNI_URL = "https://omni.variational.io";

// ── KONFIGURASI ────────────────────────────────────────────────────────────
const CONFIG = {
  ticker: "BTC",
  gridLow: 80_000,
  gridHigh: 95_000,
  gridCount: 10,
  orderSizeUsdc: 10,    // USDC per grid level (nominal trade)
  pollIntervalMs: 5_000,
  chainId: 42161,       // Arbitrum One
};

// ── TIPE DATA ──────────────────────────────────────────────────────────────
interface GridLevel {
  price: number;
  isOpen: boolean;
  buyPrice: number;
  quantity: number;
  realizedPnl: number;
  tradeCount: number;
}

interface SupportedAsset {
  asset: string;
  price: string;
  funding_rate: string;
  volume_24h: string;
  index_price: string;
}

interface Position {
  position_info: {
    instrument: { underlying: string; instrument_type: string };
    qty: string;
    avg_entry_price: string;
  };
  upnl: string;
  value: string;
}

// ── AUTH ────────────────────────────────────────────────────────────────────
async function login(wallet: Wallet): Promise<string> {
  const address = await wallet.getAddress();

  // Step 1: generate signing data
  const sigRes = await fetch(`${OMNI_URL}/api/auth/generate_signing_data`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "vr-connected-address": address,
    },
    body: JSON.stringify({ address }),
  });

  if (!sigRes.ok) {
    throw new Error(`generate_signing_data gagal: ${sigRes.status} ${await sigRes.text()}`);
  }

  const message = await sigRes.text();

  // Step 2: sign message
  const signature = await wallet.signMessage(message);

  // Step 3: login
  const loginRes = await fetch(`${OMNI_URL}/api/auth/login`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "vr-connected-address": address,
    },
    body: JSON.stringify({ message, signature }),
  });

  if (!loginRes.ok) {
    throw new Error(`Login gagal: ${loginRes.status} ${await loginRes.text()}`);
  }

  const data = await loginRes.json() as { token: string };
  return data.token;
}

// ── API CLIENT ──────────────────────────────────────────────────────────────
function makeHeaders(token: string, address: string) {
  return {
    "content-type": "application/json",
    "accept": "application/json",
    "cookie": `vr-token=${token}; vr-connected-address=${address.toLowerCase()}`,
    "vr-connected-address": address,
  };
}

async function fetchPrice(token: string, address: string): Promise<{
  price: number;
  fundingRate: string;
  volume: string;
} | null> {
  try {
    const res = await fetch(
      `${OMNI_URL}/api/metadata/supported_assets?cex_asset=${CONFIG.ticker}`,
      {
        headers: makeHeaders(token, address),
        signal: AbortSignal.timeout(8_000),
      }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as Record<string, SupportedAsset[]>;
    const assets = data[CONFIG.ticker];
    if (!assets?.length) throw new Error(`Ticker ${CONFIG.ticker} tidak ditemukan`);
    const a = assets[0];
    return {
      price: parseFloat(a.price),
      fundingRate: (parseFloat(a.funding_rate) * 100).toFixed(4) + "%",
      volume: "$" + (parseFloat(a.volume_24h) / 1_000_000).toFixed(2) + "M",
    };
  } catch (err) {
    return null;
  }
}

async function fetchPositions(token: string, address: string): Promise<Position[]> {
  try {
    const res = await fetch(`${OMNI_URL}/api/positions`, {
      headers: makeHeaders(token, address),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return [];
    return await res.json() as Position[];
  } catch {
    return [];
  }
}

async function placeMarketOrder(
  token: string,
  address: string,
  side: "buy" | "sell",
  qty: number
): Promise<boolean> {
  try {
    const instrument = {
      instrument_type: "perpetual_future",
      underlying: CONFIG.ticker,
      funding_interval_s: 3600,
      settlement_asset: "USDC",
    };

    const body = {
      instrument,
      side,
      qty: qty.toFixed(8),
    };

    const res = await fetch(`${OMNI_URL}/api/orders/new/market`, {
      method: "POST",
      headers: makeHeaders(token, address),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const errText = await res.text();
      process.stdout.write(`[ORDER ERROR] ${res.status}: ${errText}\n`);
      return false;
    }

    return true;
  } catch (err) {
    process.stdout.write(`[ORDER ERROR] ${err}\n`);
    return false;
  }
}

// ── GRID BOT ───────────────────────────────────────────────────────────────
class GridBot {
  private levels: GridLevel[] = [];
  private prevPrice: number | null = null;
  private readonly step: number;

  private fetchCount = 0;
  private fillCount = 0;
  private readonly startTime = new Date();
  private lastFundingRate = "—";
  private lastVolume24h = "—";
  private consecutiveErrors = 0;
  private positions: Position[] = [];

  private token: string;
  private address: string;

  constructor(token: string, address: string) {
    this.token = token;
    this.address = address;
    this.step = (CONFIG.gridHigh - CONFIG.gridLow) / CONFIG.gridCount;
    this.initGrid();
  }

  private initGrid() {
    for (let i = 0; i <= CONFIG.gridCount; i++) {
      this.levels.push({
        price: Math.round(CONFIG.gridLow + i * this.step),
        isOpen: false,
        buyPrice: 0,
        quantity: 0,
        realizedPnl: 0,
        tradeCount: 0,
      });
    }
  }

  private async processPrice(price: number) {
    if (this.prevPrice === null) {
      this.prevPrice = price;
      return;
    }

    const prev = this.prevPrice;
    const curr = price;

    for (const level of this.levels) {
      const lp = level.price;

      // Harga turun melewati level → BUY
      if (prev > lp && curr <= lp && !level.isOpen) {
        const qty = CONFIG.orderSizeUsdc / lp;
        this.logRaw(`▼ BUY  ${CONFIG.ticker} ${qty.toFixed(6)} @ $${lp.toLocaleString()} — sending market order...`);
        const ok = await placeMarketOrder(this.token, this.address, "buy", qty);
        if (ok) {
          level.isOpen = true;
          level.buyPrice = lp;
          level.quantity = qty;
          level.tradeCount++;
          this.fillCount++;
          this.logRaw(`  ✅ BUY filled`);
        } else {
          this.logRaw(`  ❌ BUY gagal`);
        }
      }

      // Harga naik melewati level → SELL
      if (prev < lp && curr >= lp && level.isOpen) {
        const qty = level.quantity;
        const pnl = qty * (lp - level.buyPrice);
        this.logRaw(`▲ SELL ${CONFIG.ticker} ${qty.toFixed(6)} @ $${lp.toLocaleString()} | est. PnL: ${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)} — sending market order...`);
        const ok = await placeMarketOrder(this.token, this.address, "sell", qty);
        if (ok) {
          level.realizedPnl += pnl;
          level.isOpen = false;
          level.tradeCount++;
          this.fillCount++;
          this.logRaw(`  ✅ SELL filled`);
        } else {
          this.logRaw(`  ❌ SELL gagal`);
        }
      }
    }

    this.prevPrice = curr;
  }

  private get totalRealizedPnl() {
    return this.levels.reduce((s, l) => s + l.realizedPnl, 0);
  }

  private get openPositionCount() {
    return this.levels.filter((l) => l.isOpen).length;
  }

  private displayDashboard(price: number) {
    const uptime = Math.floor((Date.now() - this.startTime.getTime()) / 1000);
    const h = Math.floor(uptime / 3600);
    const m = Math.floor((uptime % 3600) / 60);
    const s = uptime % 60;
    const uptimeStr = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;

    const inRange = price >= CONFIG.gridLow && price <= CONFIG.gridHigh;
    const rangeStatus = inRange ? "✅ DALAM RANGE" : "⚠️  DI LUAR RANGE";
    const totalPnl = this.totalRealizedPnl;

    const W = 64;
    const line = "═".repeat(W);
    const dash = "─".repeat(W);
    const now = new Date().toISOString().replace("T", " ").slice(0, 19);

    // Hitung total uPnL dari posisi real
    const realUpnl = this.positions
      .filter(p => p.position_info.instrument.underlying === CONFIG.ticker)
      .reduce((sum, p) => sum + parseFloat(p.upnl), 0);

    console.clear();
    console.log(line);
    console.log(`  VARIATIONAL GRID BOT  [REAL TRADING]  ${rangeStatus}`);
    console.log(line);
    console.log(`  Aset         : ${CONFIG.ticker}`);
    console.log(`  Harga        : $${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    console.log(`  Range Grid   : $${CONFIG.gridLow.toLocaleString()} — $${CONFIG.gridHigh.toLocaleString()}`);
    console.log(`  Step         : $${this.step.toLocaleString()} (${CONFIG.gridCount} level)`);
    console.log(`  Funding Rate : ${this.lastFundingRate}`);
    console.log(`  Volume 24h   : ${this.lastVolume24h}`);
    console.log(dash);
    console.log(`  Wallet       : ${this.address.slice(0, 10)}...${this.address.slice(-6)}`);
    console.log(`  Grid Orders  : ${this.openPositionCount} posisi terbuka`);
    console.log(`  uPnL (real)  : ${realUpnl >= 0 ? "+" : ""}$${realUpnl.toFixed(4)}`);
    console.log(`  Realized     : ${totalPnl >= 0 ? "+" : ""}$${totalPnl.toFixed(4)}`);
    console.log(dash);
    console.log(`  Uptime       : ${uptimeStr}`);
    console.log(`  API Calls    : ${this.fetchCount}`);
    console.log(`  Total Fill   : ${this.fillCount}`);
    console.log(`  Update       : tiap ${CONFIG.pollIntervalMs / 1000}s`);
    console.log(`  Waktu        : ${now} UTC`);
    console.log(line);

    // Level grid terdekat
    console.log("\n  LEVEL GRID (5 terdekat dengan harga):");
    const sorted = [...this.levels]
      .sort((a, b) => Math.abs(a.price - price) - Math.abs(b.price - price))
      .slice(0, 5);

    for (const l of sorted) {
      const dot = l.isOpen ? "●" : "○";
      const arrow = l.price > price ? "▲" : "▼";
      const diff = ((l.price - price) / price * 100).toFixed(2);
      const openStr = l.isOpen ? ` [OPEN @ $${l.buyPrice.toLocaleString()}]` : "";
      const pnlStr = l.realizedPnl !== 0 ? ` | realized: ${l.realizedPnl >= 0 ? "+" : ""}$${l.realizedPnl.toFixed(2)}` : "";
      console.log(`  ${dot} $${String(l.price.toLocaleString()).padEnd(10)} ${arrow} ${diff.padStart(6)}%${openStr}${pnlStr}`);
    }

    // Posisi real dari exchange
    const relevantPos = this.positions.filter(
      p => p.position_info.instrument.underlying === CONFIG.ticker
    );
    if (relevantPos.length > 0) {
      console.log(`\n  POSISI REAL (${CONFIG.ticker}):`);
      for (const p of relevantPos) {
        const qty = parseFloat(p.position_info.qty);
        const entry = parseFloat(p.position_info.avg_entry_price);
        const upnl = parseFloat(p.upnl);
        console.log(`    qty: ${qty.toFixed(6)} | entry: $${entry.toFixed(2)} | uPnL: ${upnl >= 0 ? "+" : ""}$${upnl.toFixed(4)}`);
      }
    }

    if (this.consecutiveErrors > 0) {
      console.log(`\n  ⚠️  Error berturut-turut: ${this.consecutiveErrors}`);
    }

    console.log("\n  Tekan Ctrl+C untuk berhenti\n");
  }

  private logRaw(msg: string) {
    const ts = new Date().toISOString().replace("T", " ").slice(0, 19);
    process.stdout.write(`[${ts}] ${msg}\n`);
  }

  async start() {
    const W = 64;
    console.log("═".repeat(W));
    console.log("  VARIATIONAL GRID BOT — Real Trading Mode");
    console.log("═".repeat(W));
    console.log(`  Wallet  : ${this.address}`);
    console.log(`  Ticker  : ${CONFIG.ticker}`);
    console.log(`  Range   : $${CONFIG.gridLow.toLocaleString()} — $${CONFIG.gridHigh.toLocaleString()}`);
    console.log(`  Levels  : ${CONFIG.gridCount} @ $${this.step.toLocaleString()} per level`);
    console.log(`  Order   : $${CONFIG.orderSizeUsdc} USDC per level`);
    console.log("─".repeat(W));
    console.log("  ⚠️  REAL TRADING — Order akan tereksekusi ke exchange!");
    console.log("─".repeat(W) + "\n");

    const tick = async () => {
      this.fetchCount++;
      const result = await fetchPrice(this.token, this.address);

      if (result) {
        this.lastFundingRate = result.fundingRate;
        this.lastVolume24h = result.volume;
        this.consecutiveErrors = 0;
        await this.processPrice(result.price);
        // Fetch posisi tiap 3 tick
        if (this.fetchCount % 3 === 0) {
          this.positions = await fetchPositions(this.token, this.address);
        }
        this.displayDashboard(result.price);
      } else {
        this.consecutiveErrors++;
        this.logRaw(`[ERROR #${this.consecutiveErrors}] Gagal fetch harga`);
      }
    };

    await tick();
    const interval = setInterval(tick, CONFIG.pollIntervalMs);

    process.on("SIGINT", () => {
      clearInterval(interval);
      console.log("\n\n  Bot dihentikan.");
      console.log(`    Realized P&L : ${this.totalRealizedPnl >= 0 ? "+" : ""}$${this.totalRealizedPnl.toFixed(4)}`);
      console.log(`    Total Fills  : ${this.fillCount}`);
      console.log(`    API Calls    : ${this.fetchCount}\n`);
      process.exit(0);
    });
  }
}

// ── ENTRY POINT ────────────────────────────────────────────────────────────
async function main() {
  const privateKey = process.env["WALLET_PRIVATE_KEY"];
  if (!privateKey) {
    console.error("ERROR: WALLET_PRIVATE_KEY tidak diset di environment secrets.");
    process.exit(1);
  }

  const wallet = new Wallet(privateKey);
  const address = await wallet.getAddress();

  console.log(`Wallet: ${address}`);
  console.log("Login ke Variational...");

  let token: string;
  try {
    token = await login(wallet);
    console.log("Login berhasil!\n");
  } catch (err) {
    console.error(`Login gagal: ${err}`);
    process.exit(1);
  }

  const bot = new GridBot(token, address);
  await bot.start();
}

main().catch((err) => {
  console.error("Bot crash:", err);
  process.exit(1);
});
