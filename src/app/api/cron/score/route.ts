import { NextResponse } from "next/server";
import { runDailyScoring } from "@/lib/scoring/scorer";

export async function GET() {
  try {
    // Use Beijing time for date
    const dateStr = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Shanghai",
    }).format(new Date()); // sv-SE locale gives YYYY-MM-DD format

    const result = await runDailyScoring(dateStr);
    return NextResponse.json({ success: true, date: dateStr, ...result });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
