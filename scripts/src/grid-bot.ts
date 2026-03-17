/**
 * Variational Grid Bot — Real Trading
 *
 * Auth: Sign-In with Ethereum (SIWE) via omni.variational.io
 * Transport: curl (bypass Cloudflare TLS fingerprinting)
 */

import { Wallet } from "ethers";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
const OMNI_URL = "https://omni.variational.io";

// ── KONFIGURASI ────────────────────────────────────────────────────────────
const CONFIG = {
  ticker: "BTC",
  gridLow: 80_000,
  gridHigh: 95_000,
  gridCount: 10,
  orderSizeUsdc: 10,
  pollIntervalMs: 5_000,
  chainId: 42161,
};

// ── CURL FETCH ─────────────────────────────────────────────────────────────
// Browser headers persis seperti yang dipakai Chromium/Brave di Windows
const BROWSER_HEADERS = [
  "accept: */*",
  "accept-encoding: gzip, deflate, br",
  "accept-language: en-US,en;q=0.8",
  "origin: https://omni.variational.io",
  "referer: https://omni.variational.io/perpetual/BTC",
  'sec-ch-ua: "Chromium";v="146", "Not-A.Brand";v="24", "Brave";v="146"',
  "sec-ch-ua-mobile: ?0",
  'sec-ch-ua-platform: "Windows"',
  "sec-fetch-dest: empty",
  "sec-fetch-mode: cors",
  "sec-fetch-site: same-origin",
  "sec-gpc: 1",
];

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36";

interface CurlResponse {
  status: number;
  body: string;
}

async function curlFetch(
  url: string,
  opts: {
    method?: string;
    body?: string;
    headers?: Record<string, string>;
    cookieStr?: string;
  } = {}
): Promise<CurlResponse> {
  const args: string[] = [
    "--silent",
    "--compressed",
    "--http2",
    "--tlsv1.2",
    "-w", "\n__STATUS__%{http_code}",
    "-A", USER_AGENT,
  ];

  for (const h of BROWSER_HEADERS) {
    args.push("-H", h);
  }

  if (opts.headers) {
    for (const [k, v] of Object.entries(opts.headers)) {
      args.push("-H", `${k}: ${v}`);
    }
  }

  if (opts.cookieStr) {
    args.push("-H", `cookie: ${opts.cookieStr}`);
  }

  if (opts.method && opts.method !== "GET") {
    args.push("-X", opts.method);
  }

  if (opts.body) {
    args.push("-H", "content-type: application/json");
    args.push("--data-raw", opts.body);
  }

  args.push(url);

  const { stdout } = await execFileAsync("curl", args, { maxBuffer: 10 * 1024 * 1024 });

  const marker = "\n__STATUS__";
  const idx = stdout.lastIndexOf(marker);
  if (idx === -1) throw new Error(`curl output unexpected: ${stdout.slice(0, 200)}`);

  const body = stdout.slice(0, idx);
  const status = parseInt(stdout.slice(idx + marker.length), 10);

  return { status, body };
}

// ── TIPE DATA ──────────────────────────────────────────────────────────────
interface GridLevel {
  price: number;
  isOpen: boolean;
  buyPrice: number;
  quantity: number;
  realizedPnl: number;
  tradeCount: number;
}

interface Position {
  underlying: string;
  qty: number;
  side: "long" | "short";
  avgEntryPrice: number;
  markPrice: number;
  upnl: number;
}

// ── AUTH ────────────────────────────────────────────────────────────────────
async function login(wallet: Wallet): Promise<{ token: string; address: string }> {
  const address = await wallet.getAddress();

  // Step 1: generate signing data
  const sigRes = await curlFetch(`${OMNI_URL}/api/auth/generate_signing_data`, {
    method: "POST",
    body: JSON.stringify({ address }),
    headers: { "vr-connected-address": address },
  });

  if (sigRes.status !== 200) {
    throw new Error(`generate_signing_data gagal: ${sigRes.status}\n${sigRes.body.slice(0, 300)}`);
  }

  const siweMessage = sigRes.body.trim();

  // Step 2: sign message
  const signature = await wallet.signMessage(siweMessage);

  // Step 3: login
  const loginRes = await curlFetch(`${OMNI_URL}/api/auth/login`, {
    method: "POST",
    body: JSON.stringify({ message: siweMessage, signature }),
    headers: { "vr-connected-address": address },
  });

  if (loginRes.status !== 200) {
    throw new Error(`Login gagal: ${loginRes.status}\n${loginRes.body.slice(0, 300)}`);
  }

  const data = JSON.parse(loginRes.body) as { token: string };
  return { token: data.token, address };
}

