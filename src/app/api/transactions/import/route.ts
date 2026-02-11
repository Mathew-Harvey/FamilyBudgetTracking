import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { categoriseTransaction, categoriseWithAI } from "@/lib/categories";
import { detectTransfers } from "@/lib/transfers";
import Papa from "papaparse";
import Decimal from "decimal.js";

interface INGRow {
  Date: string;
  Description: string;
  Credit?: string;
  Debit?: string;
  Balance?: string;
  Amount?: string;
}

export async function POST(request: NextRequest) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const accountId = formData.get("accountId") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (!accountId) {
      return NextResponse.json(
        { error: "Account ID required" },
        { status: 400 }
      );
    }

    // Verify account exists
    const account = await prisma.account.findUnique({
      where: { id: accountId },
    });
    if (!account) {
      return NextResponse.json(
        { error: "Account not found" },
        { status: 404 }
      );
    }

    const text = await file.text();
    const { data: rows } = Papa.parse<INGRow>(text, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h: string) => h.trim(),
    });

    let imported = 0;
    let skipped = 0;
    const newTransactionIds: string[] = [];
    let latestBalance: Decimal | null = null;
    let latestBalanceDate: Date | null = null;

    for (const row of rows) {
      if (!row.Date || !row.Description) {
        skipped++;
        continue;
      }

      // Parse date (DD/MM/YYYY format)
      const [day, month, year] = row.Date.split("/").map(Number);
      const date = new Date(year, month - 1, day);

      // Parse amount — support both Credit/Debit columns and single Amount column
      let amount: Decimal;
      let direction: string;

      if (row.Credit || row.Debit) {
        if (row.Credit && row.Credit.trim()) {
          amount = new Decimal(row.Credit.replace(/[,$]/g, "")).abs();
          direction = "credit";
        } else {
          amount = new Decimal(row.Debit?.replace(/[,$]/g, "") || "0").abs();
          direction = "debit";
        }
      } else if (row.Amount) {
        const val = new Decimal(row.Amount.replace(/[,$]/g, ""));
        amount = val.abs();
        direction = val.isNegative() ? "debit" : "credit";
      } else {
        skipped++;
        continue;
      }

      // Track the most recent Balance from the CSV (if column exists)
      if (row.Balance && row.Balance.trim()) {
        try {
          const bal = new Decimal(row.Balance.replace(/[,$]/g, ""));
          if (latestBalanceDate === null || date >= latestBalanceDate) {
            latestBalance = bal;
            latestBalanceDate = date;
          }
        } catch {
          // Ignore malformed balance values
        }
      }

      // Check for duplicate (same account, date, description, amount, direction)
      const existing = await prisma.transaction.findFirst({
        where: {
          accountId,
          date,
          description: row.Description,
          amount,
          direction,
        },
      });
      if (existing) {
        skipped++;
        continue;
      }

      // Quick rule-based categorisation (instant, no API call)
      const ruleCategory = await categoriseTransaction(row.Description);

      const tx = await prisma.transaction.create({
        data: {
          accountId,
          date,
          description: row.Description,
          amount,
          direction,
          categoryId: ruleCategory,
          categorySource: ruleCategory ? "rule" : null,
        },
      });
      newTransactionIds.push(tx.id);
      imported++;
    }

    // Update account balance from the CSV Balance column (if present)
    if (latestBalance !== null) {
      await prisma.account.update({
        where: { id: accountId },
        data: { balance: latestBalance, lastUpdated: latestBalanceDate || new Date() },
      });
    }
    // If no Balance column in CSV, don't attempt to calculate — let the user
    // set it manually in Settings. Summing credits-debits is wrong because
    // we only have a window of transaction history, not the full account life.

    // --- Phase 2: AI batch categorisation for all uncategorised transactions ---
    let aiCategorised = 0;
    let aiTransfers = 0;

    if (newTransactionIds.length > 0 && process.env.ANTHROPIC_API_KEY) {
      // Get ALL uncategorised transactions (not just new ones) for better context
      const uncategorised = await prisma.transaction.findMany({
        where: {
          OR: [
            { categoryId: null },
            { categorySource: null },
          ],
        },
        include: {
          account: { select: { name: true, type: true } },
        },
      });

      // Also get previously categorised new transactions for transfer detection
      const newButCategorised = await prisma.transaction.findMany({
        where: {
          id: { in: newTransactionIds },
          categoryId: { not: null },
          categorySource: "rule",
        },
        include: {
          account: { select: { name: true, type: true } },
        },
      });

      // Combine: uncategorised + newly imported (for transfer detection context)
      const allForAI = [...uncategorised, ...newButCategorised];

      // Deduplicate by id
      const uniqueForAI = [...new Map(allForAI.map((t) => [t.id, t])).values()];

      if (uniqueForAI.length > 0) {
        // Get all accounts for context
        const allAccounts = await prisma.account.findMany({
          select: { name: true, type: true },
        });

        // Batch in chunks of 50 to stay within token limits
        const BATCH_SIZE = 50;
        for (let i = 0; i < uniqueForAI.length; i += BATCH_SIZE) {
          const batch = uniqueForAI.slice(i, i + BATCH_SIZE);

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

          // Apply AI results
          for (const [txId, result] of Object.entries(aiResults)) {
            const existingTx = batch.find((t) => t.id === txId);
            if (!existingTx) continue;

            const updateData: Record<string, unknown> = {};

            // Only update category if not already set by a rule
            if (!existingTx.categoryId || existingTx.categorySource !== "rule") {
              updateData.categoryId = result.categoryId;
              updateData.categorySource = "ai";
              aiCategorised++;
            }

            // Always update transfer detection from AI
            if (result.isTransfer) {
              updateData.isTransfer = true;
              aiTransfers++;
            }

            // Always update clean description from AI
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
      }
    }

    // --- Phase 3: Cross-account transfer linking (pattern + amount matching) ---
    const linkedTransfers = await detectTransfers(accountId);

    return NextResponse.json({
      message: `Imported ${imported} transactions, skipped ${skipped} duplicates. AI categorised ${aiCategorised}, detected ${aiTransfers} transfers, linked ${linkedTransfers} cross-account transfers.`,
      imported,
      skipped,
      aiCategorised,
      aiTransfers,
      linkedTransfers,
    });
  } catch (err) {
    console.error("Import error:", err);
    return NextResponse.json(
      { error: "Failed to import CSV" },
      { status: 500 }
    );
  }
}
