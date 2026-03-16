/**
 * Grid Bot Engine — core trading logic yang jalan di server
 * Dipanggil oleh Express route handlers, state disimpan di memori
 */

const BASE_URL =
  "https://omni-client-api.prod.ap-northeast-1.variational.io";

// ── TIPE ──────────────────────────────────────────────────────────────────
export interface BotConfig {
  ticker: string;
  gridLow: number;
  gridHigh: number;
  gridCount: number;
  orderSizeUsdc: number;
  initialBalance: number;
  pollIntervalMs: number;
}

export interface GridLevel {
  price: number;
  isOpen: boolean;
  buyPrice: number;
  quantity: number;
  realizedPnl: number;
  tradeCount: number;
}

export interface Trade {
  id: number;
  type: "BUY" | "SELL";
  ticker: string;
  price: number;
  quantity: number;
  pnl: number | null;
  timestamp: string;
}

export interface BotStatusSnapshot {
  running: boolean;
  ticker: string;
  currentPrice: number | null;
  balance: number;
  initialBalance: number;
  openPositions: number;
  totalLevels: number;
  realizedPnl: number;
  unrealizedPnl: number;
  totalPnl: number;
  fillCount: number;
  fetchCount: number;
  uptimeSeconds: number;
  inRange: boolean;
  fundingRate: string;
  volume24h: string;
  gridLow: number;
  gridHigh: number;
  gridCount: number;
  orderSizeUsdc: number;
  pollIntervalMs: number;
  levels: GridLevel[];
}

// ── ENGINE ────────────────────────────────────────────────────────────────
class GridBotEngine {
  private config: BotConfig = {
    ticker: "BTC",
    gridLow: 70_000,
    gridHigh: 80_000,
    gridCount: 10,
    orderSizeUsdc: 100,
    initialBalance: 5_000,
    pollIntervalMs: 5_000,
  };

  private levels: GridLevel[] = [];
  private balance = this.config.initialBalance;
  private prevPrice: number | null = null;
  private currentPrice: number | null = null;

  private running = false;
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private startTime: Date | null = null;

  private fetchCount = 0;
  private fillCount = 0;
  private tradeIdCounter = 0;
  private trades: Trade[] = [];

  private fundingRate = "—";
  private volume24h = "—";
  private consecutiveErrors = 0;

  // ── KONFIGURASI ─────────────────────────────────────────────────────────
  getConfig(): BotConfig {
    return { ...this.config };
  }

  setConfig(newConfig: BotConfig): void {
    if (this.running) {
      throw new Error("Hentikan bot terlebih dahulu sebelum mengubah konfigurasi.");
    }
    this.config = { ...newConfig };
  }

  // ── GRID INIT ────────────────────────────────────────────────────────────
  private initGrid() {
    const step = (this.config.gridHigh - this.config.gridLow) / this.config.gridCount;
    this.levels = [];
    for (let i = 0; i <= this.config.gridCount; i++) {
      this.levels.push({
        price: Math.round(this.config.gridLow + i * step),
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
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = (await res.json()) as {
        listings: Array<{
          ticker: string;
          mark_price: string;
          funding_rate: string;
          volume_24h: string;
        }>;
      };

      const listing = data.listings?.find((l) => l.ticker === this.config.ticker);
      if (!listing) throw new Error(`Ticker "${this.config.ticker}" tidak ditemukan`);

      this.fundingRate = (parseFloat(listing.funding_rate) * 100).toFixed(4) + "%";
      this.volume24h = "$" + (parseFloat(listing.volume_24h) / 1_000_000).toFixed(2) + "M";
      this.consecutiveErrors = 0;

      return parseFloat(listing.mark_price);
    } catch (err) {
      this.consecutiveErrors++;
      console.error(`[GridBot] Fetch error #${this.consecutiveErrors}:`, err);
      return null;
    }
  }

  // ── PROSES HARGA ─────────────────────────────────────────────────────────
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
        if (this.balance >= this.config.orderSizeUsdc) {
          const qty = this.config.orderSizeUsdc / lp;
          this.balance -= this.config.orderSizeUsdc;
          level.isOpen = true;
          level.buyPrice = lp;
          level.quantity = qty;
          level.tradeCount++;
          this.fillCount++;
          this.trades.unshift({
            id: ++this.tradeIdCounter,
            type: "BUY",
            ticker: this.config.ticker,
            price: lp,
            quantity: qty,
            pnl: null,
            timestamp: new Date().toISOString(),
          });
        }
      }

      // Harga naik melewati level → SELL
      if (prev < lp && curr >= lp && level.isOpen) {
        const proceeds = level.quantity * lp;
        const pnl = proceeds - this.config.orderSizeUsdc;
        this.balance += proceeds;
        level.realizedPnl += pnl;
        level.isOpen = false;
        level.tradeCount++;
        this.fillCount++;
        this.trades.unshift({
          id: ++this.tradeIdCounter,
          type: "SELL",
          ticker: this.config.ticker,
          price: lp,
          quantity: level.quantity,
          pnl,
          timestamp: new Date().toISOString(),
        });
        level.quantity = 0;
        level.buyPrice = 0;
      }
    }

