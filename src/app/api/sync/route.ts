import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { basiqClient, pollJobUntilComplete } from "@/lib/basiq";
import { categoriseTransaction } from "@/lib/categories";
import Decimal from "decimal.js";

export async function POST() {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const connections = await prisma.bankConnection.findMany({
      where: { status: "active" },
      include: { accounts: true },
    });

    if (connections.length === 0) {
      return NextResponse.json({
        message: "No active connections to sync",
        synced: 0,
      });
    }

    let totalSynced = 0;

    for (const conn of connections) {
      try {
        // Refresh the connection
        const job = await basiqClient.refreshConnection(
          conn.basiqUserId,
          conn.basiqConnectionId
        );
        await pollJobUntilComplete(job.id);

        // Fetch accounts and update balances
        const basiqAccounts = await basiqClient.getAccounts(conn.basiqUserId);
        for (const ba of basiqAccounts) {
          await prisma.account.upsert({
            where: { basiqAccountId: ba.id },
            update: {
              name: ba.name,
              balance: new Decimal(ba.balance || "0"),
              availableFunds: ba.availableFunds
                ? new Decimal(ba.availableFunds)
                : null,
              lastUpdated: new Date(),
            },
            create: {
              basiqAccountId: ba.id,
              connectionId: conn.id,
              name: ba.name,
              accountNumber: ba.accountNo || null,
              balance: new Decimal(ba.balance || "0"),
              availableFunds: ba.availableFunds
                ? new Decimal(ba.availableFunds)
                : null,
              type: ba.class?.type || "transaction",
              currency: ba.currency || "AUD",
              lastUpdated: new Date(),
            },
          });
        }

        // Fetch transactions since last sync
        const fromDate = conn.lastSyncAt
          ? conn.lastSyncAt.toISOString().split("T")[0]
          : undefined;

        const transactions = await basiqClient.getTransactions(
          conn.basiqUserId,
          { fromDate }
        );

        for (const tx of transactions) {
          const existing = await prisma.transaction.findUnique({
            where: { basiqTransactionId: tx.id },
          });

          // Find the account for this transaction
          const account = await prisma.account.findFirst({
            where: {
              basiqAccountId: tx.account,
              connectionId: conn.id,
            },
          });
          if (!account) continue;

          if (existing) {
            // Update if amount or description changed
            await prisma.transaction.update({
              where: { id: existing.id },
              data: {
                amount: new Decimal(tx.amount),
                description: tx.description,
                cleanDescription:
                  tx.enrich?.merchant?.businessName || tx.description,
                merchantName: tx.enrich?.merchant?.businessName || null,
              },
            });
          } else {
            // Auto-categorise new transactions
            const categoryId = await categoriseTransaction(
              tx.description,
              tx.enrich
            );

            await prisma.transaction.create({
              data: {
                basiqTransactionId: tx.id,
                accountId: account.id,
                date: new Date(tx.transactionDate || tx.postDate),
                description: tx.description,
                cleanDescription:
                  tx.enrich?.merchant?.businessName || tx.description,
                amount: new Decimal(tx.amount),
                direction: tx.direction,
                categoryId,
                categorySource: categoryId ? "auto" : null,
                merchantName: tx.enrich?.merchant?.businessName || null,
              },
            });
            totalSynced++;
          }
        }

        // Update last sync timestamp
        await prisma.bankConnection.update({
          where: { id: conn.id },
          data: { lastSyncAt: new Date() },
        });
      } catch (err) {
        console.error(`Sync error for connection ${conn.id}:`, err);
        // Continue with other connections
      }
    }

    return NextResponse.json({
      message: "Sync complete",
      synced: totalSynced,
    });
  } catch (err) {
    console.error("Sync error:", err);
    return NextResponse.json(
      { error: "Sync failed" },
      { status: 500 }
    );
  }
}
