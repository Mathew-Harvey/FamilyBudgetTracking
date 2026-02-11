import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { decimalToNumber } from "@/types";
import type { BudgetVsActual } from "@/types";
import Decimal from "decimal.js";

function getCurrentFortnightDates(): { start: Date; end: Date } {
  // Use a fixed epoch start for consistent fortnights
  // Fortnights start on Monday. Pick a known Monday as epoch.
  const epoch = new Date("2026-01-05T00:00:00Z"); // A Monday
  const now = new Date();
  const diffMs = now.getTime() - epoch.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const fortnightNumber = Math.floor(diffDays / 14);

  const start = new Date(
    epoch.getTime() + fortnightNumber * 14 * 24 * 60 * 60 * 1000
  );
  const end = new Date(start.getTime() + 14 * 24 * 60 * 60 * 1000 - 1);

  return { start, end };
}

// GET /api/budgets/actuals — budget vs actual for current period + financial summary
export async function GET(request: NextRequest) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const periodParam = searchParams.get("period");

  let periodStart: Date;
  let periodEnd: Date;

  if (periodParam === "monthly") {
    const now = new Date();
    periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  } else {
    // Default: fortnightly
    const { start, end } = getCurrentFortnightDates();
    periodStart = start;
    periodEnd = end;
  }

  // Get all budgets
  const budgets = await prisma.budget.findMany({
    include: {
      category: {
        select: { id: true, name: true, icon: true, colour: true },
      },
    },
    orderBy: { category: { sortOrder: "asc" } },
  });

  // Get actual spending per category for the period — EXCLUDE transfers
  const spendingTxs = await prisma.transaction.findMany({
    where: {
      date: { gte: periodStart, lte: periodEnd },
      direction: "debit",
      isExcluded: false,
      isTransfer: false,
    },
    select: {
      categoryId: true,
      amount: true,
    },
  });

  // Sum actuals by category
  const actualsByCategory: Record<string, Decimal> = {};
  for (const tx of spendingTxs) {
    const catId = tx.categoryId || "uncategorised";
    if (!actualsByCategory[catId]) {
      actualsByCategory[catId] = new Decimal(0);
    }
    actualsByCategory[catId] = actualsByCategory[catId].plus(
      new Decimal(tx.amount.toString()).abs()
    );
  }

  // Build budget vs actual comparison
  const results: BudgetVsActual[] = budgets.map((b) => {
    const budgetAmount = decimalToNumber(b.amount);
    const actualAmount = actualsByCategory[b.categoryId]
      ? Number(actualsByCategory[b.categoryId])
      : 0;
    const percentage =
      budgetAmount > 0 ? (actualAmount / budgetAmount) * 100 : 0;

    let status: BudgetVsActual["status"] = "on-track";
    if (percentage >= 100) status = "over-budget";
    else if (percentage >= 80) status = "warning";

    return {
      categoryId: b.categoryId,
      categoryName: b.category.name,
      categoryIcon: b.category.icon,
      categoryColour: b.category.colour,
      budgetAmount,
      actualAmount,
      percentage,
      status,
    };
  });

  // --- Period financial summary (for dashboard) ---
  // Real income: credits that are NOT transfers
  const incomeTxs = await prisma.transaction.findMany({
    where: {
      date: { gte: periodStart, lte: periodEnd },
      direction: "credit",
      isExcluded: false,
      isTransfer: false,
    },
    select: { amount: true },
  });
  const totalIncome = incomeTxs.reduce(
    (sum, tx) => sum.plus(new Decimal(tx.amount.toString()).abs()),
    new Decimal(0)
  );

  // Real expenses: debits that are NOT transfers
  const totalExpenses = spendingTxs.reduce(
    (sum, tx) => sum.plus(new Decimal(tx.amount.toString()).abs()),
    new Decimal(0)
  );

  // Savings movements: transfers to savings-type accounts (debit side of linked transfers)
  const savingsTransfers = await prisma.transaction.findMany({
    where: {
      date: { gte: periodStart, lte: periodEnd },
      isTransfer: true,
      direction: "debit",
      isExcluded: false,
    },
    select: {
      amount: true,
      linkedTransactionId: true,
      category: { select: { name: true } },
    },
  });
  const totalSavings = savingsTransfers
    .filter((tx) => tx.category?.name === "Savings Transfer")
    .reduce(
      (sum, tx) => sum.plus(new Decimal(tx.amount.toString()).abs()),
      new Decimal(0)
    );
  // Loan repayments includes mortgage and personal loans
  const totalMortgage = savingsTransfers
    .filter((tx) =>
      tx.category?.name === "Loan Repayment" ||
      tx.category?.name === "Personal Loan Repayment"
    )
    .reduce(
      (sum, tx) => sum.plus(new Decimal(tx.amount.toString()).abs()),
      new Decimal(0)
    );

  return NextResponse.json({
    actuals: results,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    summary: {
      totalIncome: Number(totalIncome),
      totalExpenses: Number(totalExpenses),
      totalSavings: Number(totalSavings),
      totalMortgage: Number(totalMortgage),
      net: Number(totalIncome.minus(totalExpenses)),
    },
  });
}
