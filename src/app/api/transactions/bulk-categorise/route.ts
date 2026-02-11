import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { categoriseWithAI, createCategoryRule } from "@/lib/categories";

export async function POST(request: NextRequest) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { transactionIds, categoryId, useAI } = body;

  // Manual bulk categorise
  if (categoryId && transactionIds?.length) {
    await prisma.transaction.updateMany({
      where: { id: { in: transactionIds } },
      data: {
        categoryId,
        categorySource: "manual",
      },
    });

    // Create rules for each description
    const transactions = await prisma.transaction.findMany({
      where: { id: { in: transactionIds } },
      select: { description: true },
    });

    for (const tx of transactions) {
      await createCategoryRule(tx.description, categoryId);
    }

    return NextResponse.json({
      updated: transactionIds.length,
    });
  }

  // AI-assisted bulk categorise for uncategorised transactions
  if (useAI) {
    const uncategorised = await prisma.transaction.findMany({
      where: { categoryId: null },
      select: { id: true, description: true },
      take: 50, // Batch size to keep AI costs manageable
    });

    if (uncategorised.length === 0) {
      return NextResponse.json({
        message: "No uncategorised transactions",
        updated: 0,
      });
    }

    const aiResults = await categoriseWithAI(uncategorised);
    let updated = 0;

    for (const [txId, catId] of Object.entries(aiResults)) {
      // Verify the category exists
      const category = await prisma.category.findUnique({
        where: { id: catId },
      });
      if (!category) continue;

      await prisma.transaction.update({
        where: { id: txId },
        data: { categoryId: catId, categorySource: "ai" },
      });

      // Also create a rule for future matching
      const tx = uncategorised.find((t) => t.id === txId);
      if (tx) {
        await createCategoryRule(tx.description, catId);
      }
      updated++;
    }

    return NextResponse.json({
      message: `AI categorised ${updated} transactions`,
      updated,
    });
  }

  return NextResponse.json(
    { error: "Provide transactionIds + categoryId, or set useAI: true" },
    { status: 400 }
  );
}
