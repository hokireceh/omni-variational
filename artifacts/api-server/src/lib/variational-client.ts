/**
 * Variational Omni API Client
 * Handles authentication (SIWE), price fetching, quotes, and order placement.
 * Auth strategy: private key SIWE login → auto-renew token, no manual token update needed.
 */

import { Wallet } from "ethers";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const BASE = "https://omni.variational.io";
const STATS_BASE = "https://omni-client-api.prod.ap-northeast-1.variational.io";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36";

const BROWSER_HEADERS = [
  "accept: */*",
  "accept-encoding: gzip, deflate, br, zstd",
  "accept-language: en-US,en;q=0.9",
  "origin: https://omni.variational.io",
  "referer: https://omni.variational.io/perpetual/BTC",
  'sec-ch-ua: "Not:A-Brand";v="99", "Google Chrome";v="145", "Chromium";v="145"',
  "sec-ch-ua-mobile: ?0",
  'sec-ch-ua-platform: "Windows"',
  "sec-fetch-dest: empty",
  "sec-fetch-mode: cors",
  "sec-fetch-site: same-origin",
];

// ── CURL HELPER ─────────────────────────────────────────────────────────────

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

  const { stdout } = await execFileAsync("curl", args, {
    maxBuffer: 10 * 1024 * 1024,
    timeout: 15_000,
  });

  const marker = "\n__STATUS__";
  const idx = stdout.lastIndexOf(marker);
  if (idx === -1) throw new Error(`curl output unexpected: ${stdout.slice(0, 200)}`);

  const body = stdout.slice(0, idx);
  const status = parseInt(stdout.slice(idx + marker.length), 10);

  return { status, body };
}

// ── TYPES ──────────────────────────────────────────────────────────────────

export interface AssetInfo {
  underlying: string;
  price: number;
  indexPrice: number;
  fundingRate: number;
  nextFundingRate: number;
  fundingIntervalS: number;
  nextFundingTime: string;
  volume24h: number;
  openInterestLong: number;
  openInterestShort: number;
}

export interface Portfolio {
  balance: number;
  upnl: number;
  initialMargin: number;
  maintenanceMargin: number;
}

export interface Position {
  underlying: string;
  qty: number;
  side: "long" | "short";
  avgEntryPrice: number;
  markPrice: number;
  value: number;
  upnl: number;
  rpnl: number;
  cumFunding: number;
  fundingIntervalS: number;
}

export interface PlaceOrderResult {
  success: boolean;
  orderId?: string;
  executionPrice?: number;
  bid?: number;
  ask?: number;
  error?: string;
}

// ── CLIENT ─────────────────────────────────────────────────────────────────

class VariationalClient {
  private token: string | null = null;
  private tokenExpiresAt: number = 0;
  private wallet: Wallet | null = null;
  private walletAddress: string | null = null;

  /**
   * cfBlocked = true hanya saat endpoint AUTH Variational sendiri kena Cloudflare.
   * Kalau hanya API endpoint (portfolio, orders) yang kena CF, kita coba SIWE login
   * dulu pakai private key sebelum menyerah.
   */
  private cfBlocked = false;

  /** Mencegah login berjalan bersamaan secara paralel */
  private loginInProgress: Promise<void> | null = null;

  constructor() {
    const pk = process.env.WALLET_PRIVATE_KEY;
    const addr = process.env.WALLET_ADDRESS;

    if (pk) {
      try {
        this.wallet = new Wallet(pk.startsWith("0x") ? pk : `0x${pk}`);
        this.walletAddress = this.wallet.address;
        console.log(`[VarClient] Wallet loaded: ${this.walletAddress}`);
      } catch (e) {
        console.error("[VarClient] Invalid WALLET_PRIVATE_KEY:", e);
      }
    } else if (addr) {
      this.walletAddress = addr;
    }

    const envToken = process.env.VR_TOKEN;
    if (envToken) {
      this.token = envToken;
      this.tokenExpiresAt = Date.now() + 6 * 24 * 60 * 60 * 1000;
      console.log("[VarClient] VR_TOKEN loaded from env");
    }
  }

