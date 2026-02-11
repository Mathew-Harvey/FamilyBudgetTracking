import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { categoriseWithAI } from "@/lib/categories";
import { redetectAllTransfers } from "@/lib/transfers";

/**
 * POST /api/transactions/recategorise
 *
 * Re-run AI categorisation on all transactions.
 * Useful after adding new accounts, importing more data, or wanting a fresh AI pass.
 */
export async function POST() {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not configured" },
      { status: 400 }
    );
  }

  try {
    // Get ALL transactions with account context
    const allTransactions = await prisma.transaction.findMany({
      include: {
        account: { select: { name: true, type: true } },
      },
      orderBy: { date: "desc" },
    });

    const allAccounts = await prisma.account.findMany({
      select: { name: true, type: true },
    });

    let aiCategorised = 0;
    let aiTransfers = 0;

    // Process in batches of 50
    const BATCH_SIZE = 50;
    for (let i = 0; i < allTransactions.length; i += BATCH_SIZE) {
      const batch = allTransactions.slice(i, i + BATCH_SIZE);

      const aiInput = batch.map((tx) => ({
        id: tx.id,
        description: tx.description,
        amount: tx.amount.toString(),
        direction: tx.direction,
        accountName: tx.account.name,
        accountType: tx.account.type,
        date: tx.date.toISOString().split("T")[0],
      }));

      const aiResults = await categoriseWithAI(aiInput, allAccounts);

      for (const [txId, result] of Object.entries(aiResults)) {
        const existingTx = batch.find((t) => t.id === txId);
        if (!existingTx) continue;

        const updateData: Record<string, unknown> = {};

        // Only update category if not manually set
        if (existingTx.categorySource !== "manual") {
          updateData.categoryId = result.categoryId;
          updateData.categorySource = "ai";
          aiCategorised++;
        }

        if (result.isTransfer) {
          updateData.isTransfer = true;
          aiTransfers++;
        }

        if (result.cleanDescription) {
          updateData.cleanDescription = result.cleanDescription;
        }

        if (Object.keys(updateData).length > 0) {
          await prisma.transaction.update({
            where: { id: txId },
            data: updateData,
          });
        }
      }
    }

    // Re-run cross-account transfer linking
    const linkedTransfers = await redetectAllTransfers();

    return NextResponse.json({
      message: `AI recategorised ${aiCategorised} transactions, detected ${aiTransfers} transfers, linked ${linkedTransfers} cross-account transfers.`,
      aiCategorised,
      aiTransfers,
      linkedTransfers,
      totalProcessed: allTransactions.length,
    });
  } catch (err) {
    console.error("Recategorise error:", err);
    return NextResponse.json(
      { error: "Failed to recategorise" },
      { status: 500 }
    );
  }
}
