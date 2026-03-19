import OpenAI from "openai";
import { withRetry } from "./retry";
import {
  articlePrompt,
  briefPrompt,
  reviewFactCheckPrompt,
  reviewDeAIPrompt,
  reviewReadabilityPrompt,
} from "./prompts";

const qwen = new OpenAI({
  apiKey: process.env.DASHSCOPE_API_KEY,
  baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
});

const MODEL = "qwen3.5-plus";

async function qwenChat(
  system: string,
  user: string,
  options: { json?: boolean; search?: boolean } = {}
): Promise<string> {
  const body: Record<string, unknown> = {
    model: MODEL,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: 0.7,
    enable_thinking: false,
  };

  if (options.json) {
    body.response_format = { type: "json_object" };
  }

  if (options.search) {
    body.enable_search = true;
    body.search_options = { search_strategy: "max" };
  }

  const res = await (qwen.chat.completions.create as Function)(body);
  return res.choices[0]?.message?.content ?? "";
}

export async function generateArticle(
  outline: string,
  materialPack: string
): Promise<string> {
  const prompt = articlePrompt(outline, materialPack);
  return withRetry(() => qwenChat(prompt.system, prompt.user));
}

export async function generateBrief(
  title: string, score: number, comments: number, summary: string
): Promise<string> {
  const prompt = briefPrompt(title, score, comments, summary);
  return withRetry(() => qwenChat(prompt.system, prompt.user));
}

export async function reviewArticle(
  article: string,
  pass: "fact_check" | "de_ai" | "readability",
  materialPack?: string
): Promise<{ revised: string; changes: string[] }> {
  let prompt: { system: string; user: string };
  switch (pass) {
    case "fact_check":
      prompt = reviewFactCheckPrompt(article, materialPack ?? "");
      break;
    case "de_ai":
      prompt = reviewDeAIPrompt(article);
      break;
    case "readability":
      prompt = reviewReadabilityPrompt(article);
      break;
  }
  // 审校直接返回纯文本文章，不要求 JSON（长文章的 JSON 输出不可靠）
  const revised = await withRetry(() => qwenChat(prompt.system, prompt.user));
  return { revised, changes: [`${pass} pass completed`] };
}

// --- Qwen 联网搜索能力 ---

// 补充搜索：用 Qwen 联网搜索获取话题背景信息
export async function searchWithQwen(query: string): Promise<string> {
  return withRetry(() =>
    qwenChat(
      "你是一个信息搜索助手。请用中英文搜索以下话题的最新信息，返回关键事实和背景。",
      `请搜索以下话题的相关信息，返回 3-5 条关键事实：\n\n${query}`,
      { search: true }
    )
  );
}

// 新鲜度评估：用 Qwen 联网搜索判断中文媒体覆盖度
export async function checkChineseMediaCoverage(title: string): Promise<number> {
  try {
    const result = await withRetry(() =>
      qwenChat(
        "你是一个中文科技媒体分析师。",
        `请搜索以下话题在中文科技媒体（如机器之心、新智元、量子位、36Kr、InfoQ 等）的报道情况。

话题：${title}

请评估覆盖度并返回 JSON：
{"coverage_score": 0-100, "reason": "一句话说明"}

评分标准：
- 0-20：完全没有中文媒体报道，信息差极大
- 21-40：极少报道，只有零星提及
- 41-60：有一些报道，但缺乏深度分析
- 61-80：多家媒体已报道，但仍有新角度可挖
- 81-100：已被广泛深度报道，信息差很小`,
        { search: true, json: true }
      )
    );
    const parsed = JSON.parse(result);
    return parsed.coverage_score ?? 50;
  } catch {
    return 50; // 默认中间值
  }
}
