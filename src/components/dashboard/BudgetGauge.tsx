"use client";

import type { BudgetVsActual } from "@/types";

interface BudgetGaugeProps {
  item: BudgetVsActual;
}

export default function BudgetGauge({ item }: BudgetGaugeProps) {
  const percentage = Math.min(item.percentage, 150);
  const barWidth = Math.min(percentage, 100);

  const barColor =
    item.status === "over-budget"
      ? "bg-over-budget"
      : item.status === "warning"
        ? "bg-warning"
        : "bg-on-track";

  return (
    <div className="flex items-center gap-3 py-2">
      <span className="text-base w-6 shrink-0">{item.categoryIcon || "·"}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm text-foreground truncate">
            {item.categoryName}
          </span>
          <span className="text-xs text-text-muted ml-2 shrink-0">
            ${item.actualAmount.toFixed(0)} / ${item.budgetAmount.toFixed(0)}
            {item.status === "over-budget" && " ⚠️"}
          </span>
        </div>
        <div className="h-2 bg-background rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${barColor}`}
            style={{ width: `${barWidth}%` }}
          />
        </div>
      </div>
    </div>
  );
}
