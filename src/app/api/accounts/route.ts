import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { decimalToNumber } from "@/types";
import type { AccountSummary } from "@/types";

// GET /api/accounts — list all accounts with balances
export async function GET() {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accounts = await prisma.account.findMany({
    include: {
      connection: {
        select: { institutionName: true },
      },
    },
    orderBy: { name: "asc" },
  });

  const data: AccountSummary[] = accounts.map((a) => ({
    id: a.id,
    name: a.name,
    accountNumber: a.accountNumber,
    balance: decimalToNumber(a.balance),
    availableFunds: a.availableFunds ? decimalToNumber(a.availableFunds) : null,
    type: a.type,
    currency: a.currency,
    institutionName: a.connection?.institutionName || a.institution || "Manual",
  }));

  return NextResponse.json({ accounts: data });
}

// POST /api/accounts — create a manual account
export async function POST(request: NextRequest) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { name, institution, type, accountNumber, balance } = body;

  if (!name) {
    return NextResponse.json(
      { error: "Account name is required" },
      { status: 400 }
    );
  }

  const account = await prisma.account.create({
    data: {
      name,
      institution: institution || "Manual",
      type: type || "transaction",
      accountNumber: accountNumber || null,
      balance: balance !== undefined ? balance : 0,
    },
  });

  return NextResponse.json({
    account: {
      id: account.id,
      name: account.name,
      accountNumber: account.accountNumber,
      balance: decimalToNumber(account.balance),
      availableFunds: null,
      type: account.type,
      currency: account.currency,
      institutionName: account.institution || "Manual",
    },
  });
}

// PATCH /api/accounts — update account details (name, balance, type, etc.)
export async function PATCH(request: NextRequest) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { id, name, balance, type, institution } = body;

  if (!id) {
    return NextResponse.json(
      { error: "Account ID required" },
      { status: 400 }
    );
  }

  const updateData: Record<string, unknown> = {};
  if (name !== undefined) updateData.name = name;
  if (balance !== undefined) updateData.balance = balance;
  if (type !== undefined) updateData.type = type;
  if (institution !== undefined) updateData.institution = institution;

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const account = await prisma.account.update({
    where: { id },
    data: updateData,
  });

  return NextResponse.json({
    account: {
      id: account.id,
      name: account.name,
      accountNumber: account.accountNumber,
      balance: decimalToNumber(account.balance),
      availableFunds: account.availableFunds ? decimalToNumber(account.availableFunds) : null,
      type: account.type,
      currency: account.currency,
      institutionName: account.institution || "Manual",
    },
  });
}

// DELETE /api/accounts?id=xxx
export async function DELETE(request: NextRequest) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json(
      { error: "Account ID required" },
      { status: 400 }
    );
  }

  // Check if account has transactions
  const txCount = await prisma.transaction.count({
    where: { accountId: id },
  });

  if (txCount > 0) {
    return NextResponse.json(
      {
        error: `Cannot delete account with ${txCount} transactions. Remove transactions first.`,
      },
      { status: 400 }
    );
  }

  await prisma.account.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
