"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { TransactionItem, CategoryItem, AccountSummary } from "@/types";
import TransactionList from "@/components/transactions/TransactionList";
import ImportStatus from "@/components/transactions/ImportStatus";

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Filters
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [accountFilter, setAccountFilter] = useState("");
  const [directionFilter, setDirectionFilter] = useState("");
  const [search, setSearch] = useState("");

  // Import
  const [importStatus, setImportStatus] = useState<
    "idle" | "uploading" | "success" | "error"
  >("idle");
  const [importMessage, setImportMessage] = useState("");
  const [importAccountId, setImportAccountId] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (fromDate) params.set("fromDate", fromDate);
    if (toDate) params.set("toDate", toDate);
    if (categoryFilter) params.set("categoryId", categoryFilter);
    if (accountFilter) params.set("accountId", accountFilter);
    if (directionFilter) params.set("direction", directionFilter);
    if (search) params.set("search", search);
    params.set("page", page.toString());
    params.set("pageSize", "50");

    try {
      const res = await fetch(`/api/transactions?${params}`);
      const data = await res.json();
      setTransactions(data.data || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
    } catch {
      console.error("Failed to fetch transactions");
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate, categoryFilter, accountFilter, directionFilter, search, page]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  useEffect(() => {
    async function fetchMeta() {
      const [catRes, accRes] = await Promise.all([
        fetch("/api/categories"),
        fetch("/api/accounts"),
      ]);
      const catData = await catRes.json();
      const accData = await accRes.json();
      setCategories(catData.categories || []);
      setAccounts(accData.accounts || []);
    }
    fetchMeta();
  }, []);

  async function handleCategoryChange(txId: string, categoryId: string) {
    await fetch("/api/transactions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: txId, categoryId }),
    });

    setTransactions((prev) =>
      prev.map((tx) => {
        if (tx.id !== txId) return tx;
        const cat = categories.find((c) => c.id === categoryId);
        return {
          ...tx,
          categoryId,
          categoryName: cat?.name || null,
          categoryIcon: cat?.icon || null,
          categoryColour: cat?.colour || null,
          categorySource: "manual",
        };
      })
    );
  }

  async function handleBulkCategorise(txIds: string[], categoryId: string) {
    await fetch("/api/transactions/bulk-categorise", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transactionIds: txIds, categoryId }),
    });

    const cat = categories.find((c) => c.id === categoryId);
    setTransactions((prev) =>
      prev.map((tx) => {
        if (!txIds.includes(tx.id)) return tx;
        return {
          ...tx,
          categoryId,
          categoryName: cat?.name || null,
          categoryIcon: cat?.icon || null,
          categoryColour: cat?.colour || null,
          categorySource: "manual",
        };
      })
    );
  }

  function triggerImport() {
    const targetAccount = importAccountId || (accounts.length === 1 ? accounts[0].id : "");
    if (!targetAccount) {
      setImportStatus("error");
      setImportMessage(
        accounts.length === 0
          ? "No accounts yet. Create one in Settings first."
          : "Please select an account to import into."
      );
      return;
    }
    fileInputRef.current?.click();
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const targetAccount = importAccountId || (accounts.length === 1 ? accounts[0].id : "");
    if (!targetAccount) {
      setImportStatus("error");
      setImportMessage("Please select an account to import into.");
      return;
    }

    setImportStatus("uploading");
    const formData = new FormData();
    formData.append("file", file);
    formData.append("accountId", targetAccount);

    try {
      const res = await fetch("/api/transactions/import", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        setImportStatus("success");
        setImportMessage(data.message);
        fetchTransactions();
      } else {
        setImportStatus("error");
        setImportMessage(data.error);
      }
    } catch {
      setImportStatus("error");
      setImportMessage("Import failed");
    }

    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Transactions</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-text-muted">
            {total} transaction{total !== 1 ? "s" : ""}
          </span>
          {accounts.length > 1 && (
            <select
              value={importAccountId}
              onChange={(e) => setImportAccountId(e.target.value)}
              className="bg-background border border-surface-hover rounded-lg px-2 py-1.5 text-sm text-foreground"
            >
              <option value="">Import to...</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleImport}
            className="hidden"
          />
          <button
            onClick={triggerImport}
            className="px-3 py-1.5 bg-accent hover:bg-accent-light text-white rounded-lg text-sm font-medium transition-colors"
          >
            Import CSV
          </button>
        </div>
      </div>

      <ImportStatus status={importStatus} message={importMessage} />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 bg-surface rounded-xl border border-surface-hover p-4">
        <input
          type="date"
          value={fromDate}
          onChange={(e) => { setFromDate(e.target.value); setPage(1); }}
          className="bg-background border border-surface-hover rounded-lg px-3 py-1.5 text-sm text-foreground"
          placeholder="From"
        />
        <input
          type="date"
          value={toDate}
          onChange={(e) => { setToDate(e.target.value); setPage(1); }}
          className="bg-background border border-surface-hover rounded-lg px-3 py-1.5 text-sm text-foreground"
          placeholder="To"
        />

        <select
          value={categoryFilter}
          onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
          className="bg-background border border-surface-hover rounded-lg px-3 py-1.5 text-sm text-foreground"
        >
          <option value="">All Categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.icon} {c.name}
            </option>
          ))}
        </select>

        <select
          value={accountFilter}
          onChange={(e) => { setAccountFilter(e.target.value); setPage(1); }}
          className="bg-background border border-surface-hover rounded-lg px-3 py-1.5 text-sm text-foreground"
        >
          <option value="">All Accounts</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>

        <select
          value={directionFilter}
          onChange={(e) => { setDirectionFilter(e.target.value); setPage(1); }}
          className="bg-background border border-surface-hover rounded-lg px-3 py-1.5 text-sm text-foreground"
        >
          <option value="">All Directions</option>
          <option value="debit">Expenses</option>
          <option value="credit">Income</option>
        </select>

        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search descriptions..."
          className="bg-background border border-surface-hover rounded-lg px-3 py-1.5 text-sm text-foreground flex-1 min-w-[200px]"
        />
      </div>

      {/* Transaction list */}
      <div className="bg-surface rounded-xl border border-surface-hover overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-text-muted">Loading...</div>
        ) : (
          <TransactionList
            transactions={transactions}
            categories={categories}
            onCategoryChange={handleCategoryChange}
            onBulkCategorise={handleBulkCategorise}
          />
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 bg-surface border border-surface-hover rounded-lg text-sm disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-sm text-text-muted">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-1.5 bg-surface border border-surface-hover rounded-lg text-sm disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
