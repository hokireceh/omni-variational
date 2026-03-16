import { BotStatus } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/utils";

export function BotInfoBar({ status }: { status?: BotStatus }) {
  if (!status) return null;

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
    </div>
  );
}
