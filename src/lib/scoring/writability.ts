/**
 * AI Writability Evaluation — lightweight batch scoring
 *
 * Uses Qwen to evaluate whether topics are worth a deep-dive article.
 * Scores 3 dimensions (1-5 each), then maps to 0-100.
 */

import { writabilityPrompt } from "@/lib/ai/prompts";

const DASHSCOPE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";

interface WritabilityInput {
  id: number;
  title: string;
  url?: string;
  score: number;
  commentsCount: number;
}

/**
 * Evaluate writability for a batch of stories.
 * Returns a Map of storyId -> writability score (0-100).
 *
 * Dimensions (each 1-5):
 * - d1: Topic depth potential (25%)
 * - d2: Audience relevance (20%)
 * - d3: Controversy / stakeholder richness (20%)
 *
 * Final = (d1*0.25 + d2*0.20 + d3*0.20) / 0.65 * 20
 * Simplified: maps the weighted 1-5 range to 0-100
 */
export async function evaluateWritabilityBatch(
  stories: WritabilityInput[]
): Promise<Map<number, number>> {
  if (stories.length === 0) return new Map();

  const prompt = writabilityPrompt(stories);

  try {
    const res = await fetch(DASHSCOPE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.DASHSCOPE_API_KEY}`,
      },
      body: JSON.stringify({
        model: "qwen3.5-plus-2026-02-15",
        messages: [
          { role: "system", content: prompt.system },
          { role: "user", content: prompt.user },
        ],
        temperature: 0.1,
        enable_thinking: false,
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) throw new Error(`Qwen API error: ${res.status}`);
    const data = await res.json();
    const content = data.choices[0]?.message?.content ?? "[]";

    const parsed = JSON.parse(content);
    const results: any[] = Array.isArray(parsed)
      ? parsed
      : parsed.results ?? Object.values(parsed).find(Array.isArray) ?? [];

    const scoreMap = new Map<number, number>();
    for (const r of results) {
      if (r.id === undefined) continue;
      const d1 = clamp(r.d1 ?? 3, 1, 5);
      const d2 = clamp(r.d2 ?? 3, 1, 5);
      const d3 = clamp(r.d3 ?? 3, 1, 5);
      // Weighted average of dimensions, scaled to 0-100
      // d1 (depth) weighs most at ~38%, d2 (audience) ~31%, d3 (controversy) ~31%
      const weighted = d1 * 0.38 + d2 * 0.31 + d3 * 0.31;
      const score100 = Math.round((weighted - 1) / 4 * 100);
      scoreMap.set(r.id, score100);
    }

    return scoreMap;
  } catch (err) {
    console.error("Writability evaluation failed:", err);
    // Default all to 50 on failure
    const fallback = new Map<number, number>();
    for (const s of stories) fallback.set(s.id, 50);
    return fallback;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
