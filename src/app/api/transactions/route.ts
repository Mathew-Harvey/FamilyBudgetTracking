import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { createCategoryRule } from "@/lib/categories";
import { decimalToNumber } from "@/types";
import type { TransactionItem } from "@/types";
import { Prisma } from "@prisma/client";

// GET /api/transactions — list with filters and pagination
export async function GET(request: NextRequest) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const fromDate = searchParams.get("fromDate");
  const toDate = searchParams.get("toDate");
  const categoryId = searchParams.get("categoryId");
  const accountId = searchParams.get("accountId");
  const direction = searchParams.get("direction");
  const search = searchParams.get("search");
  const isExcluded = searchParams.get("isExcluded");
  const page = parseInt(searchParams.get("page") || "1");
  const pageSize = parseInt(searchParams.get("pageSize") || "50");

  const where: Prisma.TransactionWhereInput = {};

  if (fromDate) where.date = { ...((where.date as Prisma.DateTimeFilter) || {}), gte: new Date(fromDate) };
  if (toDate) where.date = { ...((where.date as Prisma.DateTimeFilter) || {}), lte: new Date(toDate) };
  if (categoryId) where.categoryId = categoryId;
  if (accountId) where.accountId = accountId;
  if (direction) where.direction = direction;
  if (isExcluded !== null && isExcluded !== undefined)
    where.isExcluded = isExcluded === "true";
  if (search) {
    where.OR = [
      { description: { contains: search } },
      { cleanDescription: { contains: search } },
      { merchantName: { contains: search } },
    ];
  }

  const [transactions, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      include: {
        category: { select: { id: true, name: true, icon: true, colour: true } },
        account: { select: { name: true } },
      },
      orderBy: { date: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.transaction.count({ where }),
  ]);

  const data: TransactionItem[] = transactions.map((t) => ({
    id: t.id,
    date: t.date.toISOString(),
    description: t.description,
    cleanDescription: t.cleanDescription,
    amount: decimalToNumber(t.amount),
    direction: t.direction,
    categoryId: t.categoryId,
    categoryName: t.category?.name || null,
    categoryIcon: t.category?.icon || null,
    categoryColour: t.category?.colour || null,
    categorySource: t.categorySource,
    merchantName: t.merchantName,
    accountName: t.account.name,
    isExcluded: t.isExcluded,
    isTransfer: t.isTransfer,
    linkedTransactionId: t.linkedTransactionId,
    notes: t.notes,
  }));

  return NextResponse.json({
    data,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  });
}

// PATCH /api/transactions — update a transaction
export async function PATCH(request: NextRequest) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { id, categoryId, notes, isExcluded } = body;

  if (!id) {
    return NextResponse.json(
      { error: "Transaction ID required" },
      { status: 400 }
    );
  }

  const updateData: Prisma.TransactionUpdateInput = {};

  if (categoryId !== undefined) {
    updateData.category = categoryId
      ? { connect: { id: categoryId } }
      : { disconnect: true };
    updateData.categorySource = "manual";

    // If manually categorising, create a rule for future matching
    if (categoryId) {
      const tx = await prisma.transaction.findUnique({
        where: { id },
        select: { description: true },
      });
      if (tx) {
        await createCategoryRule(tx.description, categoryId);
      }
    }
  }

  if (notes !== undefined) updateData.notes = notes;
  if (isExcluded !== undefined) updateData.isExcluded = isExcluded;

  const updated = await prisma.transaction.update({
    where: { id },
    data: updateData,
    include: {
      category: { select: { id: true, name: true, icon: true, colour: true } },
      account: { select: { name: true } },
    },
  });

  return NextResponse.json({
    transaction: {
      id: updated.id,
      date: updated.date.toISOString(),
      description: updated.description,
      cleanDescription: updated.cleanDescription,
      amount: decimalToNumber(updated.amount),
      direction: updated.direction,
      categoryId: updated.categoryId,
      categoryName: updated.category?.name || null,
      categoryIcon: updated.category?.icon || null,
      categoryColour: updated.category?.colour || null,
      categorySource: updated.categorySource,
      merchantName: updated.merchantName,
      accountName: updated.account.name,
      isExcluded: updated.isExcluded,
      isTransfer: updated.isTransfer,
      linkedTransactionId: updated.linkedTransactionId,
      notes: updated.notes,
    },
  });
}
