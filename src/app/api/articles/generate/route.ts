import { NextResponse } from "next/server";
import { generateArticlesForSelection } from "@/lib/pipeline/generator";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { selections } = body as {
      selections: Array<{ dailyScoreId: number; type: "deep_dive" | "brief" }>;
    };

    if (!selections || selections.length === 0) {
      return NextResponse.json(
        { success: false, message: "No selections provided" },
        { status: 400 }
      );
    }

    const result = await generateArticlesForSelection(selections);

    return NextResponse.json({
      success: true,
      articleIds: result.articleIds,
      errors: result.errors,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
