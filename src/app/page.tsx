"use client";

import { useState, useEffect, useCallback } from "react";
import Card from "@/components/shared/Card";
import AnimatedNumber from "@/components/shared/AnimatedNumber";
import BudgetGauge from "@/components/dashboard/BudgetGauge";
import {
  IncomeExpenseChart,
  WeeklySpendChart,
  CategoryDonutChart,
  DailySpendChart,
  PerformanceChart,
  ScoreRing,
} from "@/components/dashboard/Charts";
import type { BudgetVsActual, TransactionItem, AccountSummary } from "@/types";
import Link from "next/link";

interface PeriodSummary {
  totalIncome: number;
  totalExpenses: number;
  totalSavings: number;
  totalMortgage: number;
  net: number;
}

interface AIInsight {
  type: "positive" | "warning" | "tip" | "info" | "lifestyle";
  title: string;
  detail: string;
}

interface LifeEvent {
  type: string;
  title: string;
  estimatedCost: number;
  period: string;
  note: string;
}

interface AIInsightsData {
  summary?: string;
  insights?: AIInsight[];
  spendingScore?: number;
  regularSpendingScore?: number;
  topTip?: string;
  salaryDetection?: {
    detected: boolean;
    amount: number;
    frequency: string;
    description: string;
  };
  lifeEvents?: LifeEvent[];
}

interface AnalyticsData {
  monthlyTrend: Array<{
    month: string;
    label: string;
    income: number;
    expenses: number;
    savings: number;
    loans: number;
    net: number;
  }>;
  weeklySpend: Array<{ label: string; amount: number }>;
  categoryBreakdown: Array<{
    name: string;
    amount: number;
    colour: string;
    icon: string;
    percentage: number;
    count: number;
  }>;
  salaryInfo: {
    detected: boolean;
    amount: number;
    frequency: string;
    source: string;
    lastPaid: string;
    description: string;
  };
  largeExpenses: Array<{
    description: string;
    amount: number;
    date: string;
    category: string;
    account: string;
  }>;
  dailySpend: Array<{
    date: string;
    label: string;
    amount: number;
    cumulative: number;
  }>;
  performance: {
    currentScore: number;
    previousScore: number;
    trend: string;
    monthlyScores: Array<{ month: string; score: number }>;
  };
  accounts: Array<{
    name: string;
    type: string;
    institution: string | null;
    balance: number;
  }>;
}

