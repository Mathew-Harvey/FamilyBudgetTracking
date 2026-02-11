import { prisma } from "./db";

/**
 * Transfer detection patterns.
 * ING Direct descriptions for internal transfers typically contain these keywords.
 */
const TRANSFER_PATTERNS = [
  /\bTRANSFER\s+(TO|FROM)\b/i,
  /\bINTERNET\s+TRANSFER\b/i,
  /\bOSKO\s+(PAYMENT|TRANSFER)\b/i,
  /\bFAST\s+PAYMENT\b/i,
  /\bINTERNAL\s+TRANSFER\b/i,
  /\bSAVINGS\s+MAXIMISER\b/i,
  /\bORANGE\s+EVERYDAY\b/i,
  /\bBPAY\b/i,
  /\bDIRECT\s+DEBIT.*MORTGAGE\b/i,
  /\bLOAN\s+REPAYMENT\b/i,
  /\bHOME\s+LOAN\b/i,
  /\bPERSONAL\s+LOAN\b/i,
  /\bLOAN\s+PAYMENT\b/i,
  /\bSETTLEMENT\b/i,
  /\bLOAN\s+PAYOUT\b/i,
  /\bDISCHARGE\b/i,
  /\bREFINANC/i,
  /\bDEBT\s+CONSOLIDAT/i,
  /\bPAYOUT\b/i,
];

/**
 * Check if a transaction description looks like a transfer between accounts.
 */
function looksLikeTransfer(description: string): boolean {
  return TRANSFER_PATTERNS.some((pattern) => pattern.test(description));
}

/**
 * Detect and link internal transfers after a CSV import.
 *
 * Phase 1: Pattern-match descriptions on the imported account to flag candidates.
 * Phase 2: Cross-match candidates against other accounts by amount + date (+/- 1 day).
 * Auto-categorise as "Savings Transfer" or "Loan Repayment" based on the other account type.
 */
export async function detectTransfers(accountId: string): Promise<number> {
  let linkedCount = 0;

  // Get all accounts so we know which ones exist
  const allAccounts = await prisma.account.findMany({
    select: { id: true, name: true, type: true },
  });

  // Only run cross-matching if there are multiple accounts
  if (allAccounts.length < 2) {
    // Still mark pattern-matched transactions as transfers even with one account
    await markSingleAccountTransfers(accountId);
    return 0;
  }

  // Fetch relevant category IDs
  const savingsCategory = await prisma.category.findUnique({
    where: { name: "Savings Transfer" },
  });
  const loanCategory = await prisma.category.findUnique({
    where: { name: "Loan Repayment" },
  });
  const personalLoanCategory = await prisma.category.findUnique({
    where: { name: "Personal Loan Repayment" },
  });

  // Phase 1: Find transfer candidates in the imported account
  // (unlinked transactions that match transfer patterns)
  const candidates = await prisma.transaction.findMany({
    where: {
      accountId,
      isTransfer: false,
      linkedTransactionId: null,
    },
  });

  for (const tx of candidates) {
    // Skip if already linked (could have been linked by a previous iteration)
    if (tx.linkedTransactionId) continue;

    const isCandidate = looksLikeTransfer(tx.description);
    if (!isCandidate) continue;

    // Phase 2: Try to find a matching transaction in another account
    // Same amount, opposite direction, within 1 day
    const txDate = new Date(tx.date);
    const dayBefore = new Date(txDate.getTime() - 24 * 60 * 60 * 1000);
    const dayAfter = new Date(txDate.getTime() + 24 * 60 * 60 * 1000);
    const oppositeDirection = tx.direction === "debit" ? "credit" : "debit";

    const match = await prisma.transaction.findFirst({
      where: {
        accountId: { not: accountId },
        amount: tx.amount,
        direction: oppositeDirection,
        date: { gte: dayBefore, lte: dayAfter },
        isTransfer: false,
        linkedTransactionId: null,
      },
      include: {
        account: { select: { type: true } },
      },
    });

    if (match) {
      // Determine the right category based on the destination account type
      const destAccount =
        tx.direction === "debit" ? match.account : allAccounts.find((a) => a.id === accountId);
      let categoryId: string | null = null;
      if (destAccount?.type === "savings") {
        categoryId = savingsCategory?.id || null;
      } else if (destAccount?.type === "loan") {
        categoryId = loanCategory?.id || null;
      } else if (destAccount?.type === "personal-loan") {
        categoryId = personalLoanCategory?.id || null;
      } else {
        categoryId = savingsCategory?.id || null; // Default to savings transfer
      }

      // Link both transactions
      await prisma.transaction.update({
        where: { id: tx.id },
        data: {
          isTransfer: true,
          linkedTransactionId: match.id,
          categoryId: categoryId || tx.categoryId,
          categorySource: categoryId ? "auto" : tx.categorySource,
        },
      });

      await prisma.transaction.update({
        where: { id: match.id },
        data: {
          isTransfer: true,
          linkedTransactionId: tx.id,
          categoryId: categoryId || match.categoryId,
          categorySource: categoryId ? "auto" : match.categorySource,
        },
      });

      linkedCount++;
    } else {
      // No cross-account match found, but it still looks like a transfer
      // (e.g. mortgage payment to external bank, or the other side hasn't been imported yet)
      // Mark as transfer based on pattern alone
      let categoryId: string | null = null;
      const upperDesc = tx.description.toUpperCase();

      if (
        upperDesc.includes("MORTGAGE") ||
        upperDesc.includes("HOME LOAN")
      ) {
        categoryId = loanCategory?.id || null;
      } else if (
        upperDesc.includes("PERSONAL LOAN")
      ) {
        categoryId = personalLoanCategory?.id || loanCategory?.id || null;
      } else if (
        upperDesc.includes("LOAN REPAYMENT") || upperDesc.includes("LOAN PAYMENT")
      ) {
        // Generic loan — check if destination looks like personal vs home
        categoryId = loanCategory?.id || null;
      } else if (
        upperDesc.includes("BPAY") &&
        (upperDesc.includes("COMMONWEALTH") || upperDesc.includes("CBA"))
      ) {
        categoryId = loanCategory?.id || null;
      } else if (
        upperDesc.includes("TRANSFER") ||
        upperDesc.includes("SAVINGS")
      ) {
        categoryId = savingsCategory?.id || null;
      }

      if (categoryId) {
        await prisma.transaction.update({
          where: { id: tx.id },
          data: {
            isTransfer: true,
            categoryId,
            categorySource: "auto",
          },
        });
      }
    }
  }

  return linkedCount;
}

