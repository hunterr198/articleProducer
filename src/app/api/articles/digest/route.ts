import { NextRequest, NextResponse } from "next/server";
import { assembleDailyDigest } from "@/lib/pipeline/digest";
import { markdownToWechat } from "@/lib/publish/markdown-to-wechat";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  // Default to today in Beijing time (UTC+8)
  const defaultDate = new Date(Date.now() + 8 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const dateStr = searchParams.get("date") ?? defaultDate;

  const markdown = await assembleDailyDigest(dateStr);
  const html = await markdownToWechat(markdown);

  return NextResponse.json({ date: dateStr, markdown, html });
}