export default function DashboardPage() {
  const [budgetActuals, setBudgetActuals] = useState<BudgetVsActual[]>([]);
  const [recentTransactions, setRecentTransactions] = useState<TransactionItem[]>([]);
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [summary, setSummary] = useState<PeriodSummary>({
    totalIncome: 0, totalExpenses: 0, totalSavings: 0, totalMortgage: 0, net: 0,
  });
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [loading, setLoading] = useState(true);

  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [insights, setInsights] = useState<AIInsightsData | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);

  const fetchDashboardData = useCallback(async () => {
    try {
      const [actualsRes, txRes, accountsRes, analyticsRes] = await Promise.all([
        fetch("/api/budgets/actuals"),
        fetch("/api/transactions?pageSize=10"),
        fetch("/api/accounts"),
        fetch("/api/analytics"),
      ]);

      const [actualsData, txData, accountsData, analyticsData] = await Promise.all([
        actualsRes.json(),
        txRes.json(),
        accountsRes.json(),
        analyticsRes.json(),
      ]);

      setBudgetActuals(actualsData.actuals || []);
      setSummary(actualsData.summary || {
        totalIncome: 0, totalExpenses: 0, totalSavings: 0, totalMortgage: 0, net: 0,
      });
      setPeriodStart(actualsData.periodStart || "");
      setPeriodEnd(actualsData.periodEnd || "");
      setRecentTransactions(txData.data || []);
      setAccounts(accountsData.accounts || []);

      if (!analyticsData.error) {
        setAnalytics(analyticsData);
      }
    } catch (err) {
      console.error("Dashboard fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchInsights = useCallback(async () => {
    setInsightsLoading(true);
    try {
      const res = await fetch("/api/insights");
      const data = await res.json();
      if (!data.error) {
        setInsights(data);
      }
    } catch (err) {
      console.error("Insights fetch error:", err);
    } finally {
      setInsightsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  useEffect(() => {
    if (!loading && recentTransactions.length > 0) {
      fetchInsights();
    }
  }, [loading, recentTransactions.length, fetchInsights]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px] text-text-muted">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p>Loading dashboard...</p>
        </div>
      </div>
    );
  }

  const periodLabel = periodStart && periodEnd
    ? `${new Date(periodStart).toLocaleDateString("en-AU", { day: "2-digit", month: "short" })} — ${new Date(periodEnd).toLocaleDateString("en-AU", { day: "2-digit", month: "short" })}`
    : "This Fortnight";

  const insightIcon = (type: string) => {
    switch (type) {
      case "positive": return "✅";
      case "warning": return "⚠️";
      case "tip": return "💡";
      case "info": return "ℹ️";
      case "lifestyle": return "🌴";
      default: return "·";
    }
  };

  const insightBorder = (type: string) => {
    switch (type) {
      case "positive": return "border-l-emerald-500";
      case "warning": return "border-l-amber-500";
      case "tip": return "border-l-blue-500";
      case "info": return "border-l-gray-400";
      case "lifestyle": return "border-l-purple-500";
      default: return "border-l-gray-400";
    }
  };

  const trendArrow = (trend: string) => {
    if (trend === "improving") return { icon: "↑", color: "text-on-track", label: "Improving" };
    if (trend === "declining") return { icon: "↓", color: "text-over-budget", label: "Declining" };
    return { icon: "→", color: "text-text-muted", label: "Stable" };
  };

  const hasData = recentTransactions.length > 0;
  const salary = insights?.salaryDetection || analytics?.salaryInfo;

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-text-muted">{periodLabel}</p>
        </div>
        {salary?.detected && (
          <div className="text-right">
            <p className="text-xs text-text-muted">Detected Salary</p>
            <p className="text-sm font-medium text-on-track">
              ${salary.amount.toLocaleString()} {salary.frequency}
            </p>
            {salary.description && (
              <p className="text-xs text-text-muted">{salary.description}</p>
            )}
          </div>
        )}
      </div>

      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card title="Income">
          <AnimatedNumber value={summary.totalIncome} prefix="$" className="text-2xl font-bold text-on-track" />
          <p className="text-xs text-text-muted mt-1">This period</p>
        </Card>
        <Card title="Expenses">
          <AnimatedNumber value={summary.totalExpenses} prefix="$" className="text-2xl font-bold text-over-budget" />
          <p className="text-xs text-text-muted mt-1">Real spending</p>
        </Card>
        <Card title="Saved / Transferred">
          <AnimatedNumber value={summary.totalSavings + summary.totalMortgage} prefix="$" className="text-2xl font-bold text-accent-light" />
          <p className="text-xs text-text-muted mt-1">
            {summary.totalSavings > 0 && `$${summary.totalSavings.toLocaleString()} savings`}
            {summary.totalSavings > 0 && summary.totalMortgage > 0 && " + "}
            {summary.totalMortgage > 0 && `$${summary.totalMortgage.toLocaleString()} loans`}
          </p>
        </Card>
        <Card title="Net Position">
          <AnimatedNumber
            value={summary.net}
            prefix="$"
            className={`text-2xl font-bold ${summary.net >= 0 ? "text-on-track" : "text-over-budget"}`}
          />
          <p className="text-xs text-text-muted mt-1">Income minus expenses</p>
        </Card>
      </div>

      {/* ── Income vs Expenses Trend ── */}
      {analytics && analytics.monthlyTrend.length > 1 && (
        <Card title="Income vs Expenses — Monthly Trend">
          <IncomeExpenseChart data={analytics.monthlyTrend} />
        </Card>
      )}

      {/* ── Charts Row: Weekly Spend + Category Breakdown ── */}
      {hasData && analytics && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {analytics.weeklySpend.length > 0 && (
            <Card title="Weekly Spending">
              <WeeklySpendChart data={analytics.weeklySpend} />
            </Card>
          )}
          {analytics.categoryBreakdown.length > 0 && (
            <Card title="Where Your Money Goes (90 days)">
              <CategoryDonutChart data={analytics.categoryBreakdown} />
            </Card>
          )}
        </div>
      )}

      {/* ── This Month Daily Cumulative + Performance ── */}
      {analytics && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {analytics.dailySpend.length > 1 && (
            <Card title={`Spending This Month — ${new Date().toLocaleDateString("en-AU", { month: "long" })}`}>
              <DailySpendChart data={analytics.dailySpend} />
              <div className="flex justify-between mt-2 text-xs text-text-muted">
                <span>Day 1</span>
                <span className="font-medium text-foreground">
                  Total: ${analytics.dailySpend[analytics.dailySpend.length - 1]?.cumulative.toLocaleString() || 0}
                </span>
                <span>Today</span>
              </div>
            </Card>
          )}

          {/* Performance Scores */}
          {analytics.performance.monthlyScores.length > 0 && (
            <Card title="Financial Performance">
              <div className="flex items-center gap-6 mb-4">
                <div className="relative">
                  <ScoreRing score={analytics.performance.currentScore} label="Current" size={90} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-lg font-bold ${trendArrow(analytics.performance.trend).color}`}>
                      {trendArrow(analytics.performance.trend).icon}
                    </span>
                    <span className={`text-sm font-medium ${trendArrow(analytics.performance.trend).color}`}>
                      {trendArrow(analytics.performance.trend).label}
                    </span>
                  </div>
                  <p className="text-xs text-text-muted">
                    Previous month: {analytics.performance.previousScore}/100
                  </p>
                  {insights?.regularSpendingScore !== undefined && (
                    <p className="text-xs text-text-muted mt-1">
                      Regular spending score: <span className="text-foreground font-medium">{insights.regularSpendingScore}/100</span>
                      <span className="text-text-muted ml-1">(excl. one-offs)</span>
                    </p>
                  )}
                </div>
              </div>
              {analytics.performance.monthlyScores.length > 1 && (
                <PerformanceChart data={analytics.performance.monthlyScores} />
              )}
            </Card>
          )}
        </div>
      )}

      {/* ── Life Events (detected by AI) ── */}
      {insights?.lifeEvents && insights.lifeEvents.length > 0 && (
        <Card title="Life Events Detected">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {insights.lifeEvents.map((event, i) => {
              const eventIcon = event.type === "refinancing" ? "🏦" : event.type === "renovation" ? "🏠" : event.type === "holiday" ? "✈️" : event.type === "major_purchase" ? "🛒" : "📌";
              return (
                <div key={i} className="bg-background rounded-lg p-3 border border-surface-hover">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">{eventIcon}</span>
                    <span className="text-sm font-medium text-foreground">{event.title}</span>
                  </div>
                  <p className="text-xs text-text-muted">{event.note}</p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-text-muted">{event.period}</span>
                    <span className="text-sm font-mono font-medium text-foreground">
                      ${event.estimatedCost.toLocaleString()}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* ── AI Insights ── */}
      <Card
        title={
          insights?.spendingScore !== undefined
            ? `AI Financial Analysis — Score: ${insights.spendingScore}/100`
            : "AI Financial Analysis"
        }
        action={
          <button
            onClick={fetchInsights}
            disabled={insightsLoading}
            className="text-xs text-accent-light hover:underline disabled:opacity-50"
          >
            {insightsLoading ? "Analysing..." : "Refresh Analysis"}
          </button>
        }
      >
        {insightsLoading && !insights ? (
          <div className="py-8 text-center text-text-muted text-sm">
            <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p>Claude is analysing your finances...</p>
          </div>
        ) : insights ? (
          <div className="space-y-4">
            {/* Summary */}
            {insights.summary && (
              <p className="text-sm text-foreground leading-relaxed pb-3 border-b border-surface-hover">
                {insights.summary}
              </p>
            )}

            {/* Insights grid */}
            {insights.insights && insights.insights.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {insights.insights.map((insight, i) => (
                  <div
                    key={i}
                    className={`border-l-2 ${insightBorder(insight.type)} pl-3 py-2`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm">{insightIcon(insight.type)}</span>
                      <span className="text-sm font-medium text-foreground">{insight.title}</span>
                    </div>
                    <p className="text-xs text-text-muted mt-0.5 leading-relaxed">{insight.detail}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Top tip */}
            {insights.topTip && (
              <div className="bg-accent/10 rounded-lg p-3">
                <p className="text-xs font-medium text-accent-light mb-0.5">Top Tip</p>
                <p className="text-sm text-foreground">{insights.topTip}</p>
              </div>
            )}
          </div>
        ) : hasData ? (
          <div className="text-center py-6 text-text-muted text-sm">
            <p>Click &ldquo;Refresh Analysis&rdquo; to get AI-powered financial insights.</p>
          </div>
        ) : (
          <div className="text-center py-6 text-text-muted text-sm">
            <p>Import transactions to unlock AI insights.</p>
          </div>
        )}
      </Card>

      {/* ── Budget Status + Accounts Row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title={`Budget Status (${periodLabel})`}>
          {budgetActuals.length === 0 ? (
            <div className="text-center py-6 text-text-muted text-sm">
              <p>No budgets set up yet.</p>
              <p className="mt-1">
                Create budgets in{" "}
                <Link href="/settings" className="text-accent-light hover:underline">Settings</Link>{" "}
                to track your spending.
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {budgetActuals.map((item) => (
                <BudgetGauge key={item.categoryId} item={item} />
              ))}
            </div>
          )}
        </Card>

        <Card title="Accounts">
          {accounts.length === 0 ? (
            <div className="text-center py-6 text-text-muted text-sm">
              <p>No accounts yet.</p>
              <p className="mt-1">
                <Link href="/settings" className="text-accent-light hover:underline">Add an account</Link>{" "}
                to start importing transactions.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {accounts.map((acc) => (
                <div
                  key={acc.id}
                  className="flex items-center justify-between py-2 border-b border-surface-hover last:border-0"
                >
                  <div>
                    <p className="text-sm text-foreground">{acc.name}</p>
                    <p className="text-xs text-text-muted">
                      {acc.institutionName} · <span className="capitalize">{acc.type}</span>
                    </p>
                  </div>
                  <span className={`text-sm font-mono font-medium ${
                    acc.balance >= 0 ? "text-foreground" : "text-over-budget"
                  }`}>
                    ${acc.balance.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* ── Large / Notable Expenses ── */}
      {analytics && analytics.largeExpenses.length > 0 && (
        <Card title="Notable Expenses">
          <div className="space-y-2">
            {analytics.largeExpenses.slice(0, 6).map((expense, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-surface-hover last:border-0">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground truncate">{expense.description}</p>
                  <p className="text-xs text-text-muted">
                    {new Date(expense.date).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" })}
                    {" · "}{expense.category}
                    {" · "}{expense.account}
                  </p>
                </div>
                <span className="text-sm font-mono font-medium text-over-budget ml-3">
                  ${expense.amount.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ── Recent Transactions ── */}
      <Card
        title="Recent Transactions"
        action={
          <Link href="/transactions" className="text-xs text-accent-light hover:underline">
            View All
          </Link>
        }
      >
        {recentTransactions.length === 0 ? (
          <div className="text-center py-6 text-text-muted text-sm">
            <p>No transactions yet. Import a CSV from your bank to get started.</p>
          </div>
        ) : (
          <div className="space-y-1">
            {recentTransactions.map((tx) => {
              const isDebit = tx.direction === "debit";
              return (
                <div
                  key={tx.id}
                  className={`flex items-center gap-3 py-2 border-b border-surface-hover last:border-0 ${
                    tx.isTransfer ? "opacity-60" : ""
                  }`}
                >
                  <span className="text-base w-6">
                    {tx.isTransfer ? "🔄" : tx.categoryIcon || "·"}
                  </span>
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
                    <p className="text-xs text-text-muted">
                      {new Date(tx.date).toLocaleDateString("en-AU", { day: "2-digit", month: "short" })}
                      {tx.categoryName && ` · ${tx.categoryName}`}
                      {` · ${tx.accountName}`}
                    </p>
                  </div>
                  <span
                    className={`text-sm font-mono font-medium ${
                      tx.isTransfer ? "text-text-muted" : isDebit ? "text-over-budget" : "text-on-track"
                    }`}
                  >
                    {isDebit ? "-" : "+"}${Math.abs(tx.amount).toFixed(2)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