/**
 * Mark obvious transfers on a single account (when no other accounts exist yet).
 * These will be re-evaluated when more accounts are imported.
 */
async function markSingleAccountTransfers(accountId: string): Promise<void> {
  const savingsCategory = await prisma.category.findUnique({
    where: { name: "Savings Transfer" },
  });
  const loanCategory = await prisma.category.findUnique({
    where: { name: "Loan Repayment" },
  });
  const personalLoanCategory = await prisma.category.findUnique({
    where: { name: "Personal Loan Repayment" },
  });

  const transactions = await prisma.transaction.findMany({
    where: {
      accountId,
      isTransfer: false,
    },
  });

  for (const tx of transactions) {
    if (!looksLikeTransfer(tx.description)) continue;

    const upperDesc = tx.description.toUpperCase();
    let categoryId: string | null = null;

    if (
      upperDesc.includes("MORTGAGE") ||
      upperDesc.includes("HOME LOAN")
    ) {
      categoryId = loanCategory?.id || null;
    } else if (
      upperDesc.includes("PERSONAL LOAN")
    ) {
      categoryId = personalLoanCategory?.id || loanCategory?.id || null;
    } else if (
      upperDesc.includes("LOAN REPAYMENT") ||
      upperDesc.includes("LOAN PAYMENT") ||
      (upperDesc.includes("BPAY") &&
        (upperDesc.includes("COMMONWEALTH") || upperDesc.includes("CBA")))
    ) {
      categoryId = loanCategory?.id || null;
    } else if (
      upperDesc.includes("TRANSFER") ||
      upperDesc.includes("SAVINGS") ||
      upperDesc.includes("OSKO") ||
      upperDesc.includes("FAST PAYMENT")
    ) {
      categoryId = savingsCategory?.id || null;
    }

    if (categoryId) {
      await prisma.transaction.update({
        where: { id: tx.id },
        data: {
          isTransfer: true,
          categoryId,
          categorySource: "auto",
        },
      });
    }
  }
}

/**
 * Re-run transfer detection across ALL accounts.
 * Useful after importing CSVs from a second/third account.
 */
export async function redetectAllTransfers(): Promise<number> {
  // Reset all transfer flags first
  await prisma.transaction.updateMany({
    where: { isTransfer: true, linkedTransactionId: { not: null } },
    data: { isTransfer: false, linkedTransactionId: null },
  });

  const accounts = await prisma.account.findMany({ select: { id: true } });
  let total = 0;
  for (const account of accounts) {
    total += await detectTransfers(account.id);
  }
  return total;
}