  // ── AUTH ─────────────────────────────────────────────────────────────────

  isConfigured(): boolean {
    return !!(this.token || this.wallet);
  }

  isCfBlocked(): boolean {
    return this.cfBlocked;
  }

  /** Update CF_CLEARANCE dan/atau VR_TOKEN dari panel (tanpa restart server) */
  updateAuth(opts: { cfClearance?: string; vrToken?: string }) {
    if (opts.cfClearance) {
      process.env.CF_CLEARANCE = opts.cfClearance;
      this.cfBlocked = false;
      console.log("[VarClient] CF_CLEARANCE diupdate dari panel");
    }
    if (opts.vrToken) {
      this.token = opts.vrToken;
      this.tokenExpiresAt = Date.now() + 6 * 24 * 60 * 60 * 1000;
      this.cfBlocked = false;
      console.log("[VarClient] VR_TOKEN diupdate dari panel");
    }
  }

  private buildCookieStr(): string {
    const parts: string[] = [];
    if (this.token) parts.push(`vr-token=${this.token}`);
    if (this.walletAddress) parts.push(`vr-connected-address=${this.walletAddress.toLowerCase()}`);
    const cf = process.env.CF_CLEARANCE;
    if (cf) parts.push(`cf_clearance=${cf}`);
    return parts.join("; ");
  }

  private isCloudflareBlock(res: CurlResponse): boolean {
    if (res.status !== 403 && res.status !== 503) return false;
    const trimmed = res.body.trimStart();
    return trimmed.startsWith("<!") || trimmed.startsWith("<html") || trimmed.startsWith("<HTML");
  }

  private async ensureToken(): Promise<void> {
    if (this.token && Date.now() < this.tokenExpiresAt) return;

    if (this.cfBlocked) {
      throw new Error(
        "Endpoint auth Variational diblokir Cloudflare. Perbarui VR_TOKEN dari dashboard (tombol 🔑 Token)."
      );
    }

    if (!this.wallet || !this.walletAddress) {
      throw new Error(
        "Live mode butuh WALLET_PRIVATE_KEY atau VR_TOKEN di environment variable"
      );
    }

    await this.doLogin();
  }

  /** Login SIWE — deduplicate paralel calls */
  async login(): Promise<void> {
    await this.doLogin();
  }

  private async doLogin(): Promise<void> {
    // Kalau ada login yang sedang berjalan, tunggu hasilnya — jangan spawn dua
    if (this.loginInProgress) {
      return this.loginInProgress;
    }
    this.loginInProgress = this._siweLogin().finally(() => {
      this.loginInProgress = null;
    });
    return this.loginInProgress;
  }

  private async _siweLogin(): Promise<void> {
    if (!this.wallet || !this.walletAddress) {
      throw new Error("Wallet tidak tersedia untuk login");
    }

    const address = this.walletAddress;
    const extraHeaders: Record<string, string> = {
      "vr-connected-address": address,
    };

    console.log("[VarClient] Mencoba SIWE login via private key...");

    // Step 1: Minta SIWE message
    const siweRes = await curlFetch(`${BASE}/api/auth/generate_signing_data`, {
      method: "POST",
      body: JSON.stringify({ address }),
      headers: extraHeaders,
      cookieStr: this.buildCookieStr(),
    });

    if (this.isCloudflareBlock(siweRes)) {
      // Endpoint AUTH sendiri kena CF — baru set cfBlocked
      this.cfBlocked = true;
      throw new Error(
        "Cloudflare memblokir endpoint auth Variational dari IP server ini. " +
        "Perbarui VR_TOKEN dari dashboard (tombol 🔑 Token)."
      );
    }

    if (siweRes.status !== 200) {
      throw new Error(`generate_signing_data gagal: ${siweRes.status} — ${siweRes.body.slice(0, 300)}`);
    }

    const siweMessage = siweRes.body.trim();

    // Step 2: Sign dengan private key — strip 0x prefix sesuai format API Variational
    const rawSig = await this.wallet.signMessage(siweMessage);
    const signed_message = rawSig.startsWith("0x") ? rawSig.slice(2) : rawSig;

    // Step 3: Submit login — format: { address, signed_message } (bukan message/signature)
    const loginRes = await curlFetch(`${BASE}/api/auth/login`, {
      method: "POST",
      body: JSON.stringify({ address, signed_message }),
      headers: extraHeaders,
      cookieStr: this.buildCookieStr(),
    });

    if (this.isCloudflareBlock(loginRes)) {
      this.cfBlocked = true;
      throw new Error(
        "Cloudflare memblokir endpoint login Variational dari IP server ini."
      );
    }

    if (loginRes.status !== 200) {
      throw new Error(`Login gagal: ${loginRes.status} — ${loginRes.body.slice(0, 300)}`);
    }

    const data = JSON.parse(loginRes.body) as { token: string };
    this.token = data.token;
    this.tokenExpiresAt = Date.now() + 6 * 24 * 60 * 60 * 1000;
    this.cfBlocked = false;
    console.log("[VarClient] SIWE login berhasil, token valid 6 hari");
  }

