import { NextResponse } from "next/server";
import { runDailyAggregation } from "@/lib/pipeline/aggregator";
import { generateDailyDigest } from "@/lib/pipeline/generator";

export async function GET() {
  try {
    const dateStr = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Shanghai",
    }).format(new Date());

    // Phase 1: Aggregate (filter + cluster + score + auto-select)
    const aggResult = await runDailyAggregation(dateStr);

    // Phase 2: Generate articles for auto-selected topics
    let genResult = null;
    if (aggResult.deepDives > 0 || aggResult.briefs > 0) {
      genResult = await generateDailyDigest(dateStr);
    }

    return NextResponse.json({
      success: true,
      date: dateStr,
      aggregation: aggResult,
      generation: genResult,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
