"use client";

import type { TransactionItem, CategoryItem } from "@/types";
import CategoryPicker from "./CategoryPicker";

interface TransactionRowProps {
  transaction: TransactionItem;
  categories: CategoryItem[];
  selected: boolean;
  onSelect: (id: string) => void;
  onCategoryChange: (txId: string, categoryId: string) => void;
}

export default function TransactionRow({
  transaction: tx,
  categories,
  selected,
  onSelect,
  onCategoryChange,
}: TransactionRowProps) {
  const dateStr = new Date(tx.date).toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
  });

  const isDebit = tx.direction === "debit";
  const amountStr = `${isDebit ? "-" : "+"}$${Math.abs(tx.amount).toFixed(2)}`;

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 border-b border-surface-hover hover:bg-surface-hover/50 transition-colors ${
        tx.isExcluded ? "opacity-50" : ""
      } ${tx.isTransfer ? "opacity-60" : ""}`}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={() => onSelect(tx.id)}
        className="rounded border-surface-hover bg-background"
      />

      <span className="text-xs text-text-muted w-14 shrink-0">{dateStr}</span>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm text-foreground truncate">
            {tx.cleanDescription || tx.description}
          </p>
          {tx.isTransfer && (
            <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-accent/15 text-accent-light font-medium">
              Transfer
            </span>
          )}
        </div>
        {tx.merchantName &&
          tx.merchantName !== tx.cleanDescription && (
            <p className="text-xs text-text-muted truncate">
              {tx.merchantName}
            </p>
          )}
      </div>

      <CategoryPicker
        categories={categories}
        currentCategoryId={tx.categoryId}
        onSelect={(catId) => onCategoryChange(tx.id, catId)}
      />

      <span className="text-xs text-text-muted w-24 truncate text-right">
        {tx.accountName}
      </span>

      <span
        className={`text-sm font-mono font-medium w-24 text-right ${
          tx.isTransfer
            ? "text-text-muted"
            : isDebit
              ? "text-over-budget"
              : "text-on-track"
        }`}
      >
        {tx.isTransfer && "🔄 "}
        {amountStr}
      </span>
    </div>
  );
}