  /**
   * authedCurl — request dengan token.
   * Strategi retry:
   *  1. Jika CF block pada API endpoint → coba re-login SIWE dulu (auth endpoint mungkin tidak diblokir)
   *  2. Jika re-login berhasil → retry request sekali
   *  3. Jika re-login juga kena CF → baru set cfBlocked = true
   *  4. Jika 401 → token expired, re-login SIWE
   */
  private async authedCurl(
    url: string,
    opts: { method?: string; body?: string } = {},
    isRetry = false
  ): Promise<CurlResponse> {
    await this.ensureToken();

    const headers: Record<string, string> = {
      "vr-connected-address": this.walletAddress ?? "",
    };

    const res = await curlFetch(url, {
      ...opts,
      headers,
      cookieStr: this.buildCookieStr(),
    });

    // CF block pada API endpoint — coba SIWE login dulu sebelum menyerah
    if (this.isCloudflareBlock(res)) {
      if (isRetry || !this.wallet) {
        // Sudah retry atau tidak punya wallet — tidak bisa berbuat apa-apa
        this.cfBlocked = true;
        throw new Error(
          "Cloudflare memblokir request dan SIWE login tidak membantu. " +
          "Perbarui VR_TOKEN dari dashboard (tombol 🔑 Token)."
        );
      }

      console.log("[VarClient] CF block pada API endpoint, mencoba SIWE re-login...");
      try {
        // Invalidate token, paksa re-login
        this.token = null;
        this.tokenExpiresAt = 0;
        await this.doLogin();
        // Re-login berhasil! Retry request dengan token baru
        return this.authedCurl(url, opts, true);
      } catch (loginErr) {
        // SIWE juga gagal (cfBlocked sudah di-set di _siweLogin jika CF)
        const msg = loginErr instanceof Error ? loginErr.message : String(loginErr);
        throw new Error(`CF block: re-login juga gagal — ${msg}`);
      }
    }

    // 401 = token expired/invalid → re-login SIWE
    if (res.status === 401 && this.wallet && !isRetry) {
      console.log("[VarClient] Token expired (401), re-login via SIWE...");
      this.token = null;
      this.tokenExpiresAt = 0;
      await this.doLogin();
      return this.authedCurl(url, opts, true);
    }

    return res;
  }

  // ── PRICE / MARKET DATA ──────────────────────────────────────────────────

