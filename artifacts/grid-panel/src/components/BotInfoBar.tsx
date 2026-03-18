import { BotStatus } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/utils";

function OIBar({ longQty, shortQty }: { longQty: number; shortQty: number }) {
  const total = longQty + shortQty;
  if (total === 0) return <span className="font-mono text-sm text-foreground">—</span>;
  const longPct = (longQty / total) * 100;
  const shortPct = (shortQty / total) * 100;
  return (
    <div className="flex flex-col gap-1 min-w-[120px]">
      <div className="flex justify-between text-[10px] font-mono">
        <span className="text-emerald-400">{longPct.toFixed(1)}% L</span>
        <span className="text-rose-400">S {shortPct.toFixed(1)}%</span>
      </div>
      <div className="flex h-1.5 rounded-full overflow-hidden bg-white/5">
        <div className="bg-emerald-500/70" style={{ width: `${longPct}%` }} />
        <div className="bg-rose-500/70" style={{ width: `${shortPct}%` }} />
      </div>
    </div>
  );
}

export function BotInfoBar({ status }: { status?: BotStatus }) {
  if (!status) return null;

  const hasBidAsk = status.bid != null && status.ask != null;
  const spread = hasBidAsk ? (status.ask! - status.bid!) : null;
  const hasOI = status.openInterestLong != null && status.openInterestShort != null;

  const info = [
    { label: "Asset", value: status.ticker },
    { label: "Range", value: `$${formatCurrency(status.gridLow)} - $${formatCurrency(status.gridHigh)}` },
    { label: "Levels", value: status.gridCount },
    { label: "Order Size", value: `$${status.orderSizeUsdc}` },
    { label: "Fills", value: status.fillCount },
    { label: "API Calls", value: status.fetchCount },
    { label: "Funding", value: status.fundingRate },
    { label: "Vol 24h", value: status.volume24h },
  ];

  return (
    <div className="flex flex-wrap gap-x-8 gap-y-4 px-6 py-4 glass-panel rounded-2xl items-center justify-between">
      {info.map((item, i) => (
        <div key={i} className="flex flex-col">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">{item.label}</span>
          <span className="font-mono text-sm text-foreground">{item.value}</span>
        </div>
      ))}

      {/* Bid / Ask / Spread */}
      {hasBidAsk && (
        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Bid / Ask</span>
          <div className="flex items-center gap-1.5 font-mono text-sm">
            <span className="text-emerald-400">${formatCurrency(status.bid!)}</span>
            <span className="text-muted-foreground">/</span>
            <span className="text-rose-400">${formatCurrency(status.ask!)}</span>
          </div>
        </div>
      )}
      {spread != null && (
        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Spread</span>
          <span className="font-mono text-sm text-amber-400">${spread.toFixed(2)}</span>
        </div>
      )}

      {/* Open Interest bar */}
      {hasOI && (
        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Open Interest</span>
          <OIBar longQty={status.openInterestLong!} shortQty={status.openInterestShort!} />
        </div>
      )}

      {/* Index Price */}
      {status.indexPrice != null && (
        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Index</span>
          <span className="font-mono text-sm text-foreground">${formatCurrency(status.indexPrice)}</span>
        </div>
      )}
    </div>
  );
}
