import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { dailyScores } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { status } = body as { status: "selected_deep" | "selected_brief" | "skipped" };

  await db
    .update(dailyScores)
    .set({ status })
    .where(eq(dailyScores.id, parseInt(id)));

  return NextResponse.json({ success: true });
}
