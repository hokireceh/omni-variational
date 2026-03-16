import { ReactNode } from "react";
import { cn, formatCurrency } from "@/lib/utils";
import { motion } from "framer-motion";

interface StatCardProps {
  title: string;
  value: number | null | undefined;
  isCurrency?: boolean;
  icon?: ReactNode;
  trend?: "up" | "down" | "neutral";
  className?: string;
  loading?: boolean;
}

export function StatCard({ title, value, isCurrency = true, icon, trend = "neutral", className, loading }: StatCardProps) {
  const isPositive = (value ?? 0) > 0;
  const isNegative = (value ?? 0) < 0;
  
  const displayValue = isCurrency ? formatCurrency(value) : (value?.toString() ?? "—");
  
  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "relative overflow-hidden rounded-2xl p-6 glass-panel group transition-all duration-300 hover:border-white/10",
        className
      )}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
        {icon && <div className="text-muted-foreground/50 group-hover:text-primary transition-colors">{icon}</div>}
      </div>
      
      <div className="flex items-baseline gap-2">
        {loading ? (
          <div className="h-8 w-24 bg-white/5 rounded animate-pulse" />
        ) : (
          <span className={cn(
            "text-3xl font-bold font-mono tracking-tight",
            trend === "up" || isPositive ? "text-success" : "",
            trend === "down" || isNegative ? "text-destructive" : "",
            trend === "neutral" && !isPositive && !isNegative ? "text-foreground" : ""
          )}>
            {isPositive && trend !== "neutral" ? "+" : ""}
            {isCurrency ? "$" : ""}
            {displayValue}
          </span>
        )}
      </div>

      {/* Decorative gradient blob */}
      <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-primary/5 rounded-full blur-2xl group-hover:bg-primary/10 transition-colors" />
    </motion.div>
  );
}
