import { withRetry } from "./retry";
import {
  articlePrompt,
  briefPrompt,
  reviewFactCheckPrompt,
  reviewDeAIPrompt,
  reviewReadabilityPrompt,
} from "./prompts";

const DASHSCOPE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";

async function qwenChat(system: string, user: string, json = false): Promise<string> {
  const res = await fetch(DASHSCOPE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.DASHSCOPE_API_KEY}`,
    },
    body: JSON.stringify({
      model: "qwen-plus",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.7,
      ...(json ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  if (!res.ok) throw new Error(`Qwen API error: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.choices[0]?.message?.content ?? "";
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
  const result = await withRetry(() => qwenChat(prompt.system, prompt.user, true));
  try {
    return JSON.parse(result);
  } catch {
    // If JSON parsing fails, return the raw text as the revised article
    return { revised: result, changes: ["Failed to parse JSON response, returning raw text"] };
  }
}
