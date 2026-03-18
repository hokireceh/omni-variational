/**
 * Hook untuk fetch data market langsung dari browser ke omni.variational.io.
 * Karena endpoint publik CORS *,  dan request datang dari IP user (bukan server),
 * Cloudflare tidak memblokir request ini — berbeda dengan panggilan dari server.
 */
import { useQuery } from "@tanstack/react-query";

const BASE = "https://omni.variational.io";
const FUNDING_INTERVAL_S = 3600;

interface QuoteData {
  bid: number;
  ask: number;
  markPrice: number;
  indexPrice: number;
}

interface OIData {
  longQty: number;
  shortQty: number;
}

export interface MarketData {
  bid: number | null;
  ask: number | null;
  markPrice: number | null;
  indexPrice: number | null;
  openInterestLong: number | null;
  openInterestShort: number | null;
  isLoading: boolean;
  error: boolean;
}

async function fetchQuote(ticker: string): Promise<QuoteData | null> {
  try {
    const res = await fetch(`${BASE}/api/quotes/simple`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        instrument: {
          instrument_type: "perpetual_future",
          underlying: ticker,
          funding_interval_s: FUNDING_INTERVAL_S,
          settlement_asset: "USDC",
        },
        qty: "0.001",
      }),
    });
    if (!res.ok) return null;
    const d = await res.json();
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

async function fetchOI(ticker: string): Promise<OIData | null> {
  try {
    const res = await fetch(`${BASE}/api/metadata/open_interest`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        instrument: {
          instrument_type: "perpetual_future",
          underlying: ticker,
          funding_interval_s: FUNDING_INTERVAL_S,
          settlement_asset: "USDC",
        },
      }),
    });
    if (!res.ok) return null;
    const d = await res.json();
    return {
      longQty: parseFloat(d.long_qty),
      shortQty: parseFloat(d.short_qty),
    };
  } catch {
    return null;
  }
}

export function useVariationalMarketData(
  ticker: string | undefined,
  enabled: boolean
): MarketData {
  const quoteQuery = useQuery<QuoteData | null>({
    queryKey: ["var-quote", ticker],
    enabled: enabled && !!ticker,
    refetchInterval: 5000,
    retry: false,
    staleTime: 3000,
    queryFn: () => fetchQuote(ticker!),
  });

  const oiQuery = useQuery<OIData | null>({
    queryKey: ["var-oi", ticker],
    enabled: enabled && !!ticker,
    refetchInterval: 15000,
    retry: false,
    staleTime: 10000,
    queryFn: () => fetchOI(ticker!),
  });

  return {
    bid: quoteQuery.data?.bid ?? null,
    ask: quoteQuery.data?.ask ?? null,
    markPrice: quoteQuery.data?.markPrice ?? null,
    indexPrice: quoteQuery.data?.indexPrice ?? null,
    openInterestLong: oiQuery.data?.longQty ?? null,
    openInterestShort: oiQuery.data?.shortQty ?? null,
    isLoading: quoteQuery.isLoading || oiQuery.isLoading,
    error: quoteQuery.isError || oiQuery.isError,
  };
}
