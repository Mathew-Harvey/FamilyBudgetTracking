import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { decimalToNumber } from "@/types";
import Decimal from "decimal.js";

// GET /api/budgets — get all budgets
export async function GET() {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const budgets = await prisma.budget.findMany({
    include: {
      category: {
        select: { id: true, name: true, icon: true, colour: true },
      },
    },
    orderBy: { category: { sortOrder: "asc" } },
  });

  const data = budgets.map((b) => ({
    id: b.id,
    categoryId: b.categoryId,
    categoryName: b.category.name,
    categoryIcon: b.category.icon,
    categoryColour: b.category.colour,
    amount: decimalToNumber(b.amount),
    period: b.period,
    startDate: b.startDate.toISOString(),
    endDate: b.endDate?.toISOString() || null,
  }));

  return NextResponse.json({ budgets: data });
}

// POST /api/budgets — create or update budget
export async function POST(request: NextRequest) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { categoryId, amount, period, startDate } = body;

  if (!categoryId || amount === undefined || !startDate) {
    return NextResponse.json(
      { error: "categoryId, amount, and startDate are required" },
      { status: 400 }
    );
  }

  const budgetPeriod = period || process.env.BUDGET_PERIOD || "fortnightly";
  const start = new Date(startDate);

  const budget = await prisma.budget.upsert({
    where: {
      categoryId_period_startDate: {
        categoryId,
        period: budgetPeriod,
        startDate: start,
      },
    },
    update: { amount: new Decimal(amount) },
    create: {
      categoryId,
      amount: new Decimal(amount),
      period: budgetPeriod,
      startDate: start,
    },
    include: {
      category: {
        select: { id: true, name: true, icon: true, colour: true },
      },
    },
  });

  return NextResponse.json({
    budget: {
      id: budget.id,
      categoryId: budget.categoryId,
      categoryName: budget.category.name,
      categoryIcon: budget.category.icon,
      categoryColour: budget.category.colour,
      amount: decimalToNumber(budget.amount),
      period: budget.period,
      startDate: budget.startDate.toISOString(),
    },
  });
}
