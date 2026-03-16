import { useTradesPolling } from "@/hooks/use-bot";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { format } from "date-fns";

export function TradeHistory() {
  const { data, isLoading } = useTradesPolling();

  return (
    <div className="glass-panel rounded-2xl overflow-hidden flex flex-col h-full">
      <div className="p-6 border-b border-white/5 flex justify-between items-center bg-white/[0.01]">
        <h3 className="font-semibold text-lg">Trade History</h3>
        <span className="text-xs text-muted-foreground font-mono bg-white/5 px-2 py-1 rounded">Live</span>
      </div>
      
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground">Loading trades...</div>
        ) : !data?.trades || data.trades.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground italic">No trades executed yet</div>
        ) : (
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground font-mono sticky top-0 bg-card/95 backdrop-blur z-10 border-b border-white/5">
              <tr>
                <th className="px-6 py-3 font-medium">Time</th>
                <th className="px-6 py-3 font-medium">Side</th>
                <th className="px-6 py-3 font-medium">Price</th>
                <th className="px-6 py-3 font-medium text-right">Qty</th>
                <th className="px-6 py-3 font-medium text-right">Realized P&L</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.02]">
              {data.trades.map((trade) => (
                <tr key={trade.id} className="hover:bg-white/[0.02] transition-colors group">
                  <td className="px-6 py-3 font-mono text-muted-foreground whitespace-nowrap">
                    {format(new Date(trade.timestamp), "HH:mm:ss.SSS")}
                  </td>
                  <td className="px-6 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-bold ${
                      trade.type === 'BUY' ? 'bg-primary/10 text-primary border border-primary/20' : 'bg-warning/10 text-warning border border-warning/20'
                    }`}>
                      {trade.type}
                    </span>
                  </td>
                  <td className="px-6 py-3 font-mono text-foreground">
                    ${formatCurrency(trade.price)}
                  </td>
                  <td className="px-6 py-3 font-mono text-right text-muted-foreground">
                    {formatNumber(trade.quantity)}
                  </td>
                  <td className="px-6 py-3 font-mono text-right">
                    {trade.pnl != null ? (
                      <span className={trade.pnl >= 0 ? "text-success" : "text-destructive"}>
                        {trade.pnl >= 0 ? "+" : ""}${formatCurrency(trade.pnl)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
