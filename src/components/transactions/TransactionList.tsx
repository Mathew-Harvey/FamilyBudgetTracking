"use client";

import { useState, useCallback } from "react";
import type { TransactionItem, CategoryItem } from "@/types";
import TransactionRow from "./TransactionRow";

interface TransactionListProps {
  transactions: TransactionItem[];
  categories: CategoryItem[];
  onCategoryChange: (txId: string, categoryId: string) => void;
  onBulkCategorise: (txIds: string[], categoryId: string) => void;
}

export default function TransactionList({
  transactions,
  categories,
  onCategoryChange,
  onBulkCategorise,
}: TransactionListProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkCategoryId, setBulkCategoryId] = useState<string>("");

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    if (selectedIds.size === transactions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(transactions.map((t) => t.id)));
    }
  }, [selectedIds.size, transactions]);

  function handleBulkAction() {
    if (selectedIds.size === 0 || !bulkCategoryId) return;
    onBulkCategorise(Array.from(selectedIds), bulkCategoryId);
    setSelectedIds(new Set());
    setBulkCategoryId("");
  }

  if (transactions.length === 0) {
    return (
      <div className="text-center py-12 text-text-muted">
        <p className="text-lg mb-2">No transactions found</p>
        <p className="text-sm">
          Try adjusting your filters or connect a bank account to sync
          transactions.
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Bulk actions bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2 bg-accent/10 border border-accent/20 rounded-lg mb-3">
          <span className="text-sm text-accent-light">
            {selectedIds.size} selected
          </span>
          <select
            value={bulkCategoryId}
            onChange={(e) => setBulkCategoryId(e.target.value)}
            className="bg-surface border border-surface-hover rounded px-2 py-1 text-sm text-foreground"
          >
            <option value="">Assign category...</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon} {c.name}
              </option>
            ))}
          </select>
          <button
            onClick={handleBulkAction}
            disabled={!bulkCategoryId}
            className="px-3 py-1 bg-accent text-white rounded text-sm disabled:opacity-50"
          >
            Apply
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="px-3 py-1 text-text-muted hover:text-foreground text-sm"
          >
            Clear
          </button>
        </div>
      )}

      {/* Header row */}
      <div className="flex items-center gap-3 px-4 py-2 text-xs text-text-muted uppercase tracking-wider border-b border-surface-hover">
        <input
          type="checkbox"
          checked={selectedIds.size === transactions.length}
          onChange={toggleAll}
          className="rounded border-surface-hover bg-background"
        />
        <span className="w-14">Date</span>
        <span className="flex-1">Description</span>
        <span className="w-28">Category</span>
        <span className="w-24 text-right">Account</span>
        <span className="w-24 text-right">Amount</span>
      </div>

      {/* Transaction rows */}
      {transactions.map((tx) => (
        <TransactionRow
          key={tx.id}
          transaction={tx}
          categories={categories}
          selected={selectedIds.has(tx.id)}
          onSelect={toggleSelect}
          onCategoryChange={onCategoryChange}
        />
      ))}
    </div>
  );
}
