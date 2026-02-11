import { prisma } from "./db";
import Anthropic from "@anthropic-ai/sdk";

// Tier 1: Rule-based matching (from manual corrections — fastest)
async function matchByRules(description: string): Promise<string | null> {
  const rules = await prisma.categoryRule.findMany({
    orderBy: { confidence: "desc" },
  });

  const upperDesc = description.toUpperCase();

  for (const rule of rules) {
    try {
      const regex = new RegExp(rule.pattern, "i");
      if (regex.test(description)) {
        return rule.categoryId;
      }
    } catch {
      if (upperDesc.includes(rule.pattern.toUpperCase())) {
        return rule.categoryId;
      }
    }
  }

  return null;
}

/**
 * Tier 2: Claude AI batch categorisation + transfer detection.
 *
 * Sends a batch of transactions with full context (account names, types,
 * all available categories) to Claude. Claude returns:
 *   - categoryId for each transaction
 *   - isTransfer flag
 *   - a cleaned/short merchant name
 */
export interface AICategorizationResult {
  categoryId: string;
  isTransfer: boolean;
  cleanDescription: string | null;
}

export async function categoriseWithAI(
  transactions: {
    id: string;
    description: string;
    amount: string;
    direction: string;
    accountName: string;
    accountType: string;
    date: string;
  }[],
  accounts: { name: string; type: string }[]
): Promise<Record<string, AICategorizationResult>> {
  if (!process.env.ANTHROPIC_API_KEY || transactions.length === 0) return {};

  const categories = await prisma.category.findMany({
    select: { id: true, name: true },
    orderBy: { sortOrder: "asc" },
  });

  const categoryList = categories.map((c) => `  "${c.id}": "${c.name}"`).join("\n");
  const accountList = accounts.map((a) => `  - ${a.name} (${a.type})`).join("\n");

  const txLines = transactions.map((t) => {
    const sign = t.direction === "debit" ? "-" : "+";
    return `  "${t.id}": { "desc": "${t.description.replace(/"/g, '\\"')}", "amount": "${sign}$${t.amount}", "account": "${t.accountName}", "date": "${t.date}" }`;
  }).join(",\n");

  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: `You are a financial categorisation engine for an Australian family budget tracker.

The user has these bank accounts:
${accountList}

Available categories (id: name):
${categoryList}

Analyse these bank transactions and for EACH one return:
1. "categoryId" — the best matching category ID from the list above
2. "isTransfer" — true if this is an internal transfer between the user's own accounts (e.g. moving money from everyday to savings, paying own mortgage/loan, transfers between their own accounts). NOT transfers to other people.
3. "cleanDescription" — a short clean merchant/payee name (e.g. "VISA PURCHASE Card 1234 WOOLWORTHS SYDNEY" → "Woolworths")

Key rules:
- Transfers between the user's own accounts (savings, loans, mortgage) are isTransfer=true
- Use "Savings Transfer" category for transfers to savings accounts
- Use "Loan Repayment" category for payments to loan/mortgage accounts  
- Use "Personal Loan Repayment" category for personal loan payments
- Salary/wages coming in = "Salary/Wages" category
- BPAY to the user's own loan/mortgage = isTransfer=true + "Loan Repayment"
- BPAY to external billers (electricity, phone, etc.) = isTransfer=false + appropriate category
- Interest earned = "Other Income" category
- ATM withdrawals, bank fees = "Fees/Charges"

REFINANCING / DEBT CONSOLIDATION:
- Large lump-sum payments from a bank/lender (e.g. "SETTLEMENT", "LOAN PAYOUT", "DISCHARGE", mortgage payouts) are REFINANCING events
- These are isTransfer=true — they are financial restructuring, NOT spending
- A large credit followed by large debits paying off other loans = refinancing. Use "Loan Repayment" category.
- Large credits from a bank/lender going INTO the everyday account that then pay off debts = isTransfer=true
- The user recently refinanced their home and used proceeds for home renovation — large payments to builders/contractors are legitimate renovation expenses (not transfers), use "Rent/Mortgage" or a suitable category

Transactions:
{
${txLines}
}

Return ONLY a valid JSON object mapping transaction ID to result. Example:
{
  "txId1": { "categoryId": "catId", "isTransfer": false, "cleanDescription": "Woolworths" },
  "txId2": { "categoryId": "catId", "isTransfer": true, "cleanDescription": "Transfer to Savings" }
}`,
        },
      ],
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      // Validate structure
      const result: Record<string, AICategorizationResult> = {};
      for (const [txId, val] of Object.entries(parsed)) {
        const v = val as Record<string, unknown>;
        if (v && typeof v.categoryId === "string") {
          // Verify category exists
          const catExists = categories.find((c) => c.id === v.categoryId);
          result[txId] = {
            categoryId: catExists ? v.categoryId : categories[categories.length - 1].id, // fallback to Uncategorised
            isTransfer: v.isTransfer === true,
            cleanDescription: typeof v.cleanDescription === "string" ? v.cleanDescription : null,
          };
        }
      }
      return result;
    }
  } catch (err) {
    console.error("AI categorisation failed:", err);
  }

  return {};
}

/**
 * Main categorisation: tries rules first, returns null if no match.
 * The batch AI path is called separately after import for uncategorised transactions.
 */
export async function categoriseTransaction(
  description: string
): Promise<string | null> {
  const ruleMatch = await matchByRules(description);
  if (ruleMatch) return ruleMatch;
  return null;
}

/**
 * Create a rule from manual categorisation for future matching.
 */
export async function createCategoryRule(
  description: string,
  categoryId: string
): Promise<void> {
  const pattern = extractPattern(description);
  if (!pattern) return;

  await prisma.categoryRule.upsert({
    where: { pattern },
    update: { categoryId, confidence: 1.0 },
    create: {
      pattern,
      categoryId,
      confidence: 1.0,
      source: "manual",
    },
  });
}

function extractPattern(description: string): string {
  const cleaned = description
    .replace(
      /^(VISA PURCHASE|EFTPOS|DIRECT DEBIT|DIRECT CREDIT|TRANSFER|ATM)\s*/i,
      ""
    )
    .replace(/\s+\d{2}\/\d{2}.*$/, "")
    .replace(/\s+[A-Z]{2}\s+AUS?$/, "")
    .trim();

  const words = cleaned.split(/\s+/).slice(0, 3);
  return words.join(" ").toUpperCase();
}
