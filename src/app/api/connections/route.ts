import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { basiqClient } from "@/lib/basiq";

// GET /api/connections — list all bank connections
export async function GET() {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const connections = await prisma.bankConnection.findMany({
    include: { accounts: { select: { id: true } } },
    orderBy: { createdAt: "desc" },
  });

  const data = connections.map((c) => ({
    id: c.id,
    institutionName: c.institutionName,
    institutionId: c.institutionId,
    status: c.status,
    lastSyncAt: c.lastSyncAt?.toISOString() || null,
    accountCount: c.accounts.length,
  }));

  return NextResponse.json({ connections: data });
}

// POST /api/connections — get consent URL or create connection
export async function POST(request: NextRequest) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { action } = body;

    if (action === "consent-url") {
      // Check if we have an existing Basiq user, or create one
      let basiqUserId: string;
      const existingConn = await prisma.bankConnection.findFirst();

      if (existingConn) {
        basiqUserId = existingConn.basiqUserId;
      } else {
        // Basiq requires email; mobile is optional but recommended
        const email = body.email || "family@budget.local";
        const mobile = body.mobile || undefined;
        const basiqUser = await basiqClient.createUser(email, mobile);
        basiqUserId = basiqUser.id;
      }

      const consentUrl = await basiqClient.getConsentUrl(basiqUserId);
      return NextResponse.json({ consentUrl, basiqUserId });
    }

    // Register a new connection after consent flow completes
    if (action === "register") {
      const { basiqUserId, basiqConnectionId, institutionId, institutionName } =
        body;

      if (!basiqUserId || !basiqConnectionId) {
        return NextResponse.json(
          { error: "Missing required fields" },
          { status: 400 }
        );
      }

      const connection = await prisma.bankConnection.create({
        data: {
          basiqUserId,
          basiqConnectionId,
          institutionId: institutionId || "unknown",
          institutionName: institutionName || "Unknown Bank",
          status: "active",
        },
      });

      return NextResponse.json({ connection });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err) {
    console.error("Connection error:", err);
    return NextResponse.json(
      { error: "Failed to process connection request" },
      { status: 500 }
    );
  }
}

// DELETE /api/connections?id=xxx
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
      { error: "Connection ID required" },
      { status: 400 }
    );
  }

  await prisma.bankConnection.update({
    where: { id },
    data: { status: "deleted" },
  });

  return NextResponse.json({ success: true });
}