// ── API HELPERS ─────────────────────────────────────────────────────────────
function makeCookieStr(token: string, address: string) {
  return `vr-token=${token}; vr-connected-address=${address.toLowerCase()}`;
}

async function fetchPrice(
  token: string,
  address: string
): Promise<{ price: number; fundingRate: string; volume: string; fundingIntervalS: number } | null> {
  try {
    const res = await curlFetch(
      `${OMNI_URL}/api/metadata/supported_assets?cex_asset=${CONFIG.ticker}`,
      {
        headers: { "vr-connected-address": address },
        cookieStr: makeCookieStr(token, address),
      }
    );
    if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
    const data = JSON.parse(res.body) as Record<string, Array<{
      price: string;
      funding_rate: string;
      volume_24h: string;
      funding_interval_s: number;
    }>>;
    const assets = data[CONFIG.ticker];
    if (!assets?.length) throw new Error(`Ticker ${CONFIG.ticker} tidak ditemukan`);
    const a = assets[0];
    return {
      price: parseFloat(a.price),
      fundingRate: (parseFloat(a.funding_rate) * 100).toFixed(4) + "%",
      volume: "$" + (parseFloat(a.volume_24h) / 1_000_000).toFixed(2) + "M",
      fundingIntervalS: a.funding_interval_s,
    };
  } catch {
    return null;
  }
}

async function fetchPositions(token: string, address: string): Promise<Position[]> {
  try {
    const res = await curlFetch(`${OMNI_URL}/api/positions`, {
      headers: { "vr-connected-address": address },
      cookieStr: makeCookieStr(token, address),
    });
    if (res.status !== 200) return [];
    const data = JSON.parse(res.body) as Array<{
      position_info: {
        instrument: { underlying: string };
        qty: string;
        avg_entry_price: string;
      };
      price_info: { price: string };
      upnl: string;
    }>;
    return data.map((p) => {
      const qty = parseFloat(p.position_info.qty);
      return {
        underlying: p.position_info.instrument.underlying,
        qty: Math.abs(qty),
        side: qty >= 0 ? "long" : "short",
        avgEntryPrice: parseFloat(p.position_info.avg_entry_price),
        markPrice: parseFloat(p.price_info.price),
        upnl: parseFloat(p.upnl),
      };
    });
  } catch {
    return [];
  }
}

