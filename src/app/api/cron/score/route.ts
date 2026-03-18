import { NextResponse } from "next/server";
import { runDailyScoring } from "@/lib/scoring/scorer";
import { evaluateTopCandidates } from "@/lib/scoring/ai-evaluator";

export async function GET() {
  try {
    // Use Beijing time for date
    const dateStr = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Shanghai",
    }).format(new Date()); // sv-SE locale gives YYYY-MM-DD format

    const result = await runDailyScoring(dateStr);

    let aiResult: { evaluated: number; errors: string[] } | null = null;
    if (result.candidatesCount > 0) {
      try {
        aiResult = await evaluateTopCandidates(dateStr);
      } catch (aiError) {
        console.error("AI evaluation failed:", aiError);
        // Basic scoring still succeeded; AI eval failure is non-fatal
      }
    }

    return NextResponse.json({
      success: true,
      date: dateStr,
      ...result,
      aiEvaluation: aiResult,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
