/**
 * AI 分析模块（素材分析、大纲生成）
 * 使用 Qwen（DashScope）
 */
import OpenAI from "openai";
import { withRetry } from "./retry";
import {
  materialAnalysisPrompt,
  outlinePrompt,
  briefSummaryPrompt,
} from "./prompts";
import type { MaterialPack, ArticleOutline } from "./types";

const qwen = new OpenAI({
  apiKey: process.env.DASHSCOPE_API_KEY,
  baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
});

const MODEL = "qwen3.5-plus";

async function chatJSON<T>(system: string, user: string): Promise<T> {
  const body: Record<string, unknown> = {
    model: MODEL,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: 0.3,
    enable_thinking: false,
    response_format: { type: "json_object" },
  };
  const res = await (qwen.chat.completions.create as Function)(body);
  const text = res.choices[0]?.message?.content ?? "{}";
  return JSON.parse(text) as T;
}

async function chat(system: string, user: string): Promise<string> {
  const body: Record<string, unknown> = {
    model: MODEL,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: 0.3,
    enable_thinking: false,
  };
  const res = await (qwen.chat.completions.create as Function)(body);
  return res.choices[0]?.message?.content ?? "";
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
