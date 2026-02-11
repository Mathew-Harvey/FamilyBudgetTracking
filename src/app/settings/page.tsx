"use client";

import { useState, useEffect } from "react";
import Card from "@/components/shared/Card";
import type { CategoryItem, AccountSummary } from "@/types";

export default function SettingsPage() {
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Account form
  const [newAccName, setNewAccName] = useState("");
  const [newAccInstitution, setNewAccInstitution] = useState("ING");
  const [newAccType, setNewAccType] = useState("transaction");
  const [showAccForm, setShowAccForm] = useState(false);

  // Account editing
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [editBalance, setEditBalance] = useState("");
  const [editName, setEditName] = useState("");

  // Category form
  const [newCatName, setNewCatName] = useState("");
  const [newCatIcon, setNewCatIcon] = useState("");
  const [newCatColour, setNewCatColour] = useState("#3B82F6");

  useEffect(() => {
    async function fetchData() {
      try {
        const [accRes, catRes] = await Promise.all([
          fetch("/api/accounts"),
          fetch("/api/categories"),
        ]);
        const accData = await accRes.json();
        const catData = await catRes.json();
        setAccounts(accData.accounts || []);
        setCategories(catData.categories || []);
      } catch (err) {
        console.error("Settings fetch error:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  async function handleAddAccount(e: React.FormEvent) {
    e.preventDefault();
    if (!newAccName.trim()) return;

    const res = await fetch("/api/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newAccName,
        institution: newAccInstitution,
        type: newAccType,
      }),
    });
    const data = await res.json();
    if (data.account) {
      setAccounts((prev) => [...prev, data.account]);
      setNewAccName("");
      setShowAccForm(false);
    }
  }

  function startEditAccount(acc: AccountSummary) {
    setEditingAccountId(acc.id);
    setEditBalance(acc.balance.toFixed(2));
    setEditName(acc.name);
  }

  async function handleSaveAccount(id: string) {
    const balanceNum = parseFloat(editBalance);
    if (isNaN(balanceNum)) return;

    const res = await fetch("/api/accounts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        name: editName || undefined,
        balance: balanceNum,
      }),
    });
    const data = await res.json();
    if (data.account) {
      setAccounts((prev) =>
        prev.map((a) => (a.id === id ? { ...a, ...data.account } : a))
      );
    }
    setEditingAccountId(null);
  }

  async function handleDeleteAccount(id: string) {
    const confirmed = window.confirm(
      "Delete this account? This only works if the account has no transactions."
    );
    if (!confirmed) return;

    const res = await fetch(`/api/accounts?id=${id}`, { method: "DELETE" });
    const data = await res.json();
    if (data.success) {
      setAccounts((prev) => prev.filter((a) => a.id !== id));
    } else {
      alert(data.error || "Failed to delete account");
    }
  }

  async function handleAddCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!newCatName.trim()) return;

    const res = await fetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newCatName,
        icon: newCatIcon || null,
        colour: newCatColour,
      }),
    });
    const data = await res.json();
    if (data.category) {
      setCategories((prev) => [...prev, data.category]);
      setNewCatName("");
      setNewCatIcon("");
    }
  }

  async function handleDeleteCategory(id: string) {
    const confirmed = window.confirm(
      "Delete this category? Transactions will become uncategorised."
    );
    if (!confirmed) return;

    await fetch(`/api/categories?id=${id}`, { method: "DELETE" });
    setCategories((prev) => prev.filter((c) => c.id !== id));
  }

  // AI recategorise
  const [aiRunning, setAiRunning] = useState(false);
  const [aiResult, setAiResult] = useState<string | null>(null);

  async function handleRecategorise() {
    setAiRunning(true);
    setAiResult(null);
    try {
      const res = await fetch("/api/transactions/recategorise", {
        method: "POST",
      });
      const data = await res.json();
      if (data.error) {
        setAiResult(`Error: ${data.error}`);
      } else {
        setAiResult(data.message);
      }
    } catch {
      setAiResult("Failed to run AI categorisation");
    } finally {
      setAiRunning(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px] text-text-muted">
        Loading settings...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      {/* Accounts */}
      <Card
        title="Accounts"
        action={
          <button
            onClick={() => setShowAccForm(!showAccForm)}
            className="px-3 py-1.5 bg-accent hover:bg-accent-light text-white rounded-lg text-sm font-medium transition-colors"
          >
            {showAccForm ? "Cancel" : "Add Account"}
          </button>
        }
      >
        {showAccForm && (
          <form
            onSubmit={handleAddAccount}
            className="flex flex-wrap items-end gap-3 mb-4 pb-4 border-b border-surface-hover"
          >
            <div className="flex-1 min-w-[160px]">
              <label className="block text-xs text-text-muted mb-1">
                Account Name
              </label>
              <input
                type="text"
                value={newAccName}
                onChange={(e) => setNewAccName(e.target.value)}
                placeholder="e.g. Everyday Account"
                required
                className="w-full bg-background border border-surface-hover rounded-lg px-3 py-1.5 text-sm text-foreground"
              />
            </div>
            <div className="min-w-[120px]">
              <label className="block text-xs text-text-muted mb-1">
                Institution
              </label>
              <input
                type="text"
                value={newAccInstitution}
                onChange={(e) => setNewAccInstitution(e.target.value)}
                placeholder="e.g. ING"
                className="w-full bg-background border border-surface-hover rounded-lg px-3 py-1.5 text-sm text-foreground"
              />
            </div>
            <div className="min-w-[120px]">
              <label className="block text-xs text-text-muted mb-1">Type</label>
              <select
                value={newAccType}
                onChange={(e) => setNewAccType(e.target.value)}
                className="w-full bg-background border border-surface-hover rounded-lg px-3 py-1.5 text-sm text-foreground"
              >
                <option value="transaction">Transaction / Everyday</option>
                <option value="savings">Savings</option>
                <option value="credit">Credit Card</option>
                <option value="loan">Home Loan / Mortgage</option>
                <option value="personal-loan">Personal Loan</option>
              </select>
            </div>
            <button
              type="submit"
              className="px-4 py-1.5 bg-on-track hover:bg-on-track/80 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Create
            </button>
          </form>
        )}

        <p className="text-xs text-text-muted mb-3">
          Click an account to edit its balance. Balances update automatically on CSV import if the file includes a Balance column.
        </p>

        {accounts.length === 0 && !showAccForm ? (
          <div className="text-center py-6 text-text-muted text-sm">
            <p>No accounts yet.</p>
            <p className="mt-1">
              Click &ldquo;Add Account&rdquo; to create one (e.g. your ING
              Everyday account), then import CSV transactions.
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {accounts.map((acc) => (
              <div key={acc.id}>
                {editingAccountId === acc.id ? (
                  /* Editing mode */
                  <div className="bg-background rounded-lg p-3 border border-accent/30">
                    <div className="flex flex-wrap items-end gap-3">
                      <div className="flex-1 min-w-[140px]">
                        <label className="block text-xs text-text-muted mb-1">Name</label>
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="w-full bg-surface border border-surface-hover rounded-lg px-3 py-1.5 text-sm text-foreground"
                        />
                      </div>
                      <div className="w-[160px]">
                        <label className="block text-xs text-text-muted mb-1">Balance ($)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={editBalance}
                          onChange={(e) => setEditBalance(e.target.value)}
                          className="w-full bg-surface border border-surface-hover rounded-lg px-3 py-1.5 text-sm text-foreground font-mono"
                        />
                      </div>
                      <button
                        onClick={() => handleSaveAccount(acc.id)}
                        className="px-3 py-1.5 bg-on-track hover:bg-on-track/80 text-white rounded-lg text-sm font-medium transition-colors"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingAccountId(null)}
                        className="px-3 py-1.5 bg-surface-hover text-text-muted rounded-lg text-sm transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                    <p className="text-xs text-text-muted mt-2">
                      Set the balance to match your bank. Use negative for loans (e.g. -12695.05).
                    </p>
                  </div>
                ) : (
                  /* Display mode */
                  <div
                    className="flex items-center justify-between py-3 px-2 rounded-lg border-b border-surface-hover last:border-0 hover:bg-surface-hover/30 cursor-pointer transition-colors"
                    onClick={() => startEditAccount(acc)}
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {acc.name}
                      </p>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs text-text-muted">
                          {acc.institutionName}
                        </span>
                        <span className="text-xs text-text-muted capitalize">
                          {acc.type.replace("-", " ")}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-sm font-mono font-medium ${
                        acc.balance >= 0 ? "text-foreground" : "text-over-budget"
                      }`}>
                        ${acc.balance.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteAccount(acc.id);
                        }}
                        className="text-xs text-text-muted hover:text-over-budget transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* AI Tools */}
      <Card title="AI Tools (Claude)">
        <div className="space-y-4">
          <div>
            <p className="text-sm text-foreground font-medium mb-1">
              Re-categorise All Transactions
            </p>
            <p className="text-xs text-text-muted mb-3">
              Run Claude AI on all transactions to categorise them, detect
              transfers, and clean up descriptions. Previously manually
              categorised transactions will be preserved.
            </p>
            <button
              onClick={handleRecategorise}
              disabled={aiRunning}
              className="px-4 py-2 bg-accent hover:bg-accent-light text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-wait"
            >
              {aiRunning ? "Running AI..." : "Run AI Categorisation"}
            </button>
            {aiResult && (
              <p
                className={`mt-2 text-sm ${
                  aiResult.startsWith("Error")
                    ? "text-over-budget"
                    : "text-on-track"
                }`}
              >
                {aiResult}
              </p>
            )}
          </div>
        </div>
      </Card>

      {/* Categories */}
      <Card title="Categories">
        <div className="space-y-4">
          {/* Add category form */}
          <form
            onSubmit={handleAddCategory}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={newCatIcon}
              onChange={(e) => setNewCatIcon(e.target.value)}
              placeholder="Icon"
              className="w-12 bg-background border border-surface-hover rounded-lg px-2 py-1.5 text-sm text-foreground text-center"
            />
            <input
              type="text"
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              placeholder="Category name"
              className="flex-1 bg-background border border-surface-hover rounded-lg px-3 py-1.5 text-sm text-foreground"
            />
            <input
              type="color"
              value={newCatColour}
              onChange={(e) => setNewCatColour(e.target.value)}
              className="w-8 h-8 rounded border border-surface-hover cursor-pointer"
            />
            <button
              type="submit"
              className="px-3 py-1.5 bg-accent text-white rounded-lg text-sm"
            >
              Add
            </button>
          </form>

          {/* Category list */}
          <div className="space-y-1">
            {categories.map((cat) => (
              <div
                key={cat.id}
                className="flex items-center justify-between py-2 px-2 rounded-lg hover:bg-surface-hover/50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: cat.colour || "#6B7280" }}
                  />
                  <span className="text-sm">{cat.icon || "·"}</span>
                  <span className="text-sm text-foreground">{cat.name}</span>
                  {cat.isSystem && (
                    <span className="text-xs text-text-muted">(system)</span>
                  )}
                </div>
                {!cat.isSystem && (
                  <button
                    onClick={() => handleDeleteCategory(cat.id)}
                    className="text-xs text-text-muted hover:text-over-budget transition-colors"
                  >
                    Delete
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}
