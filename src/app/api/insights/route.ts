import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import Anthropic from "@anthropic-ai/sdk";
import Decimal from "decimal.js";

export async function GET() {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({
      insights: [],
      summary: "Claude API key not configured. Add ANTHROPIC_API_KEY to your .env file.",
    });
  }

  try {
    // Gather comprehensive financial data — last 6 months for pattern detection
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const [accounts, transactions] = await Promise.all([
      prisma.account.findMany({
        select: { id: true, name: true, type: true, institution: true, balance: true },
      }),
      prisma.transaction.findMany({
        where: { date: { gte: sixMonthsAgo } },
        include: {
          category: { select: { name: true } },
          account: { select: { name: true, type: true } },
        },
        orderBy: { date: "desc" },
      }),
    ]);

    if (transactions.length === 0) {
      return NextResponse.json({
        insights: [],
        summary: "No transactions yet. Import a CSV to get AI-powered insights.",
      });
    }

    // Build spending breakdown by category
    const categoryTotals: Record<string, { name: string; total: number; count: number }> = {};
    let totalIncome = new Decimal(0);
    let totalExpenses = new Decimal(0);
    let totalTransfers = new Decimal(0);

    for (const tx of transactions) {
      const catName = tx.category?.name || "Uncategorised";
      const amt = new Decimal(tx.amount.toString()).abs();

      if (tx.isTransfer) {
        if (tx.direction === "debit") totalTransfers = totalTransfers.plus(amt);
        continue;
      }

      if (tx.direction === "credit") {
        totalIncome = totalIncome.plus(amt);
      } else {
        totalExpenses = totalExpenses.plus(amt);
        if (!categoryTotals[catName]) {
          categoryTotals[catName] = { name: catName, total: 0, count: 0 };
        }
        categoryTotals[catName].total += Number(amt);
        categoryTotals[catName].count++;
      }
    }

    // Top spending categories
    const topCategories = Object.values(categoryTotals)
      .sort((a, b) => b.total - a.total)
      .slice(0, 12)
      .map((c) => `${c.name}: $${c.total.toFixed(2)} (${c.count} txns)`)
      .join("\n");

    // Largest expenses with full descriptions
    const largestExpenses = transactions
      .filter((tx) => !tx.isTransfer && tx.direction === "debit")
      .sort((a, b) => Number(new Decimal(b.amount.toString()).abs()) - Number(new Decimal(a.amount.toString()).abs()))
      .slice(0, 20)
      .map((tx) => {
        const amt = Number(new Decimal(tx.amount.toString()).abs());
        return `${tx.date.toISOString().split("T")[0]} | ${tx.description} | $${amt.toFixed(2)} | ${tx.category?.name || "Uncategorised"} | ${tx.account.name}`;
      })
      .join("\n");

    // All income credits with descriptions (for salary detection)
    const incomeCredits = transactions
      .filter((tx) => !tx.isTransfer && tx.direction === "credit")
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .slice(0, 30)
      .map((tx) => {
        const amt = Number(new Decimal(tx.amount.toString()).abs());
        return `${tx.date.toISOString().split("T")[0]} | ${tx.description} | $${amt.toFixed(2)} | ${tx.category?.name || "Uncategorised"} | ${tx.account.name}`;
      })
      .join("\n");

    const accountSummary = accounts
      .map((a) => `${a.name} (${a.type}, ${a.institution || "Manual"}): $${Number(a.balance).toFixed(2)}`)
      .join("\n");

    // Monthly trend
    const monthlySpend: Record<string, number> = {};
    const monthlyIncome: Record<string, number> = {};
    for (const tx of transactions) {
      if (tx.isTransfer) continue;
      const month = tx.date.toISOString().slice(0, 7);
      const amt = Number(new Decimal(tx.amount.toString()).abs());
      if (tx.direction === "debit") {
        monthlySpend[month] = (monthlySpend[month] || 0) + amt;
      } else {
        monthlyIncome[month] = (monthlyIncome[month] || 0) + amt;
      }
    }
    const monthlyTrend = Object.keys(monthlySpend)
      .sort()
      .map((m) => `${m}: Income $${(monthlyIncome[m] || 0).toFixed(0)}, Expenses $${monthlySpend[m].toFixed(0)}, Net $${((monthlyIncome[m] || 0) - monthlySpend[m]).toFixed(0)}`)
      .join("\n");

    const client = new Anthropic();
    const response = await client.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 3000,
      messages: [
        {
          role: "user",
          content: `You are a personal financial advisor for an Australian family. Analyse their financial data and provide smart, contextual insights.

CRITICAL: You must understand the CONTEXT behind spending patterns:
- If you see large one-off payments (like home renovation, holiday travel, etc.), recognise these as PLANNED LIFE EVENTS, not reckless spending
- A recent home refinance + renovation increases property value — this is a POSITIVE financial move
- International holiday spending (Japan ski trip, flights, hotels) is lifestyle spending — note it factually but don't alarm
- Separate RECURRING regular spending from ONE-OFF life events in your analysis
- Detect salary/wage patterns from recurring credits of similar amounts

REFINANCING / DEBT CONSOLIDATION:
- The family recently REFINANCED their home mortgage. This means:
  - Large lump sum credits from a lender (settlement proceeds) appeared in their accounts
  - These were used to PAY OFF previous loans, credit cards, personal loans etc.
  - Large debits to banks/lenders are DEBT PAYOFFS from refinancing, NOT spending
  - This is a positive financial restructuring move — likely getting a better rate or consolidating debt
  - DO NOT count refinancing payoffs as expenses or alarm about them
  - Treat settlement credits + loan payoffs as INTERNAL financial restructuring (transfers)
  - Any large amounts flowing in and then immediately out to other banks = refinancing settlement
  - The remaining funds were used for a home renovation which INCREASES property value

Accounts:
${accountSummary}

Period: Last 6 months
Total Income: $${Number(totalIncome).toFixed(2)}
Total Expenses: $${Number(totalExpenses).toFixed(2)}
Internal Transfers: $${Number(totalTransfers).toFixed(2)}
Net: $${Number(totalIncome.minus(totalExpenses)).toFixed(2)}

Spending by category:
${topCategories}

Monthly trend:
${monthlyTrend}

All income/credit transactions (for salary detection):
${incomeCredits}

Largest expenses (look for patterns — renovations, holidays, one-offs vs regular):
${largestExpenses}

Return a JSON object with this EXACT structure:
{
  "summary": "2-3 sentence overview of their financial health, acknowledging life events like renovations or holidays in context",
  "insights": [
    {
      "type": "positive|warning|tip|info|lifestyle",
      "title": "Short title (max 6 words)",
      "detail": "Specific insight with dollar amounts. For one-off events, provide context (e.g. 'Your Japan ski trip cost $X — a memorable family experience, and your regular spending outside of this remains disciplined')"
    }
  ],
  "spendingScore": 0-100,
  "regularSpendingScore": 0-100,
  "topTip": "Single most impactful advice",
  "salaryDetection": {
    "detected": true/false,
    "amount": estimated_per_payment,
    "frequency": "weekly|fortnightly|monthly",
    "description": "employer name or description from transactions"
  },
  "lifeEvents": [
    {
      "type": "refinancing|renovation|holiday|major_purchase|other",
      "title": "Brief title",
      "estimatedCost": total_amount,
      "period": "month or date range",
      "note": "Contextual note about the event (for refinancing, explain the debt restructure positively)"
    }
  ]
}

Scoring rules:
- spendingScore: Overall score including one-off events (may be lower due to renovation/holiday — that's OK)
- regularSpendingScore: Score for RECURRING spending only (excludes one-off life events). This shows day-to-day financial discipline.
  80+ = excellent, 60-79 = good, 40-59 = needs attention, <40 = concerning
- Give 5-8 insights covering: salary detection, savings behaviour, life events context, regular spending patterns, wins, and 1-2 actionable tips
- Be encouraging and contextual — understand that families have big expenses sometimes and that's life
- Use Australian context (AUD, local references)

Return ONLY the JSON object, no markdown fences.`,
        },
      ],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return NextResponse.json(parsed);
    }

    return NextResponse.json({
      insights: [],
      summary: "Unable to parse AI response.",
    });
  } catch (err) {
    console.error("Insights error:", err);
    return NextResponse.json(
      { error: "Failed to generate insights" },
      { status: 500 }
    );
  }
}
