import { NextResponse } from "next/server";
import { runCleanup } from "@/lib/db/cleanup";

export async function GET() {
  try {
    const result = await runCleanup();
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
