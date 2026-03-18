import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useForm } from "react-hook-form";
import { BotConfig, BotConfigMode } from "@workspace/api-client-react";
import { useBotActions, useBotConfig } from "@/hooks/use-bot";
import { useToast } from "@/hooks/use-toast";
import { Settings, X, AlertTriangle, ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const TOP_TICKERS = [
  "BTC","ETH","SOL","HYPE","XRP","ZEC","TAO","BNB","ASTER","LIGHTER",
  "XAUT","XMR","PAXG","AAVE","1000PEPE","FARTCOIN","DOGE","SUI","ZRO","POLYX",
];

interface ConfigModalProps {
  isRunning: boolean;
}

export function ConfigModal({ isRunning }: ConfigModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [customTicker, setCustomTicker] = useState(false);
  const { data: config, isLoading } = useBotConfig();
  const { updateConfig, isUpdatingConfig } = useBotActions();
  const { toast } = useToast();

  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<BotConfig>();
  const watchMode = watch("mode");
  const watchTicker = watch("ticker");

  useEffect(() => {
    if (config) {
      reset(config);
      setCustomTicker(!TOP_TICKERS.includes(config.ticker));
    }
  }, [config, reset]);

  const onSubmit = async (data: BotConfig) => {
    try {
      const payload: BotConfig = {
        ticker: data.ticker.trim().toUpperCase(),
        gridLow: Number(data.gridLow),
        gridHigh: Number(data.gridHigh),
        gridCount: Number(data.gridCount),
        orderSizeUsdc: Number(data.orderSizeUsdc),
        initialBalance: Number(data.initialBalance),
        pollIntervalMs: Number(data.pollIntervalMs),
        mode: data.mode,
      };
      await updateConfig({ data: payload });
      toast({ title: "Konfigurasi Disimpan", description: "Pengaturan grid bot berhasil diperbarui." });
      setIsOpen(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Gagal menyimpan konfigurasi.";
      toast({ title: "Gagal", description: message, variant: "destructive" });
    }
  };

  const inputClass = (hasError?: boolean) =>
    `w-full bg-black/20 border ${hasError ? "border-destructive" : "border-white/10"} rounded-lg px-3 py-2 font-mono text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all disabled:opacity-50`;

  const modal = (
    <AnimatePresence>
      {isOpen && (
        <div key="modal-root">
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 9998, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
          />
          <div key="centering" style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem", pointerEvents: "none" }}>
            <motion.div
              key="panel"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              style={{ pointerEvents: "auto", width: "100%", maxWidth: "32rem", background: "#0f1117", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "1rem", boxShadow: "0 25px 50px rgba(0,0,0,0.6)", display: "flex", flexDirection: "column", maxHeight: "90vh" }}
            >
              {/* Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1.5rem 1.5rem 1rem", flexShrink: 0 }}>
                <h2 className="text-xl font-bold">Bot Configuration</h2>
                <button onClick={() => setIsOpen(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Scrollable body */}
              <div style={{ overflowY: "auto", padding: "0 1.5rem 1.5rem", flex: 1 }}>
                {isRunning && (
                  <div className="mb-5 p-4 bg-warning/10 border border-warning/20 rounded-xl flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
                    <p className="text-sm text-warning font-medium">
                      Bot sedang berjalan. Hentikan bot terlebih dahulu sebelum mengubah konfigurasi.
                    </p>
                  </div>
                )}

                {isLoading ? (
                  <div className="py-8 text-center text-muted-foreground">Memuat pengaturan...</div>
                ) : (
                  <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">

                    {/* Mode selector */}
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Trading Mode</label>
                      <div className="grid grid-cols-2 gap-2">
                        {(["paper", "live"] as BotConfigMode[]).map((m) => (
                          <button
                            key={m}
                            type="button"
                            disabled={isRunning}
                            onClick={() => setValue("mode", m)}
                            className={`py-2.5 rounded-lg border text-sm font-semibold transition-all disabled:opacity-50 ${
                              watchMode === m
                                ? m === "live"
                                  ? "bg-destructive/20 border-destructive text-destructive"
                                  : "bg-primary/20 border-primary text-primary"
                                : "bg-black/20 border-white/10 text-muted-foreground hover:border-white/20"
                            }`}
                          >
                            {m === "paper" ? "📋 Paper (Simulasi)" : "⚡ Live (Real)"}
                          </button>
                        ))}
                      </div>
                      {watchMode === "live" && (
                        <p className="text-xs text-destructive/80 mt-1">
                          ⚠️ Mode live akan menempatkan order nyata ke exchange menggunakan VR_TOKEN.
                        </p>
                      )}
                      <input type="hidden" {...register("mode", { required: true })} />
                    </div>

                    {/* Ticker */}
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Asset Ticker</label>
                      {!customTicker ? (
                        <div className="flex gap-2">
                          <div className="relative flex-1">
                            <select
                              value={TOP_TICKERS.includes(watchTicker ?? "") ? watchTicker : "BTC"}
                              onChange={(e) => setValue("ticker", e.target.value)}
                              disabled={isRunning}
                              className="w-full appearance-none bg-black/20 border border-white/10 rounded-lg px-3 py-2 font-mono text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all disabled:opacity-50 pr-8"
                            >
                              {TOP_TICKERS.map((t) => (
                                <option key={t} value={t}>{t}</option>
                              ))}
                            </select>
                            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                          </div>
                          <button
                            type="button"
                            disabled={isRunning}
                            onClick={() => setCustomTicker(true)}
                            className="px-3 py-2 bg-black/20 border border-white/10 rounded-lg text-xs text-muted-foreground hover:border-white/20 transition-all disabled:opacity-50"
                          >
                            Custom
                          </button>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <input
                            value={watchTicker ?? ""}
                            onChange={(e) => setValue("ticker", e.target.value.toUpperCase())}
                            placeholder="Contoh: ETH, SOL, DOGE"
                            disabled={isRunning}
                            className={`flex-1 ${inputClass(!!errors.ticker)}`}
                          />
                          <button
                            type="button"
                            disabled={isRunning}
                            onClick={() => { setCustomTicker(false); setValue("ticker", "BTC"); }}
                            className="px-3 py-2 bg-black/20 border border-white/10 rounded-lg text-xs text-muted-foreground hover:border-white/20 transition-all disabled:opacity-50"
                          >
                            List
                          </button>
                        </div>
                      )}
                      <input type="hidden" {...register("ticker", { required: true })} value={watchTicker ?? ""} readOnly />
                    </div>

                    {/* Grid Range */}
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Grid Range (USDC)</label>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-muted-foreground mb-1 block">Batas Bawah ($)</label>
                          <input
                            type="number" step="any"
                            {...register("gridLow", { required: true })}
                            disabled={isRunning}
                            className={inputClass(!!errors.gridLow)}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground mb-1 block">Batas Atas ($)</label>
                          <input
                            type="number" step="any"
                            {...register("gridHigh", { required: true })}
                            disabled={isRunning}
                            className={inputClass(!!errors.gridHigh)}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Grid Levels & Order Size */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Jumlah Level</label>
                        <input
                          type="number"
                          {...register("gridCount", { required: true, min: 2 })}
                          disabled={isRunning}
                          className={inputClass(!!errors.gridCount)}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Ukuran Order ($)</label>
                        <input
                          type="number" step="any"
                          {...register("orderSizeUsdc", { required: true, min: 1 })}
                          disabled={isRunning}
                          className={inputClass(!!errors.orderSizeUsdc)}
                        />
                      </div>
                    </div>

                    {/* Paper balance & interval */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Saldo Paper ($)</label>
                        <input
                          type="number" step="any"
                          {...register("initialBalance", { required: true })}
                          disabled={isRunning || watchMode === "live"}
                          className={inputClass(!!errors.initialBalance)}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Interval (ms)</label>
                        <input
                          type="number"
                          {...register("pollIntervalMs", { required: true, min: 1000 })}
                          disabled={isRunning}
                          className={inputClass(!!errors.pollIntervalMs)}
                        />
                      </div>
                    </div>

                    {/* Buttons */}
                    <div className="pt-2 flex justify-end gap-3">
                      <button
                        type="button"
                        onClick={() => setIsOpen(false)}
                        className="px-4 py-2 rounded-lg text-sm font-medium hover:bg-white/5 transition-colors"
                      >
                        Batal
                      </button>
                      <button
                        type="submit"
                        disabled={isRunning || isUpdatingConfig}
                        className="px-6 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-sm font-medium transition-colors disabled:opacity-50 shadow-[0_0_15px_rgba(6,182,212,0.3)] disabled:shadow-none"
                      >
                        {isUpdatingConfig ? "Menyimpan..." : "Simpan Konfigurasi"}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-sm font-medium transition-all"
      >
        <Settings className="w-4 h-4" />
        Configure
      </button>
      {createPortal(modal, document.body)}
    </>
  );
}
