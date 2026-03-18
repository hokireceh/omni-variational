import { useBotPolling, useBotActions } from "@/hooks/use-bot";
import { StatCard } from "@/components/StatCard";
import { GridVisualizer } from "@/components/GridVisualizer";
import { TradeHistory } from "@/components/TradeHistory";
import { BotInfoBar } from "@/components/BotInfoBar";
import { ConfigModal } from "@/components/ConfigModal";
import { TokenModal } from "@/components/TokenModal";
import { Wallet, TrendingUp, Activity, PieChart, Power, RotateCcw, AlertTriangle } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

export default function Dashboard() {
  const { data: status, isLoading } = useBotPolling();
  const { startBot, stopBot, resetBot, isStarting, isStopping, isResetting } = useBotActions();

  const isRunning = status?.running ?? false;
  const isLive = status?.mode === "live";
  const liveDataAvailable = isLive && status?.liveBalanceUsdc != null;

  const handleTogglePower = () => {
    if (isRunning) stopBot();
    else startBot();
  };

  const handleReset = () => {
    if (window.confirm("Are you sure you want to reset the bot? This will stop it, clear all trades, and restore the initial balance.")) {
      resetBot();
    }
  };

  // Format uptime
  const formatUptime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-background text-foreground p-4 md:p-6 lg:p-8 max-w-[1600px] mx-auto space-y-6">
      
      {/* Header */}
      <header className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 glass-panel p-6 rounded-2xl relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent pointer-events-none" />
        
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gradient">Variational Grid Terminal</h1>
          <div className="flex items-center gap-3 mt-2">
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-black/40 border border-white/5">
              <div className={`w-2.5 h-2.5 rounded-full ${isRunning ? 'bg-success animate-pulse shadow-[0_0_10px_var(--color-success)]' : 'bg-muted'}`} />
              <span className="text-xs font-mono font-medium tracking-widest uppercase text-muted-foreground">
                {isRunning ? 'System Active' : 'System Offline'}
              </span>
            </div>
            {status?.currentPrice && (
              <span className="text-sm font-mono bg-primary/10 text-primary px-3 py-1 rounded-full border border-primary/20">
                {status.ticker} @ ${formatCurrency(status.currentPrice)}
              </span>
            )}
            {status && (
               <span className={`text-xs font-mono px-3 py-1 rounded-full border ${status.inRange ? 'bg-success/10 text-success border-success/20' : 'bg-destructive/10 text-destructive border-destructive/20'}`}>
                 {status.inRange ? 'IN RANGE' : 'OUT OF RANGE'}
               </span>
            )}
            {status && (
              <span className={`text-xs font-mono px-3 py-1 rounded-full border font-semibold ${
                isLive
                  ? 'bg-destructive/10 text-destructive border-destructive/30'
                  : 'bg-white/5 text-muted-foreground border-white/10'
              }`}>
                {isLive ? '⚡ LIVE' : '📋 PAPER'}
              </span>
            )}
            {status?.uptimeSeconds !== undefined && (
              <span className="text-xs font-mono text-muted-foreground">
                UP: {formatUptime(status.uptimeSeconds)}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 relative z-10">
          <TokenModal />
          <ConfigModal isRunning={isRunning} />
          
          <button
            onClick={handleReset}
            disabled={isResetting}
            className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-destructive/20 hover:text-destructive hover:border-destructive/30 border border-white/10 rounded-lg text-sm font-medium transition-all"
          >
            <RotateCcw className="w-4 h-4" />
            Reset
          </button>
          
          <button
            onClick={handleTogglePower}
            disabled={isStarting || isStopping}
            className={`flex items-center gap-2 px-6 py-2 rounded-lg text-sm font-bold tracking-wide uppercase transition-all shadow-lg
              ${isRunning 
                ? 'bg-destructive/10 text-destructive border border-destructive/30 hover:bg-destructive hover:text-white shadow-destructive/20' 
                : 'bg-primary hover:bg-primary/90 text-primary-foreground border border-transparent shadow-primary/30'
              } disabled:opacity-50`}
          >
            <Power className="w-4 h-4" />
            {isRunning ? 'Stop Bot' : 'Start Bot'}
          </button>
        </div>
      </header>

      {/* Live mode tapi data belum masuk (token invalid/CF block) */}
      {isLive && isRunning && !liveDataAvailable && (
        <div className="flex items-center gap-3 px-4 py-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-sm text-amber-300">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>Saldo live belum tersinkron — Cloudflare memblokir koneksi ke Variational. Gunakan tombol <strong>Token</strong> untuk update VR_TOKEN dari browser.</span>
        </div>
      )}

      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Account Balance"
          subtitle={isLive ? "Saldo Real (Variational)" : "Saldo Paper (Simulasi)"}
          value={isLive ? status?.liveBalanceUsdc : status?.balance}
          unavailable={isLive && status?.liveBalanceUsdc == null}
          icon={<Wallet className="w-5 h-5" />} 
          loading={isLoading}
        />
        <StatCard 
          title="Realized P&L"
          subtitle={isLive ? "Dari bot ini (live)" : "Dari bot ini (paper)"}
          value={status?.realizedPnl} 
          trend={status?.realizedPnl && status.realizedPnl !== 0 ? (status.realizedPnl > 0 ? "up" : "down") : "neutral"}
          icon={<TrendingUp className="w-5 h-5" />} 
          loading={isLoading}
        />
        <StatCard 
          title="Unrealized P&L"
          subtitle={isLive ? "Posisi terbuka (Variational)" : "Posisi terbuka (paper)"}
          value={isLive ? status?.liveUpnl : status?.unrealizedPnl}
          unavailable={isLive && status?.liveUpnl == null}
          trend={
            (isLive ? status?.liveUpnl : status?.unrealizedPnl) != null &&
            (isLive ? status?.liveUpnl : status?.unrealizedPnl) !== 0
              ? ((isLive ? status?.liveUpnl : status?.unrealizedPnl)! > 0 ? "up" : "down")
              : "neutral"
          }
          icon={<Activity className="w-5 h-5" />} 
          loading={isLoading}
        />
        <StatCard 
          title="Total P&L"
          subtitle={isLive ? "Realized + live UPnL" : "Realized + paper UPnL"}
          value={status?.totalPnl} 
          trend={status?.totalPnl && status.totalPnl !== 0 ? (status.totalPnl > 0 ? "up" : "down") : "neutral"}
          icon={<PieChart className="w-5 h-5" />} 
          loading={isLoading}
        />
      </div>

      {/* Main Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[600px]">
        {/* Left: Grid Vis (Spans 1 col on large) */}
        <div className="lg:col-span-1 h-full">
          <GridVisualizer status={status} />
        </div>
        
        {/* Right: Info & Trades (Spans 2 cols on large) */}
        <div className="lg:col-span-2 flex flex-col gap-6 h-full">
          <BotInfoBar status={status} />
          <div className="flex-1 min-h-0">
            <TradeHistory />
          </div>
        </div>
      </div>

    </div>
  );
}
