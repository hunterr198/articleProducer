import { NextResponse } from "next/server";
import { runDailyAggregation } from "@/lib/pipeline/aggregator";

export async function GET() {
  try {
    const dateStr = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Shanghai",
    }).format(new Date());

    const result = await runDailyAggregation(dateStr);
    return NextResponse.json({ success: true, date: dateStr, ...result });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