    this.prevPrice = curr;
  }

  // ── P&L HELPERS ──────────────────────────────────────────────────────────
  private get totalRealizedPnl() {
    return this.levels.reduce((s, l) => s + l.realizedPnl, 0);
  }

  private get unrealizedPnl() {
    if (!this.currentPrice) return 0;
    return this.levels
      .filter((l) => l.isOpen)
      .reduce(
        (sum, l) =>
          sum + l.quantity * (this.currentPrice ?? 0) - this.config.orderSizeUsdc,
        0
      );
  }

  // ── START / STOP ──────────────────────────────────────────────────────────
  start() {
    if (this.running) return;
    this.running = true;
    this.startTime = new Date();
    this.balance = this.config.initialBalance;
    this.prevPrice = null;
    this.fetchCount = 0;
    this.fillCount = 0;
    this.initGrid();

    const tick = async () => {
      this.fetchCount++;
      const price = await this.fetchPrice();
      if (price !== null) {
        this.currentPrice = price;
        this.processPrice(price);
      }
    };

    tick();
    this.intervalHandle = setInterval(tick, this.config.pollIntervalMs);
    console.log(`[GridBot] Started. Ticker: ${this.config.ticker}, Range: ${this.config.gridLow}-${this.config.gridHigh}`);
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    console.log(`[GridBot] Stopped. Realized P&L: ${this.totalRealizedPnl.toFixed(2)}`);
  }

  reset() {
    this.stop();
    this.currentPrice = null;
    this.prevPrice = null;
    this.balance = this.config.initialBalance;
    this.fetchCount = 0;
    this.fillCount = 0;
    this.trades = [];
    this.tradeIdCounter = 0;
    this.fundingRate = "—";
    this.volume24h = "—";
    this.consecutiveErrors = 0;
    this.initGrid();
    console.log("[GridBot] Reset.");
  }

  // ── STATUS SNAPSHOT ───────────────────────────────────────────────────────
  getStatus(): BotStatusSnapshot {
    const openPositions = this.levels.filter((l) => l.isOpen).length;
    const realizedPnl = this.totalRealizedPnl;
    const unrealizedPnl = this.unrealizedPnl;
    const inRange =
      this.currentPrice !== null &&
      this.currentPrice >= this.config.gridLow &&
      this.currentPrice <= this.config.gridHigh;

    const uptimeSeconds = this.startTime && this.running
      ? Math.floor((Date.now() - this.startTime.getTime()) / 1000)
      : 0;

    return {
      running: this.running,
      ticker: this.config.ticker,
      currentPrice: this.currentPrice,
      balance: this.balance,
      initialBalance: this.config.initialBalance,
      openPositions,
      totalLevels: this.levels.length,
      realizedPnl,
      unrealizedPnl,
      totalPnl: realizedPnl + unrealizedPnl,
      fillCount: this.fillCount,
      fetchCount: this.fetchCount,
      uptimeSeconds,
      inRange,
      fundingRate: this.fundingRate,
      volume24h: this.volume24h,
      gridLow: this.config.gridLow,
      gridHigh: this.config.gridHigh,
      gridCount: this.config.gridCount,
      orderSizeUsdc: this.config.orderSizeUsdc,
      pollIntervalMs: this.config.pollIntervalMs,
      levels: this.levels.map((l) => ({ ...l })),
    };
  }

  getTrades(limit = 50): Trade[] {
    return this.trades.slice(0, limit);
  }
}

// Singleton — satu instance per server process
export const botEngine = new GridBotEngine();