  async getAssetInfo(ticker: string): Promise<AssetInfo> {
    const res = await curlFetch(`${STATS_BASE}/metadata/stats`, {
      headers: { Accept: "application/json" },
    });
    if (res.status !== 200) throw new Error(`metadata/stats gagal: ${res.status}`);

    const data = JSON.parse(res.body) as {
      listings: Array<{
        ticker: string;
        mark_price: string;
        funding_rate: string;
        volume_24h: string;
        funding_interval_s: number;
      }>;
    };

    const listing = data.listings?.find((l) => l.ticker === ticker);
    if (!listing) throw new Error(`Ticker "${ticker}" tidak ditemukan`);

    const price = parseFloat(listing.mark_price);
    const fundingRate = parseFloat(listing.funding_rate);
    const fundingIntervalS = listing.funding_interval_s ?? 3600;

    // Fetch open interest secara paralel — silent fail jika gagal
    const oi = await this.getOpenInterest(ticker, fundingIntervalS).catch(() => null);

    return {
      underlying: ticker,
      price,
      indexPrice: price,
      fundingRate,
      nextFundingRate: fundingRate,
      fundingIntervalS,
      nextFundingTime: new Date(Date.now() + fundingIntervalS * 1000).toISOString(),
      volume24h: parseFloat(listing.volume_24h),
      openInterestLong: oi?.longQty ?? 0,
      openInterestShort: oi?.shortQty ?? 0,
    };
  }

  /**
   * Ambil quote (bid/ask/mark/index) dari endpoint publik Variational.
   * Tidak butuh auth. Digunakan di paper mode untuk data harga yang lebih kaya.
   * Silent fail — kembalikan null jika ada error.
   */
  async getQuote(
    ticker: string,
    fundingIntervalS: number,
    qty = "0.001"
  ): Promise<{ bid: number; ask: number; markPrice: number; indexPrice: number } | null> {
    try {
      const instrument = {
        instrument_type: "perpetual_future",
        underlying: ticker,
        funding_interval_s: fundingIntervalS,
        settlement_asset: "USDC",
      };
      const body = JSON.stringify({ instrument, qty });

      // Endpoint ini kena Cloudflare Managed Challenge dari IP server.
      // Gunakan authedCurl (dengan vr-token cookie) jika tersedia.
      // Kalau tidak ada token, fallback curlFetch dengan cookie yang ada — mungkin gagal (silent).
      let res: CurlResponse;
      if (this.token) {
        res = await this.authedCurl(`${BASE}/api/quotes/simple`, { method: "POST", body });
      } else {
        res = await curlFetch(`${BASE}/api/quotes/simple`, {
          method: "POST",
          body,
          cookieStr: this.buildCookieStr(),
        });
      }

      if (res.status !== 200) return null;
      const d = JSON.parse(res.body) as {
        bid: string;
        ask: string;
        mark_price: string;
        index_price: string;
      };
      return {
        bid: parseFloat(d.bid),
        ask: parseFloat(d.ask),
        markPrice: parseFloat(d.mark_price),
        indexPrice: parseFloat(d.index_price),
      };
    } catch {
      return null;
    }
  }

  /**
   * Ambil open interest (long qty vs short qty).
   * Endpoint kena Cloudflare dari IP server — gunakan token jika ada.
   * Silent fail — kembalikan null jika ada error.
   */
  async getOpenInterest(
    ticker: string,
    fundingIntervalS: number
  ): Promise<{ longQty: number; shortQty: number } | null> {
    try {
      const instrument = {
        instrument_type: "perpetual_future",
        underlying: ticker,
        funding_interval_s: fundingIntervalS,
        settlement_asset: "USDC",
      };
      const body = JSON.stringify({ instrument });

      let res: CurlResponse;
      if (this.token) {
        res = await this.authedCurl(`${BASE}/api/metadata/open_interest`, { method: "POST", body });
      } else {
        res = await curlFetch(`${BASE}/api/metadata/open_interest`, {
          method: "POST",
          body,
          cookieStr: this.buildCookieStr(),
        });
      }

      if (res.status !== 200) return null;
      const d = JSON.parse(res.body) as {
        long_qty: string;
        short_qty: string;
      };
      return {
        longQty: parseFloat(d.long_qty),
        shortQty: parseFloat(d.short_qty),
      };
    } catch {
      return null;
    }
  }

  // ── PORTFOLIO / BALANCE ──────────────────────────────────────────────────

