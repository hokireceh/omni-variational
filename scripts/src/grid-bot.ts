/**
 * Variational Grid Bot — Paper Trading Simulation
 *
 * Menggunakan Read-Only API Variational untuk harga real-time.
 * Trading API belum tersedia → ini adalah simulasi (paper trading).
 *
 * Cara kerja grid bot:
 *   - Bagi rentang harga [LOW, HIGH] jadi N level
 *   - Tiap level punya order BUY (kalau harga turun melewati level) dan
 *     SELL (kalau harga naik melewati level)
 *   - Profit dari selisih harga antar grid
 */

const BASE_URL =
  "https://omni-client-api.prod.ap-northeast-1.variational.io";

// ── KONFIGURASI ────────────────────────────────────────────────────────────
const CONFIG = {
  ticker: "BTC",         // Ticker aset (harus terdaftar di Variational)
  gridLow: 85_000,       // Batas bawah rentang harga (USDC)
  gridHigh: 100_000,     // Batas atas rentang harga (USDC)
  gridCount: 10,         // Jumlah level grid
  orderSizeUsdc: 100,    // Ukuran order tiap level (USDC)
  initialBalance: 5_000, // Saldo awal paper trading (USDC)
  pollIntervalMs: 5_000, // Interval cek harga (ms) — maks 10 req/10s
};

// ── TIPE DATA ──────────────────────────────────────────────────────────────
interface GridLevel {
  price: number;
  isOpen: boolean;   // true = kita punya posisi di level ini
  buyPrice: number;
  quantity: number;
  realizedPnl: number;
  tradeCount: number;
}

interface VariationalStats {
  listings: Array<{
    ticker: string;
    mark_price: string;
    volume_24h: string;
    funding_rate: string;
  }>;
  total_volume_24h: string;
  tvl: string;
  num_markets: number;
}

// ── GRID BOT ───────────────────────────────────────────────────────────────
class GridBot {
  private levels: GridLevel[] = [];
  private balance: number;
  private prevPrice: number | null = null;
  private readonly step: number;

  private fetchCount = 0;
  private fillCount = 0;
  private readonly startTime = new Date();
  private lastPrice = 0;
  private lastFundingRate = "—";
  private lastVolume24h = "—";
  private consecutiveErrors = 0;

  constructor() {
    this.balance = CONFIG.initialBalance;
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

  // ── FETCH HARGA ──────────────────────────────────────────────────────────
  private async fetchPrice(): Promise<number | null> {
    try {
      const res = await fetch(`${BASE_URL}/metadata/stats`, {
        headers: { "Accept": "application/json" },
        signal: AbortSignal.timeout(8_000),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }

      const data = (await res.json()) as VariationalStats;
      const listing = data.listings?.find(
        (l) => l.ticker === CONFIG.ticker
      );

      if (!listing) {
        throw new Error(
          `Ticker "${CONFIG.ticker}" tidak ditemukan. Cek CONFIG.ticker.`
        );
      }

      this.lastFundingRate = (
        parseFloat(listing.funding_rate) * 100
      ).toFixed(4) + "%";
      this.lastVolume24h = "$" + (
        parseFloat(listing.volume_24h) / 1_000_000
      ).toFixed(2) + "M";

      this.consecutiveErrors = 0;
      return parseFloat(listing.mark_price);
    } catch (err) {
      this.consecutiveErrors++;
      this.logRaw(
        `[ERROR #${this.consecutiveErrors}] Gagal fetch harga: ${err}`
      );
      return null;
    }
  }

  // ── LOGIKA GRID ──────────────────────────────────────────────────────────
  private processPrice(price: number) {
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
        if (this.balance >= CONFIG.orderSizeUsdc) {
          const qty = CONFIG.orderSizeUsdc / lp;
          this.balance -= CONFIG.orderSizeUsdc;
          level.isOpen = true;
          level.buyPrice = lp;
          level.quantity = qty;
          level.tradeCount++;
          this.fillCount++;
          this.logRaw(
            `▼ BUY  ${CONFIG.ticker} ${qty.toFixed(6)} @ $${lp.toLocaleString()} | Saldo: $${this.balance.toFixed(2)}`
          );
        } else {
          this.logRaw(
            `[SKIP] BUY @ $${lp.toLocaleString()} — saldo tidak cukup`
          );
        }
      }

      // Harga naik melewati level → SELL
      if (prev < lp && curr >= lp && level.isOpen) {
        const proceeds = level.quantity * lp;
        const pnl = proceeds - CONFIG.orderSizeUsdc;
        this.balance += proceeds;
        level.realizedPnl += pnl;
        level.isOpen = false;
        level.tradeCount++;
        this.fillCount++;
        this.logRaw(
          `▲ SELL ${CONFIG.ticker} qty @ $${lp.toLocaleString()} | PnL: ${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)} | Saldo: $${this.balance.toFixed(2)}`
        );
      }
    }

    this.prevPrice = curr;
  }

