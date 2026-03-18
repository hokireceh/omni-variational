/**
 * Variational Omni API Client
 * Handles authentication (SIWE), price fetching, quotes, and order placement
 * Base URL: https://omni.variational.io
 *
 * Auth modes:
 *   1. WALLET_PRIVATE_KEY + WALLET_ADDRESS env vars → auto-login via SIWE
 *   2. VR_TOKEN env var → gunakan token langsung (manual, valid ~7 hari)
 */

import { Wallet } from "ethers";

const BASE = "https://omni.variational.io";
const STATS_BASE = "https://omni-client-api.prod.ap-northeast-1.variational.io";

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
  error?: string;
}

// ── CLIENT ─────────────────────────────────────────────────────────────────

class VariationalClient {
  private token: string | null = null;
  private tokenExpiresAt: number = 0;
  private wallet: Wallet | null = null;
  private walletAddress: string | null = null;

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
      // VR_TOKEN dari env — asumsikan valid 7 hari dari sekarang
      this.tokenExpiresAt = Date.now() + 6 * 24 * 60 * 60 * 1000;
      console.log("[VarClient] VR_TOKEN loaded from env");
    }
  }

  // ── AUTH ─────────────────────────────────────────────────────────────────

  isConfigured(): boolean {
    return !!(this.token || this.wallet);
  }

  private async ensureToken(): Promise<void> {
    if (this.token && Date.now() < this.tokenExpiresAt) return;

    if (!this.wallet || !this.walletAddress) {
      throw new Error(
        "Live mode butuh WALLET_PRIVATE_KEY atau VR_TOKEN di environment variable"
      );
    }

    await this.login();
  }

  async login(): Promise<void> {
    if (!this.wallet || !this.walletAddress) {
      throw new Error("Wallet tidak tersedia untuk login");
    }

    const cfClearance = process.env.CF_CLEARANCE;
    const baseHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
      ...(cfClearance ? { Cookie: `cf_clearance=${cfClearance}` } : {}),
    };

    // Step 1: Minta SIWE message
    const siweRes = await fetch(`${BASE}/api/auth/generate_signing_data`, {
      method: "POST",
      headers: baseHeaders,
      body: JSON.stringify({ address: this.walletAddress }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!siweRes.ok) throw new Error(`generate_signing_data gagal: ${siweRes.status}`);
    const siweMessage = await siweRes.text();

    // Step 2: Sign SIWE message dengan private key
    const signature = await this.wallet.signMessage(siweMessage);

    // Step 3: Login dan ambil token
    const loginRes = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: baseHeaders,
      body: JSON.stringify({ message: siweMessage, signature }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!loginRes.ok) throw new Error(`Login gagal: ${loginRes.status}`);
    const { token } = (await loginRes.json()) as { token: string };

    this.token = token;
    this.tokenExpiresAt = Date.now() + 6 * 24 * 60 * 60 * 1000; // 6 hari
    console.log("[VarClient] Login berhasil, token valid 6 hari");
  }

  private buildCookieHeader(): string {
    const parts: string[] = [];
    if (this.token) parts.push(`vr-token=${this.token}`);
    const cfClearance = process.env.CF_CLEARANCE;
    if (cfClearance) parts.push(`cf_clearance=${cfClearance}`);
    return parts.join("; ");
  }

  private async authedFetch(
    url: string,
    options: RequestInit = {}
  ): Promise<Response> {
    await this.ensureToken();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Cookie: this.buildCookieHeader(),
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
      ...(this.walletAddress
        ? { "vr-connected-address": this.walletAddress }
        : {}),
      ...(options.headers as Record<string, string>),
    };

    const res = await fetch(url, {
      ...options,
      headers,
      signal: options.signal ?? AbortSignal.timeout(10_000),
    });

    // Token expired → refresh dan retry sekali
    if (res.status === 401 && this.wallet) {
      console.log("[VarClient] Token expired, re-login...");
      await this.login();
      headers.Cookie = this.buildCookieHeader();
      return fetch(url, { ...options, headers });
    }

    return res;
  }

  // ── PRICE / MARKET DATA ──────────────────────────────────────────────────

  async getAssetInfo(ticker: string): Promise<AssetInfo> {
    // Gunakan omni-client-api/metadata/stats yang tidak diblok Cloudflare
    const res = await fetch(`${STATS_BASE}/metadata/stats`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) throw new Error(`metadata/stats gagal: ${res.status}`);

    const data = (await res.json()) as {
      listings: Array<{
        ticker: string;
        mark_price: string;
        funding_rate: string;
        volume_24h: string;
        funding_interval_s: number;
        quotes?: {
          base?: { bid: string; ask: string };
        };
      }>;
    };

    const listing = data.listings?.find((l) => l.ticker === ticker);
    if (!listing) throw new Error(`Ticker "${ticker}" tidak ditemukan`);

    const price = parseFloat(listing.mark_price);
    const fundingRate = parseFloat(listing.funding_rate);

    return {
      underlying: ticker,
      price,
      indexPrice: price,
      fundingRate,
      nextFundingRate: fundingRate,
      fundingIntervalS: listing.funding_interval_s ?? 28800,
      nextFundingTime: new Date(Date.now() + (listing.funding_interval_s ?? 28800) * 1000).toISOString(),
      volume24h: parseFloat(listing.volume_24h),
      openInterestLong: 0,
      openInterestShort: 0,
    };
  }

  // ── PORTFOLIO / BALANCE ──────────────────────────────────────────────────

  async getPortfolio(): Promise<Portfolio> {
    const res = await this.authedFetch(
      `${BASE}/api/portfolio?compute_margin=true`
    );
    if (!res.ok) throw new Error(`portfolio gagal: ${res.status}`);

    const data = (await res.json()) as {
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
    const res = await this.authedFetch(`${BASE}/api/positions`);
    if (!res.ok) throw new Error(`positions gagal: ${res.status}`);

    const data = (await res.json()) as Array<{
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

  /**
   * Place a market order via RFQ:
   * 1. POST /api/quotes/indicative → dapat quote_id
   * 2. POST /api/orders/new/market dengan rfq_id = quote_id
   *
   * @param ticker   e.g. "BTC"
   * @param fundingIntervalS  e.g. 28800
   * @param side     "bid" = beli long, "ask" = jual/short
   * @param qty      jumlah aset (bukan USDC)
   */
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
      // Step 1: Request Quote (RFQ)
      const quoteRes = await this.authedFetch(`${BASE}/api/quotes/indicative`, {
        method: "POST",
        body: JSON.stringify({ instrument, side, qty: qty.toString() }),
      });

      if (!quoteRes.ok) {
        const errText = await quoteRes.text();
        return { success: false, error: `Quote gagal (${quoteRes.status}): ${errText}` };
      }

      const quote = (await quoteRes.json()) as { quote_id: string };
      const rfqId = quote.quote_id;

      if (!rfqId) {
        return { success: false, error: "quote_id tidak ada di response" };
      }

      // Step 2: Submit Market Order
      const orderRes = await this.authedFetch(`${BASE}/api/orders/new/market`, {
        method: "POST",
        body: JSON.stringify({
          rfq_id: rfqId,
          take_profit_rfq_id: null,
          stop_loss_rfq_id: null,
        }),
      });

      if (!orderRes.ok) {
        const errText = await orderRes.text();
        return { success: false, error: `Order gagal (${orderRes.status}): ${errText}` };
      }

      console.log(
        `[VarClient] Order ${side.toUpperCase()} ${qty} ${ticker} berhasil, rfq_id=${rfqId}`
      );

      return { success: true, orderId: rfqId };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }
}

// Singleton
export const varClient = new VariationalClient();
