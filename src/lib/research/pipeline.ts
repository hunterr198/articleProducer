import { db } from "@/lib/db";
import { research, stories } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { scrapeUrl } from "./scraper";
import { searchWeb } from "./search";
import { fetchStoryWithComments } from "@/lib/hn/algolia-api";
import { analyzeMaterials } from "@/lib/ai/gpt";
import { searchRelatedArticles } from "@/lib/ai/qwen";
import { downloadImages } from "./image-downloader";
import type { MaterialPack } from "@/lib/ai/types";

import type { ImageInfo } from "./scraper";

export interface ResearchResult {
  storyId: number;
  originalContent: string;
  images: ImageInfo[];
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
    fetchStoryWithComments(story.id)
      .then((data) => data?.comments.map((c) => ({ author: c.author, text: c.text })) ?? [])
      .catch(() => [] as { author: string; text: string }[]),

    // C: Web search for supplementary context
    searchWeb(story.title, 3).catch(() => []),
  ]);

  const originalContent = scrapeResult.content;
  let images = scrapeResult.images;

  // 如果爬虫没抓到有效图片，搜索同话题文章并抓取其中的图片
  if (images.length === 0) {
    const relatedUrls = await searchRelatedArticles(story.title);
    for (const url of relatedUrls) {
      const related = await scrapeUrl(url);
      images.push(...related.images);
      if (images.length > 0) break;
    }
  }

  // 下载图片到本地，用本站 URL 替代外链
  images = await downloadImages(images, story.id);

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
    fetchStoryWithComments(s.id)
      .then((data) => data?.comments.map((c) => ({ author: c.author, text: c.text })) ?? [])
      .catch(() => [] as { author: string; text: string }[])
  );

  // 4. Web search using cluster label
  const webSearchPromise = searchWeb(cluster.label, 3).catch(() => []);

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

  // Collect and merge all images from all sources
  const allImages: ImageInfo[] = [];
  const seenUrls = new Set<string>();
  for (const result of scrapeResults) {
    for (const img of result.images) {
      if (!seenUrls.has(img.url)) {
        seenUrls.add(img.url);
        allImages.push(img);
      }
    }
  }
  let images = allImages;

  // 5. If no images found from scraping, search related articles and scrape their images
  if (images.length === 0) {
    const relatedUrls = await searchRelatedArticles(cluster.label);
    for (const url of relatedUrls) {
      const related = await scrapeUrl(url);
      images.push(...related.images);
      if (images.length > 0) break;
    }
  }

  // 下载图片到本地，用本站 URL 替代外链
  images = await downloadImages(images, cluster.primaryStoryId);

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