  // ── KALKULASI P&L ────────────────────────────────────────────────────────
  private get totalRealizedPnl() {
    return this.levels.reduce((s, l) => s + l.realizedPnl, 0);
  }

  private get openPositionCount() {
    return this.levels.filter((l) => l.isOpen).length;
  }

  private get unrealizedPnl() {
    if (!this.prevPrice) return 0;
    return this.levels
      .filter((l) => l.isOpen)
      .reduce(
        (sum, l) =>
          sum + l.quantity * (this.prevPrice ?? 0) - CONFIG.orderSizeUsdc,
        0
      );
  }

  // ── DASHBOARD ────────────────────────────────────────────────────────────
  private displayDashboard(price: number) {
    const uptime = Math.floor((Date.now() - this.startTime.getTime()) / 1000);
    const h = Math.floor(uptime / 3600);
    const m = Math.floor((uptime % 3600) / 60);
    const s = uptime % 60;
    const uptimeStr = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;

    const inRange = price >= CONFIG.gridLow && price <= CONFIG.gridHigh;
    const rangeStatus = inRange ? "✅ DALAM RANGE" : "⚠️  DI LUAR RANGE";
    const totalPnl = this.totalRealizedPnl + this.unrealizedPnl;
    const pnlColor = totalPnl >= 0 ? "+" : "";

    const W = 62;
    const line = "═".repeat(W);
    const dash = "─".repeat(W);

    const now = new Date().toISOString().replace("T", " ").slice(0, 19);

    console.clear();
    console.log(line);
    console.log(
      `  VARIATIONAL GRID BOT  [Paper Trading]  ${rangeStatus}`
    );
    console.log(line);
    console.log(`  Aset         : ${CONFIG.ticker}`);
    console.log(
      `  Harga        : $${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    );
    console.log(
      `  Range Grid   : $${CONFIG.gridLow.toLocaleString()} — $${CONFIG.gridHigh.toLocaleString()}`
    );
    console.log(
      `  Step         : $${this.step.toLocaleString()} (${CONFIG.gridCount} level)`
    );
    console.log(`  Funding Rate : ${this.lastFundingRate}`);
    console.log(`  Volume 24h   : ${this.lastVolume24h}`);
    console.log(dash);
    console.log(
      `  Saldo USDC   : $${this.balance.toFixed(2)}`
    );
    console.log(
      `  Posisi Buka  : ${this.openPositionCount} / ${this.levels.length} level`
    );
    console.log(
      `  Unrealized   : ${this.unrealizedPnl >= 0 ? "+" : ""}$${this.unrealizedPnl.toFixed(2)}`
    );
    console.log(
      `  Realized     : ${this.totalRealizedPnl >= 0 ? "+" : ""}$${this.totalRealizedPnl.toFixed(2)}`
    );
    console.log(
      `  Total P&L    : ${pnlColor}$${totalPnl.toFixed(2)}`
    );
    console.log(dash);
    console.log(`  Uptime       : ${uptimeStr}`);
    console.log(`  API Calls    : ${this.fetchCount}`);
    console.log(`  Total Fill   : ${this.fillCount}`);
    console.log(`  Update       : tiap ${CONFIG.pollIntervalMs / 1000}s`);
    console.log(`  Waktu        : ${now} UTC`);
    console.log(line);

    // Tampilkan level grid terdekat dengan harga saat ini
    console.log("\n  LEVEL GRID (5 terdekat dengan harga):");
    const sorted = [...this.levels]
      .sort((a, b) => Math.abs(a.price - price) - Math.abs(b.price - price))
      .slice(0, 5);

    for (const l of sorted) {
      const dot = l.isOpen ? "●" : "○";
      const arrow = l.price > price ? "▲" : "▼";
      const diff = ((l.price - price) / price * 100).toFixed(2);
      const pnlStr =
        l.realizedPnl !== 0
          ? ` | realized: ${l.realizedPnl >= 0 ? "+" : ""}$${l.realizedPnl.toFixed(2)}`
          : "";
      const openStr = l.isOpen
        ? ` [OPEN @ $${l.buyPrice.toLocaleString()}]`
        : "";
      console.log(
        `  ${dot} $${String(l.price.toLocaleString()).padEnd(10)} ${arrow} ${diff.padStart(6)}%${openStr}${pnlStr}`
      );
    }

    if (this.consecutiveErrors > 0) {
      console.log(
        `\n  ⚠️  Error berturut-turut: ${this.consecutiveErrors} (cek koneksi)`
      );
    }

    console.log("\n  Tekan Ctrl+C untuk berhenti\n");
  }

  // ── LOG TRADE ────────────────────────────────────────────────────────────
  private logRaw(msg: string) {
    const ts = new Date().toISOString().replace("T", " ").slice(0, 19);
    process.stdout.write(`[${ts}] ${msg}\n`);
  }

  // ── MAIN LOOP ────────────────────────────────────────────────────────────
  async start() {
    const W = 62;
    console.log("═".repeat(W));
    console.log("  VARIATIONAL GRID BOT — Starting...");
    console.log("═".repeat(W));
    console.log(`  Ticker       : ${CONFIG.ticker}`);
    console.log(
      `  Range        : $${CONFIG.gridLow.toLocaleString()} — $${CONFIG.gridHigh.toLocaleString()}`
    );
    console.log(
      `  Grid Levels  : ${CONFIG.gridCount} level @ $${this.step.toLocaleString()} tiap level`
    );
    console.log(`  Order Size   : $${CONFIG.orderSizeUsdc} USDC per level`);
    console.log(`  Saldo Awal   : $${CONFIG.initialBalance.toLocaleString()}`);
    console.log(
      `  Polling      : setiap ${CONFIG.pollIntervalMs / 1000} detik`
    );
    console.log("─".repeat(W));
    console.log(
      "  ⚠️  Ini adalah PAPER TRADING — tidak ada uang nyata yang digunakan."
    );
    console.log(
      "  Trading API Variational belum tersedia untuk publik."
    );
    console.log("─".repeat(W) + "\n");

    const tick = async () => {
      this.fetchCount++;
      const price = await this.fetchPrice();
      if (price !== null) {
        this.lastPrice = price;
        this.processPrice(price);
        this.displayDashboard(price);
      }
    };

    // Fetch pertama langsung, lalu interval
    await tick();
    const interval = setInterval(tick, CONFIG.pollIntervalMs);

    // Graceful shutdown saat Ctrl+C
    process.on("SIGINT", () => {
      clearInterval(interval);
      console.log("\n\n  Bot dihentikan. Ringkasan akhir:");
      console.log(`    Realized P&L  : ${this.totalRealizedPnl >= 0 ? "+" : ""}$${this.totalRealizedPnl.toFixed(2)}`);
      console.log(`    Total Fills   : ${this.fillCount}`);
      console.log(`    API Calls     : ${this.fetchCount}`);
      console.log(
        `    Uptime        : ${Math.floor((Date.now() - this.startTime.getTime()) / 1000)}s\n`
      );
      process.exit(0);
    });
  }
}

// ── ENTRY POINT ────────────────────────────────────────────────────────────
const bot = new GridBot();
bot.start().catch((err) => {
  console.error("Bot crash:", err);
  process.exit(1);
});