  async getPortfolio(): Promise<Portfolio> {
    const res = await this.authedCurl(`${BASE}/api/portfolio?compute_margin=true`);
    if (res.status !== 200) throw new Error(`portfolio gagal: ${res.status}`);

    const data = JSON.parse(res.body) as {
      balance: string;
      upnl: string;
      margin_usage: {
        initial_margin: string;
        maintenance_margin: string;
      };
    };

    return {
      balance: parseFloat(data.balance),
      upnl: parseFloat(data.upnl),
      initialMargin: parseFloat(data.margin_usage.initial_margin),
      maintenanceMargin: parseFloat(data.margin_usage.maintenance_margin),
    };
  }

  // ── POSITIONS ────────────────────────────────────────────────────────────

  async getPositions(): Promise<Position[]> {
    const res = await this.authedCurl(`${BASE}/api/positions`);
    if (res.status !== 200) throw new Error(`positions gagal: ${res.status}`);

    const data = JSON.parse(res.body) as Array<{
      position_info: {
        instrument: {
          underlying: string;
          funding_interval_s: number;
        };
        qty: string;
        avg_entry_price: string;
      };
      price_info: { price: string };
      value: string;
      upnl: string;
      rpnl: string;
      cum_funding: string;
    }>;

    return data.map((p) => {
      const qty = parseFloat(p.position_info.qty);
      return {
        underlying: p.position_info.instrument.underlying,
        qty: Math.abs(qty),
        side: qty >= 0 ? "long" : "short",
        avgEntryPrice: parseFloat(p.position_info.avg_entry_price),
        markPrice: parseFloat(p.price_info.price),
        value: parseFloat(p.value),
        upnl: parseFloat(p.upnl),
        rpnl: parseFloat(p.rpnl),
        cumFunding: parseFloat(p.cum_funding),
        fundingIntervalS: p.position_info.instrument.funding_interval_s,
      };
    });
  }

  // ── ORDER PLACEMENT ──────────────────────────────────────────────────────

  async placeMarketOrder(
    ticker: string,
    fundingIntervalS: number,
    side: "bid" | "ask",
    qty: number
  ): Promise<PlaceOrderResult> {
    const instrument = {
      instrument_type: "perpetual_future",
      underlying: ticker,
      funding_interval_s: fundingIntervalS,
      settlement_asset: "USDC",
    };

    try {
      // Step 1: Get quote via /api/quotes/simple
      // Response: {quote_id, bid, ask, mark_price, index_price, qty, qty_limits, timestamp}
      const quoteRes = await this.authedCurl(`${BASE}/api/quotes/simple`, {
        method: "POST",
        body: JSON.stringify({ instrument, side, qty: qty.toString() }),
      });

      if (quoteRes.status !== 200) {
        return { success: false, error: `Quote gagal (${quoteRes.status}): ${quoteRes.body.slice(0, 200)}` };
      }

      const quote = JSON.parse(quoteRes.body) as {
        quote_id: string;
        bid: string;
        ask: string;
        mark_price: string;
      };
      const rfqId = quote.quote_id;

      if (!rfqId) {
        return { success: false, error: "quote_id tidak ada di response" };
      }

      const bid = parseFloat(quote.bid);
      const ask = parseFloat(quote.ask);
      const executionPrice = side === "bid" ? bid : ask;

      // Step 2: Submit Market Order
      const orderRes = await this.authedCurl(`${BASE}/api/orders/new/market`, {
        method: "POST",
        body: JSON.stringify({
          rfq_id: rfqId,
          take_profit_rfq_id: null,
          stop_loss_rfq_id: null,
        }),
      });

      if (orderRes.status !== 200) {
        return { success: false, error: `Order gagal (${orderRes.status}): ${orderRes.body.slice(0, 200)}` };
      }

      console.log(
        `[VarClient] Order ${side.toUpperCase()} ${qty} ${ticker} @ ${executionPrice} berhasil, rfq_id=${rfqId}`
      );

      return { success: true, orderId: rfqId, executionPrice, bid, ask };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }
}

// Singleton
export const varClient = new VariationalClient();