async function placeMarketOrder(
  token: string,
  address: string,
  side: "bid" | "ask",
  qty: number,
  fundingIntervalS: number
): Promise<boolean> {
  const instrument = {
    instrument_type: "perpetual_future",
    underlying: CONFIG.ticker,
    funding_interval_s: fundingIntervalS,
    settlement_asset: "USDC",
  };

  try {
    // Step 1: dapatkan quote
    const quoteRes = await curlFetch(`${OMNI_URL}/api/quotes/indicative`, {
      method: "POST",
      body: JSON.stringify({ instrument, side, qty: qty.toString() }),
      headers: { "vr-connected-address": address },
      cookieStr: makeCookieStr(token, address),
    });

    if (quoteRes.status !== 200) {
      process.stdout.write(`[ORDER] Quote gagal ${quoteRes.status}: ${quoteRes.body.slice(0, 200)}\n`);
      return false;
    }

    const quote = JSON.parse(quoteRes.body) as { quote_id: string };
    if (!quote.quote_id) {
      process.stdout.write(`[ORDER] quote_id kosong\n`);
      return false;
    }

    // Step 2: submit market order
    const orderRes = await curlFetch(`${OMNI_URL}/api/orders/new/market`, {
      method: "POST",
      body: JSON.stringify({
        rfq_id: quote.quote_id,
        take_profit_rfq_id: null,
        stop_loss_rfq_id: null,
      }),
      headers: { "vr-connected-address": address },
      cookieStr: makeCookieStr(token, address),
    });

    if (orderRes.status !== 200) {
      process.stdout.write(`[ORDER] Submit gagal ${orderRes.status}: ${orderRes.body.slice(0, 200)}\n`);
      return false;
    }

    return true;
  } catch (err) {
    process.stdout.write(`[ORDER] Error: ${err}\n`);
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
  private lastFundingIntervalS = 3600;
  private consecutiveErrors = 0;
  private positions: Position[] = [];

  constructor(
    private readonly token: string,
    private readonly address: string
  ) {
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

    for (const level of this.levels) {
      const lp = level.price;

      // Harga turun melewati level → BUY (bid)
      if (prev > lp && price <= lp && !level.isOpen) {
        const qty = CONFIG.orderSizeUsdc / lp;
        this.logRaw(`▼ BUY  ${qty.toFixed(6)} ${CONFIG.ticker} @ $${lp.toLocaleString()} → sending order...`);
        const ok = await placeMarketOrder(this.token, this.address, "bid", qty, this.lastFundingIntervalS);
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

      // Harga naik melewati level → SELL (ask)
      if (prev < lp && price >= lp && level.isOpen) {
        const qty = level.quantity;
        const pnl = qty * (lp - level.buyPrice);
        this.logRaw(`▲ SELL ${qty.toFixed(6)} ${CONFIG.ticker} @ $${lp.toLocaleString()} | est. PnL: ${pnl >= 0 ? "+" : ""}$${pnl.toFixed(4)} → sending order...`);
        const ok = await placeMarketOrder(this.token, this.address, "ask", qty, this.lastFundingIntervalS);
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

    this.prevPrice = price;
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
    const W = 64;
    const line = "═".repeat(W);
    const dash = "─".repeat(W);
    const now = new Date().toISOString().replace("T", " ").slice(0, 19);

    const realUpnl = this.positions
      .filter((p) => p.underlying === CONFIG.ticker)
      .reduce((sum, p) => sum + p.upnl, 0);

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
    console.log(`  Realized     : ${this.totalRealizedPnl >= 0 ? "+" : ""}$${this.totalRealizedPnl.toFixed(4)}`);
    console.log(dash);
    console.log(`  Uptime       : ${uptimeStr}`);
    console.log(`  API Calls    : ${this.fetchCount}`);
    console.log(`  Total Fill   : ${this.fillCount}`);
    console.log(`  Update       : tiap ${CONFIG.pollIntervalMs / 1000}s`);
    console.log(`  Waktu        : ${now} UTC`);
    console.log(line);

    console.log("\n  LEVEL GRID (5 terdekat dengan harga):");
    const sorted = [...this.levels]
      .sort((a, b) => Math.abs(a.price - price) - Math.abs(b.price - price))
      .slice(0, 5);

    for (const l of sorted) {
      const dot = l.isOpen ? "●" : "○";
      const arrow = l.price > price ? "▲" : "▼";
      const diff = (((l.price - price) / price) * 100).toFixed(2);
      const openStr = l.isOpen ? ` [OPEN @ $${l.buyPrice.toLocaleString()}]` : "";
      const pnlStr =
        l.realizedPnl !== 0
          ? ` | realized: ${l.realizedPnl >= 0 ? "+" : ""}$${l.realizedPnl.toFixed(4)}`
          : "";
      console.log(
        `  ${dot} $${String(l.price.toLocaleString()).padEnd(10)} ${arrow} ${diff.padStart(6)}%${openStr}${pnlStr}`
      );
    }

    const relevantPos = this.positions.filter((p) => p.underlying === CONFIG.ticker);
    if (relevantPos.length > 0) {
      console.log(`\n  POSISI REAL (${CONFIG.ticker}):`);
      for (const p of relevantPos) {
        console.log(
          `    ${p.side.toUpperCase()} ${p.qty.toFixed(6)} | entry: $${p.avgEntryPrice.toFixed(2)} | mark: $${p.markPrice.toFixed(2)} | uPnL: ${p.upnl >= 0 ? "+" : ""}$${p.upnl.toFixed(4)}`
        );
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
    console.log("  VARIATIONAL GRID BOT — Real Trading (curl transport)");
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
        this.lastFundingIntervalS = result.fundingIntervalS;
        this.consecutiveErrors = 0;
        await this.processPrice(result.price);
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
  const vrToken = process.env["VR_TOKEN"];

  if (!privateKey) {
    console.error("ERROR: WALLET_PRIVATE_KEY tidak diset di environment secrets.");
    process.exit(1);
  }

  const wallet = new Wallet(privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`);
  const address = await wallet.getAddress();

  console.log(`Wallet   : ${address}`);
  console.log(`Transport: curl (browser headers + TLS)`);

  let token: string;

  // Mode 1: pakai VR_TOKEN langsung dari env (bypass Cloudflare CF challenge)
  if (vrToken) {
    token = vrToken;
    console.log("✅ VR_TOKEN dari env digunakan (skip SIWE login)\n");
  } else {
    // Mode 2: SIWE login (mungkin diblok Cloudflare managed challenge)
    console.log("Login via SIWE...\n");
    try {
      const result = await login(wallet);
      token = result.token;
      console.log("✅ Login berhasil!\n");
    } catch (err) {
      console.error(`❌ Login gagal (Cloudflare block): ${err}`);
      console.error("");
      console.error("  → Solusi: set secret VR_TOKEN dengan nilai cookie 'vr-token'");
      console.error("    dari browser kamu di omni.variational.io");
      console.error("    (DevTools → Application → Cookies → vr-token)");
      process.exit(1);
    }
  }

  const bot = new GridBot(token, address);
  await bot.start();
}

main().catch((err) => {
  console.error("Bot crash:", err);
  process.exit(1);
});
