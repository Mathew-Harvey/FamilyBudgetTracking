import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import Decimal from "decimal.js";

/**
 * GET /api/analytics
 *
 * Comprehensive analytics data for the dashboard charts:
 * - Monthly income vs expenses trend (area chart)
 * - Weekly spending (bar chart)
 * - Category spending breakdown (donut chart)
 * - Salary auto-detection
 * - Large one-off expense detection
 * - Spending performance scores
 */
export async function GET() {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get all transactions (up to 12 months for trends)
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

  const [allTransactions, accounts, categories] = await Promise.all([
    prisma.transaction.findMany({
      where: { date: { gte: twelveMonthsAgo } },
      include: {
        category: { select: { name: true, colour: true, icon: true } },
        account: { select: { name: true, type: true } },
      },
      orderBy: { date: "asc" },
    }),
    prisma.account.findMany({
      select: { id: true, name: true, type: true, institution: true, balance: true },
    }),
    prisma.category.findMany({
      select: { id: true, name: true, colour: true, icon: true },
      orderBy: { sortOrder: "asc" },
    }),
  ]);

  // ─── Monthly Trend (Income vs Expenses vs Savings) ───
  const monthlyMap: Record<string, { income: number; expenses: number; savings: number; loans: number }> = {};

  for (const tx of allTransactions) {
    const month = tx.date.toISOString().slice(0, 7); // YYYY-MM
    if (!monthlyMap[month]) {
      monthlyMap[month] = { income: 0, expenses: 0, savings: 0, loans: 0 };
    }
    const amt = Number(new Decimal(tx.amount.toString()).abs());

    if (tx.isTransfer) {
      if (tx.direction === "debit") {
        const catName = tx.category?.name || "";
        if (catName.includes("Loan") || catName.includes("Mortgage")) {
          monthlyMap[month].loans += amt;
        } else {
          monthlyMap[month].savings += amt;
        }
      }
      continue;
    }

    if (tx.direction === "credit") {
      monthlyMap[month].income += amt;
    } else {
      monthlyMap[month].expenses += amt;
    }
  }

  const monthlyTrend = Object.entries(monthlyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, data]) => ({
      month,
      label: new Date(month + "-01").toLocaleDateString("en-AU", { month: "short", year: "2-digit" }),
      income: Math.round(data.income),
      expenses: Math.round(data.expenses),
      savings: Math.round(data.savings),
      loans: Math.round(data.loans),
      net: Math.round(data.income - data.expenses),
    }));

  // ─── Weekly Spending (last 12 weeks) ───
  const twelveWeeksAgo = new Date();
  twelveWeeksAgo.setDate(twelveWeeksAgo.getDate() - 84);

  const weeklyMap: Record<string, { amount: number; startDate: Date }> = {};

  for (const tx of allTransactions) {
    if (tx.date < twelveWeeksAgo) continue;
    if (tx.isTransfer || tx.direction !== "debit") continue;

    const d = new Date(tx.date);
    const dayOfWeek = d.getDay();
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((dayOfWeek + 6) % 7));
    const weekKey = monday.toISOString().slice(0, 10);

    if (!weeklyMap[weekKey]) {
      weeklyMap[weekKey] = { amount: 0, startDate: monday };
    }
    weeklyMap[weekKey].amount += Number(new Decimal(tx.amount.toString()).abs());
  }

  const weeklySpend = Object.entries(weeklyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, data]) => ({
      label: data.startDate.toLocaleDateString("en-AU", { day: "numeric", month: "short" }),
      amount: Math.round(data.amount),
    }));

  // ─── Category Breakdown (last 90 days, expenses only, no transfers) ───
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const catTotals: Record<string, { name: string; amount: number; colour: string; icon: string; count: number }> = {};
  let totalCatSpend = 0;

  for (const tx of allTransactions) {
    if (tx.date < ninetyDaysAgo) continue;
    if (tx.isTransfer || tx.direction !== "debit") continue;
    const amt = Number(new Decimal(tx.amount.toString()).abs());
    const catName = tx.category?.name || "Uncategorised";
    const catColour = tx.category?.colour || "#6B7280";
    const catIcon = tx.category?.icon || "·";

    if (!catTotals[catName]) {
      catTotals[catName] = { name: catName, amount: 0, colour: catColour, icon: catIcon, count: 0 };
    }
    catTotals[catName].amount += amt;
    catTotals[catName].count++;
    totalCatSpend += amt;
  }

  const categoryBreakdown = Object.values(catTotals)
    .sort((a, b) => b.amount - a.amount)
    .map((c) => ({
      ...c,
      amount: Math.round(c.amount),
      percentage: totalCatSpend > 0 ? Math.round((c.amount / totalCatSpend) * 100) : 0,
    }));

  // ─── Salary Auto-Detection ───
  // Look for recurring credits of similar amounts (within 5%) in transaction accounts
  const creditTxs = allTransactions.filter(
    (tx) => tx.direction === "credit" && !tx.isTransfer && tx.account.type === "transaction"
  );

  // Group by approximate amount (rounded to nearest $50)
  const salaryBuckets: Record<string, { amounts: number[]; dates: Date[]; descriptions: string[]; account: string }> = {};

  for (const tx of creditTxs) {
    const amt = Number(new Decimal(tx.amount.toString()).abs());
    if (amt < 500) continue; // Skip small credits

    // Round to nearest $100 for bucketing
    const bucket = Math.round(amt / 100) * 100;
    const key = `${bucket}-${tx.account.name}`;

    if (!salaryBuckets[key]) {
      salaryBuckets[key] = { amounts: [], dates: [], descriptions: [], account: tx.account.name };
    }
    salaryBuckets[key].amounts.push(amt);
    salaryBuckets[key].dates.push(tx.date);
    salaryBuckets[key].descriptions.push(tx.cleanDescription || tx.description);
  }

  // Find the most likely salary: regular payments of similar amounts
  let salaryInfo: {
    detected: boolean;
    amount: number;
    frequency: string;
    source: string;
    lastPaid: string;
    description: string;
  } = { detected: false, amount: 0, frequency: "unknown", source: "", lastPaid: "", description: "" };

  for (const [, bucket] of Object.entries(salaryBuckets)) {
    if (bucket.amounts.length >= 2) {
      // Calculate average gap between payments
      const sortedDates = bucket.dates.sort((a, b) => a.getTime() - b.getTime());
      const gaps: number[] = [];
      for (let i = 1; i < sortedDates.length; i++) {
        gaps.push(Math.round((sortedDates[i].getTime() - sortedDates[i - 1].getTime()) / (1000 * 60 * 60 * 24)));
      }
      const avgGap = gaps.reduce((s, g) => s + g, 0) / gaps.length;
      const avgAmount = bucket.amounts.reduce((s, a) => s + a, 0) / bucket.amounts.length;

      let frequency = "unknown";
      if (avgGap >= 12 && avgGap <= 16) frequency = "fortnightly";
      else if (avgGap >= 27 && avgGap <= 33) frequency = "monthly";
      else if (avgGap >= 6 && avgGap <= 8) frequency = "weekly";

      if (frequency !== "unknown" && avgAmount > (salaryInfo.amount || 0)) {
        salaryInfo = {
          detected: true,
          amount: Math.round(avgAmount),
          frequency,
          source: bucket.account,
          lastPaid: sortedDates[sortedDates.length - 1].toISOString().split("T")[0],
          description: bucket.descriptions[bucket.descriptions.length - 1],
        };
      }
    }
  }

  // ─── Large / One-off Expense Detection ───
  // Find expenses that are >3x the median expense amount
  const expenseAmounts = allTransactions
    .filter((tx) => !tx.isTransfer && tx.direction === "debit")
    .map((tx) => Number(new Decimal(tx.amount.toString()).abs()))
    .sort((a, b) => a - b);

  const medianExpense = expenseAmounts.length > 0
    ? expenseAmounts[Math.floor(expenseAmounts.length / 2)]
    : 0;

  const threshold = Math.max(medianExpense * 3, 500);

  const largeExpenses = allTransactions
    .filter((tx) => {
      if (tx.isTransfer || tx.direction !== "debit") return false;
      const amt = Number(new Decimal(tx.amount.toString()).abs());
      return amt >= threshold;
    })
    .sort((a, b) => Number(new Decimal(b.amount.toString()).abs()) - Number(new Decimal(a.amount.toString()).abs()))
    .slice(0, 10)
    .map((tx) => {
      const amt = Number(new Decimal(tx.amount.toString()).abs());
      return {
        description: tx.cleanDescription || tx.description,
        amount: Math.round(amt),
        date: tx.date.toISOString().split("T")[0],
        category: tx.category?.name || "Uncategorised",
        account: tx.account.name,
      };
    });

  // ─── Spending Performance Scores ───
  // Compare each month's non-essential spending to calculate improvement
  const monthKeys = Object.keys(monthlyMap).sort();
  const scores: { month: string; score: number }[] = [];

  for (const month of monthKeys) {
    const data = monthlyMap[month];
    if (data.income === 0) continue;

    // Score = how well you managed spending relative to income
    // savings rate, loan payments, and spending discipline
    const savingsRate = (data.income - data.expenses) / data.income;
    const score = Math.max(0, Math.min(100, Math.round(
      savingsRate * 60 + // 60% weight on savings rate
      (data.savings > 0 ? 15 : 0) + // 15 points for active saving
      (data.loans > 0 ? 10 : 0) + // 10 points for making loan payments
      (data.expenses < data.income ? 15 : 0) // 15 points for living within means
    )));

    scores.push({
      month,
      score,
    });
  }

  const currentScore = scores.length > 0 ? scores[scores.length - 1].score : 0;
  const previousScore = scores.length > 1 ? scores[scores.length - 2].score : 0;

  // ─── Daily spending for the current month (sparkline) ───
  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const dailySpend: Record<string, number> = {};
  for (const tx of allTransactions) {
    if (tx.date < currentMonthStart) continue;
    if (tx.isTransfer || tx.direction !== "debit") continue;
    const day = tx.date.toISOString().slice(0, 10);
    const amt = Number(new Decimal(tx.amount.toString()).abs());
    dailySpend[day] = (dailySpend[day] || 0) + amt;
  }

  // Fill in missing days with 0
  const dailySpendArray: { date: string; label: string; amount: number; cumulative: number }[] = [];
  let cumulative = 0;
  const today = new Date();
  for (let d = new Date(currentMonthStart); d <= today; d.setDate(d.getDate() + 1)) {
    const key = d.toISOString().slice(0, 10);
    const amt = Math.round(dailySpend[key] || 0);
    cumulative += amt;
    dailySpendArray.push({
      date: key,
      label: d.toLocaleDateString("en-AU", { day: "numeric" }),
      amount: amt,
      cumulative: Math.round(cumulative),
    });
  }

  // ─── Income sources breakdown ───
  const incomeSources: Record<string, { name: string; total: number; count: number }> = {};
  for (const tx of allTransactions) {
    if (tx.date < ninetyDaysAgo) continue;
    if (tx.isTransfer || tx.direction !== "credit") continue;
    const catName = tx.category?.name || "Other Income";
    const amt = Number(new Decimal(tx.amount.toString()).abs());
    if (!incomeSources[catName]) {
      incomeSources[catName] = { name: catName, total: 0, count: 0 };
    }
    incomeSources[catName].total += amt;
    incomeSources[catName].count++;
  }

  return NextResponse.json({
    monthlyTrend,
    weeklySpend,
    categoryBreakdown,
    salaryInfo,
    largeExpenses,
    dailySpend: dailySpendArray,
    incomeSources: Object.values(incomeSources)
      .sort((a, b) => b.total - a.total)
      .map((s) => ({ ...s, total: Math.round(s.total) })),
    performance: {
      currentScore,
      previousScore,
      trend: currentScore > previousScore ? "improving" : currentScore < previousScore ? "declining" : "stable",
      monthlyScores: scores,
    },
    accounts: accounts.map((a) => ({
      name: a.name,
      type: a.type,
      institution: a.institution,
      balance: Number(a.balance),
    })),
  });
}
