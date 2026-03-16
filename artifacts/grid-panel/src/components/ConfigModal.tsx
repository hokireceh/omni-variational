import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { BotConfig } from "@workspace/api-client-react";
import { useBotActions, useBotConfig } from "@/hooks/use-bot";
import { useToast } from "@/hooks/use-toast";
import { Settings, X, AlertTriangle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface ConfigModalProps {
  isRunning: boolean;
}

export function ConfigModal({ isRunning }: ConfigModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { data: config, isLoading } = useBotConfig();
  const { updateConfig, isUpdatingConfig } = useBotActions();
  const { toast } = useToast();

  const { register, handleSubmit, reset, formState: { errors } } = useForm<BotConfig>();

  // Reset form when config loads
  useEffect(() => {
    if (config) reset(config);
  }, [config, reset]);

  const onSubmit = async (data: BotConfig) => {
    try {
      // Coerce numeric values just to be safe
      const payload: BotConfig = {
        ticker: data.ticker,
        gridLow: Number(data.gridLow),
        gridHigh: Number(data.gridHigh),
        gridCount: Number(data.gridCount),
        orderSizeUsdc: Number(data.orderSizeUsdc),
        initialBalance: Number(data.initialBalance),
        pollIntervalMs: Number(data.pollIntervalMs),
      };
      
      await updateConfig({ data: payload });
      toast({ title: "Configuration Updated", description: "Grid bot settings saved successfully." });
      setIsOpen(false);
    } catch (err: any) {
      toast({ 
        title: "Update Failed", 
        description: err.message || "Failed to save configuration.",
        variant: "destructive"
      });
    }
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-sm font-medium transition-all"
      >
        <Settings className="w-4 h-4" />
        Configure
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md glass-panel rounded-2xl p-6 shadow-2xl border border-white/10"
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold">Bot Configuration</h2>
                <button onClick={() => setIsOpen(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {isRunning && (
                <div className="mb-6 p-4 bg-warning/10 border border-warning/20 rounded-xl flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
                  <p className="text-sm text-warning font-medium">
                    The bot is currently running. You must stop the bot before updating its configuration.
                  </p>
                </div>
              )}

              {isLoading ? (
                <div className="py-8 text-center text-muted-foreground">Loading settings...</div>
              ) : (
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Ticker</label>
                      <input 
                        {...register("ticker", { required: true })} 
                        disabled={isRunning}
                        className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 font-mono text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all disabled:opacity-50"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Interval (ms)</label>
                      <input 
                        type="number" 
                        {...register("pollIntervalMs", { required: true, min: 1000 })} 
                        disabled={isRunning}
                        className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 font-mono text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all disabled:opacity-50"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Grid Low ($)</label>
                      <input 
                        type="number" step="any"
                        {...register("gridLow", { required: true })} 
                        disabled={isRunning}
                        className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 font-mono text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all disabled:opacity-50"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Grid High ($)</label>
                      <input 
                        type="number" step="any"
                        {...register("gridHigh", { required: true })} 
                        disabled={isRunning}
                        className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 font-mono text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all disabled:opacity-50"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Grid Levels</label>
                      <input 
                        type="number" 
                        {...register("gridCount", { required: true, min: 2 })} 
                        disabled={isRunning}
                        className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 font-mono text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all disabled:opacity-50"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Order Size ($)</label>
                      <input 
                        type="number" step="any"
                        {...register("orderSizeUsdc", { required: true, min: 1 })} 
                        disabled={isRunning}
                        className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 font-mono text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all disabled:opacity-50"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Initial Paper Balance ($)</label>
                    <input 
                      type="number" step="any"
                      {...register("initialBalance", { required: true })} 
                      disabled={isRunning}
                      className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 font-mono text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all disabled:opacity-50"
                    />
                  </div>

                  <div className="pt-4 flex justify-end gap-3">
                    <button 
                      type="button" 
                      onClick={() => setIsOpen(false)}
                      className="px-4 py-2 rounded-lg text-sm font-medium hover:bg-white/5 transition-colors"
                    >
                      Cancel
                    </button>
                    <button 
                      type="submit" 
                      disabled={isRunning || isUpdatingConfig}
                      className="px-6 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-sm font-medium transition-colors disabled:opacity-50 shadow-[0_0_15px_rgba(6,182,212,0.3)] disabled:shadow-none"
                    >
                      {isUpdatingConfig ? "Saving..." : "Save Configuration"}
                    </button>
                  </div>
                </form>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
