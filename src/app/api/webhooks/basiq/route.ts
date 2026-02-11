import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    // Verify webhook secret if configured
    const webhookSecret = process.env.BASIQ_WEBHOOK_SECRET;
    if (webhookSecret) {
      const signature = request.headers.get("x-basiq-signature");
      if (signature !== webhookSecret) {
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }
    }

    const body = await request.json();
    const { eventType, connectionId, userId } = body;

    switch (eventType) {
      case "connection.status.changed": {
        const { status } = body;
        // Update connection status in our DB
        const conn = await prisma.bankConnection.findFirst({
          where: { basiqConnectionId: connectionId },
        });
        if (conn) {
          await prisma.bankConnection.update({
            where: { id: conn.id },
            data: { status: status === "active" ? "active" : "invalid" },
          });
        }
        break;
      }

      case "transaction.updated": {
        // Could trigger a sync for this connection
        console.log(
          `Transaction updated webhook for user ${userId}, connection ${connectionId}`
        );
        break;
      }

      default:
        console.log(`Unhandled webhook event: ${eventType}`);
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("Webhook error:", err);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}
