import OpenAI from "openai";
import { withRetry } from "./retry";
import {
  writabilityPrompt,
  materialAnalysisPrompt,
  outlinePrompt,
  briefSummaryPrompt,
} from "./prompts";
import type { WritabilityEvaluation, MaterialPack, ArticleOutline } from "./types";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function chatJSON<T>(system: string, user: string): Promise<T> {
  const res = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: 0.3,
    response_format: { type: "json_object" },
  });
  const text = res.choices[0]?.message?.content ?? "{}";
  return JSON.parse(text) as T;
}

async function chat(system: string, user: string): Promise<string> {
  const res = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: 0.3,
  });
  return res.choices[0]?.message?.content ?? "";
}

export async function evaluateWritability(
  story: { title: string; url?: string; score: number; commentsCount: number; time: string },
  topComments: string
): Promise<WritabilityEvaluation> {
  const prompt = writabilityPrompt({ ...story, topComments });
  return withRetry(() => chatJSON<WritabilityEvaluation>(prompt.system, prompt.user));
}

export async function analyzeMaterials(materials: {
  originalContent: string;
  hnComments: string;
  webSearch: string;
}): Promise<MaterialPack> {
  const prompt = materialAnalysisPrompt(materials);
  return withRetry(() => chatJSON<MaterialPack>(prompt.system, prompt.user));
}

export async function generateOutline(
  materialPack: string
): Promise<ArticleOutline> {
  const prompt = outlinePrompt(materialPack);
  return withRetry(() => chatJSON<ArticleOutline>(prompt.system, prompt.user));
}

export async function generateBriefSummary(
  title: string, url?: string
): Promise<string> {
  const prompt = briefSummaryPrompt(title, url);
  return withRetry(() => chat(prompt.system, prompt.user));
}
