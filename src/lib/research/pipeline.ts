import { db } from "@/lib/db";
import { research, stories } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { scrapeUrl } from "./scraper";
import { searchWeb } from "./search";
import { fetchStoryWithComments } from "@/lib/hn/algolia-api";
import { analyzeMaterials } from "@/lib/ai/gpt";
import { searchImages } from "@/lib/ai/qwen";
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
  let images = scrapeResult.images;

  // 如果爬虫没抓到有效图片，用 Qwen 联网搜索补充
  if (images.length === 0) {
    images = await searchImages(story.title);
  }

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

export async function runClusterResearch(cluster: {
  storyIds: number[];
  primaryStoryId: number;
  label: string;
}): Promise<ResearchResult> {
  // 1. Fetch all stories in the cluster from DB
  const clusterStories = await db
    .select()
    .from(stories)
    .where(inArray(stories.id, cluster.storyIds));

  // 2. For each story that has a URL: scrape URL + extract images (in parallel)
  const scrapePromises = clusterStories.map((s) =>
    s.storyType === "ask_hn" || !s.url
      ? Promise.resolve({ content: "", images: [] as string[] })
      : scrapeUrl(s.url)
  );

  // 3. Fetch HN comments for ALL stories (in parallel)
  const commentsPromises = clusterStories.map((s) =>
    fetchStoryWithComments(s.id).then(
      (data) => data?.comments.map((c) => ({ author: c.author, text: c.text })) ?? []
    )
  );

  // 4. Web search using cluster label
  const webSearchPromise = searchWeb(cluster.label, 3);

  // Run all in parallel
  const [scrapeResults, allComments, webSearchResults] = await Promise.all([
    Promise.all(scrapePromises),
    Promise.all(commentsPromises),
    webSearchPromise,
  ]);

  // Merge all scraped content, attributed per source
  const combinedContent = clusterStories
    .map((s, i) => {
      const content = scrapeResults[i].content;
      if (!content) return null;
      return `[来源: ${s.title}]\n${content.slice(0, 4000)}`;
    })
    .filter(Boolean)
    .join("\n\n---\n\n");

  // Merge HN comments from all stories, deduplicate by author (keep first occurrence)
  const seenAuthors = new Set<string>();
  const mergedComments: { author: string; text: string }[] = [];
  for (const commentList of allComments) {
    for (const comment of commentList) {
      if (!seenAuthors.has(comment.author)) {
        seenAuthors.add(comment.author);
        mergedComments.push(comment);
      }
    }
  }

  // Collect and merge all images from all sources, pick best 5
  const allImages: string[] = [];
  for (const result of scrapeResults) {
    allImages.push(...result.images);
  }
  let images = Array.from(new Set(allImages)).slice(0, 5);

  // 5. If no images found from scraping, try searchImages(cluster.label)
  if (images.length === 0) {
    images = await searchImages(cluster.label);
  }

  // Format comments for GPT
  const hnCommentsText = mergedComments
    .map((c) => `@${c.author}: ${c.text.replace(/<[^>]*>/g, "").slice(0, 500)}`)
    .join("\n\n");

  // Format search results
  const webSearchText = webSearchResults
    .map((r) => `[${r.title}]: ${r.snippet}`)
    .join("\n\n");

  // 7. GPT analysis with ALL source content combined (attributed per source)
  const materialPack = await analyzeMaterials({
    originalContent: combinedContent.slice(0, 8000),
    hnComments: hnCommentsText,
    webSearch: webSearchText,
  });

  // 8. Store research with primaryStoryId as key
  const now = new Date();
  const researchData = {
    originalContent: combinedContent,
    hnComments: JSON.stringify(mergedComments),
    webSearch: JSON.stringify({ results: webSearchResults, images }),
    aiSummary: JSON.stringify(materialPack),
    updatedAt: now,
  };

  const existing = await db.query.research.findFirst({
    where: eq(research.storyId, cluster.primaryStoryId),
  });

  if (existing) {
    await db
      .update(research)
      .set(researchData)
      .where(eq(research.storyId, cluster.primaryStoryId));
  } else {
    await db.insert(research).values({
      storyId: cluster.primaryStoryId,
      ...researchData,
      createdAt: now,
    });
  }

  // 9. Return result
  return {
    storyId: cluster.primaryStoryId,
    originalContent: combinedContent,
    images,
    hnComments: mergedComments,
    webSearchResults,
    materialPack,
  };
}
