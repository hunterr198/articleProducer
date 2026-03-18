import { reviewArticle as qwenReview } from "@/lib/ai/qwen";

export interface ReviewResult {
  revised: string;
  log: Array<{ pass: string; changes: string[] }>;
}

export async function reviewArticle(
  article: string,
  materialPack: string,
  type: "deep_dive" | "brief"
): Promise<ReviewResult> {
  const log: ReviewResult["log"] = [];
  let current = article;

  if (type === "deep_dive") {
    // Pass 1: Fact check
    const pass1 = await qwenReview(current, "fact_check", materialPack);
    log.push({ pass: "fact_check", changes: pass1.changes });
    current = pass1.revised;

    // Pass 2: De-AI
    const pass2 = await qwenReview(current, "de_ai");
    log.push({ pass: "de_ai", changes: pass2.changes });
    current = pass2.revised;

    // Pass 3: Readability
    const pass3 = await qwenReview(current, "readability");
    log.push({ pass: "readability", changes: pass3.changes });
    current = pass3.revised;
  } else {
    // Briefs only get de-AI pass
    const pass2 = await qwenReview(current, "de_ai");
    log.push({ pass: "de_ai", changes: pass2.changes });
    current = pass2.revised;
  }

  return { revised: current, log };
}
