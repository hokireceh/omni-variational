import { BotStatus } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/utils";
import { motion } from "framer-motion";

export function GridVisualizer({ status }: { status?: BotStatus }) {
  if (!status || !status.levels || status.levels.length === 0) {
    return (
      <div className="h-full min-h-[400px] flex items-center justify-center text-muted-foreground glass-panel rounded-2xl">
        Start bot untuk melihat grid levels
      </div>
    );
  }

  // Sort levels highest to lowest price
  const sortedLevels = [...status.levels].sort((a, b) => b.price - a.price);
  const currentPrice = status.currentPrice ?? 0;

  return (
    <div className="flex flex-col h-full glass-panel rounded-2xl p-6 relative overflow-hidden">
      <div className="flex items-center justify-between mb-6">
        <h3 className="font-semibold text-lg">Grid Structure</h3>
        <div className="flex gap-4 text-xs font-mono text-muted-foreground">
          <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-success"></div> Open Pos</span>
          <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-muted"></div> Empty</span>
        </div>
      </div>

      <div className="relative flex-1 overflow-y-auto pr-2 pb-4 space-y-1">
        {sortedLevels.map((level, idx) => {
          const isHighest = idx === 0;
          const isLowest = idx === sortedLevels.length - 1;
          
          // Determine if current price is just below this level
          const nextLevelPrice = sortedLevels[idx + 1]?.price ?? 0;
          const isCurrentPriceHere = currentPrice <= level.price && currentPrice > nextLevelPrice;

          return (
            <div key={level.price} className="relative">
              <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-white/[0.02] hover:bg-white/[0.04] transition-colors border border-transparent hover:border-white/5">
                <div className="flex items-center gap-3">
                  <div className={`w-2.5 h-2.5 rounded-full shadow-lg ${level.isOpen ? 'bg-success shadow-success/20' : 'bg-muted shadow-none'}`} />
                  <span className="font-mono text-sm">${formatCurrency(level.price)}</span>
                </div>
                
                <div className="flex items-center gap-4 text-xs font-mono">
                  {level.isOpen && (
                    <span className="text-muted-foreground">Hold: {level.quantity.toFixed(4)}</span>
                  )}
                  {level.realizedPnl !== 0 && (
                    <span className={level.realizedPnl > 0 ? "text-success" : "text-destructive"}>
                      {level.realizedPnl > 0 ? "+" : ""}${level.realizedPnl.toFixed(2)}
                    </span>
                  )}
                </div>
              </div>

              {/* Inject Current Price Line if it falls between this level and the next */}
              {isCurrentPriceHere && !isLowest && (
                <motion.div 
                  initial={{ opacity: 0, scaleX: 0.9 }}
                  animate={{ opacity: 1, scaleX: 1 }}
                  className="absolute left-0 right-0 z-10 flex items-center justify-center -bottom-3 translate-y-1/2"
                >
                  <div className="w-full h-px bg-primary shadow-[0_0_8px_var(--color-primary)] relative">
                    <div className="absolute right-2 -top-2.5 bg-primary text-primary-foreground text-xs font-mono font-bold px-2 py-0.5 rounded shadow-lg">
                      ${formatCurrency(currentPrice)}
                    </div>
                  </div>
                </motion.div>
              )}
            </div>
          );
        })}
        
        {/* Handle case where price is above the highest grid */}
        {currentPrice > sortedLevels[0].price && (
           <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-center -translate-y-4">
             <div className="w-full h-px bg-primary shadow-[0_0_8px_var(--color-primary)] relative">
               <div className="absolute right-2 -top-2.5 bg-primary text-primary-foreground text-xs font-mono font-bold px-2 py-0.5 rounded shadow-lg">
                 ${formatCurrency(currentPrice)}
               </div>
             </div>
           </div>
        )}
        
        {/* Handle case where price is below the lowest grid */}
        {currentPrice <= sortedLevels[sortedLevels.length - 1].price && (
           <div className="absolute bottom-0 left-0 right-0 z-10 flex items-center justify-center translate-y-4">
             <div className="w-full h-px bg-primary shadow-[0_0_8px_var(--color-primary)] relative">
               <div className="absolute right-2 -top-2.5 bg-primary text-primary-foreground text-xs font-mono font-bold px-2 py-0.5 rounded shadow-lg">
                 ${formatCurrency(currentPrice)}
               </div>
             </div>
           </div>
        )}
      </div>
    </div>
  );
}
