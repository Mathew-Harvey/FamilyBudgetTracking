import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

// GET /api/categories
export async function GET() {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const categories = await prisma.category.findMany({
    orderBy: { sortOrder: "asc" },
    include: {
      children: {
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  return NextResponse.json({ categories });
}

// POST /api/categories — create
export async function POST(request: NextRequest) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { name, icon, colour, parentId, sortOrder } = body;

  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const category = await prisma.category.create({
    data: {
      name,
      icon: icon || null,
      colour: colour || null,
      parentId: parentId || null,
      sortOrder: sortOrder || 0,
      isSystem: false,
    },
  });

  return NextResponse.json({ category });
}

// PATCH /api/categories — update
export async function PATCH(request: NextRequest) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { id, name, icon, colour, sortOrder } = body;

  if (!id) {
    return NextResponse.json(
      { error: "Category ID required" },
      { status: 400 }
    );
  }

  const category = await prisma.category.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(icon !== undefined && { icon }),
      ...(colour !== undefined && { colour }),
      ...(sortOrder !== undefined && { sortOrder }),
    },
  });

  return NextResponse.json({ category });
}

// DELETE /api/categories?id=xxx&reassignTo=yyy
export async function DELETE(request: NextRequest) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const reassignTo = searchParams.get("reassignTo");

  if (!id) {
    return NextResponse.json(
      { error: "Category ID required" },
      { status: 400 }
    );
  }

  // Check if it's a system category
  const category = await prisma.category.findUnique({ where: { id } });
  if (category?.isSystem) {
    return NextResponse.json(
      { error: "Cannot delete system category" },
      { status: 400 }
    );
  }

  // Reassign transactions if specified
  if (reassignTo) {
    await prisma.transaction.updateMany({
      where: { categoryId: id },
      data: { categoryId: reassignTo },
    });
  } else {
    await prisma.transaction.updateMany({
      where: { categoryId: id },
      data: { categoryId: null },
    });
  }

  // Delete related budgets
  await prisma.budget.deleteMany({ where: { categoryId: id } });

  await prisma.category.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
