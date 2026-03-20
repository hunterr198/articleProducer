import { db } from "@/lib/db";
import { research } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { scrapeUrl } from "./scraper";
import { searchWeb } from "./search";
import { fetchStoryWithComments } from "@/lib/hn/algolia-api";
import { analyzeMaterials } from "@/lib/ai/gpt";
import type { MaterialPack } from "@/lib/ai/types";

export interface ResearchResult {
  storyId: number;
  originalContent: string;
  images: string[];
  hnComments: { author: string; text: string }[];
  webSearchResults: { title: string; snippet: string; url: string }[];
  materialPack: MaterialPack;
}

export async function runResearch(story: {
  id: number;
  title: string;
  url?: string | null;
  storyType: string | null;
}): Promise<ResearchResult> {
  // Run research tasks in parallel
  const [scrapeResult, commentsData, webSearchResults] = await Promise.all([
    // A: Scrape source article + extract images (skip for Ask HN)
    story.storyType === "ask_hn" || !story.url
      ? Promise.resolve({ content: "", images: [] })
      : scrapeUrl(story.url),

    // B: Fetch HN comments
    fetchStoryWithComments(story.id).then((data) =>
      data?.comments.map((c) => ({ author: c.author, text: c.text })) ?? []
    ),

    // C: Web search for supplementary context
    searchWeb(story.title, 3),
  ]);

  const originalContent = scrapeResult.content;
  const images = scrapeResult.images;

  // Format comments for GPT
  const hnCommentsText = commentsData
    .map((c) => `@${c.author}: ${c.text.replace(/<[^>]*>/g, "").slice(0, 500)}`)
    .join("\n\n");

  // Format search results
  const webSearchText = webSearchResults
    .map((r) => `[${r.title}]: ${r.snippet}`)
    .join("\n\n");

  // GPT analysis: generate structured material pack
  const materialPack = await analyzeMaterials({
    originalContent: originalContent.slice(0, 8000),
    hnComments: hnCommentsText,
    webSearch: webSearchText,
  });

  // Store in database (including images)
  const now = new Date();
  const researchData = {
    originalContent,
    hnComments: JSON.stringify(commentsData),
    webSearch: JSON.stringify({ results: webSearchResults, images }),
    aiSummary: JSON.stringify(materialPack),
    updatedAt: now,
  };

  const existing = await db.query.research.findFirst({
    where: eq(research.storyId, story.id),
  });

  if (existing) {
    await db.update(research).set(researchData).where(eq(research.storyId, story.id));
  } else {
    await db.insert(research).values({
      storyId: story.id,
      ...researchData,
      createdAt: now,
    });
  }

  return {
    storyId: story.id,
    originalContent,
    images,
    hnComments: commentsData,
    webSearchResults,
    materialPack,
  };
}
