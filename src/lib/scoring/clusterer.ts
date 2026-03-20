/**
 * AI Topic Clustering — group HN stories about the same event/topic
 *
 * Uses Qwen (DashScope) to semantically cluster stories.
 * Most stories remain standalone; only genuinely related stories are merged.
 */

import { db } from "@/lib/db";
import { topicClusters } from "@/lib/db/schema";

interface StoryInput {
  id: number;
  title: string;
  url: string | null;
  score: number;
  commentsCount: number;
}

export interface Cluster {
  id: number; // DB id after insert
  label: string;
  storyIds: number[];
  primaryStoryId: number;
  mergedScore: number;
  mergedComments: number;
  totalAppearances: number;
}

interface AIClusterGroup {
  label: string;
  storyIds: number[];
}

const DASHSCOPE_URL =
  "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return "";
  }
}

/**
 * Call Qwen AI to semantically group stories about the same event/topic.
 * Returns groups with Chinese labels and story IDs.
 */
async function aiClusterStories(
  stories: StoryInput[]
): Promise<AIClusterGroup[]> {
  if (stories.length === 0) return [];

  const storyList = stories
    .map(
      (s) =>
        `[ID:${s.id}] ${s.title}${s.url ? ` (${extractDomain(s.url)})` : ""}`
    )
    .join("\n");

  const systemPrompt = `你是一个新闻话题聚类助手。你的任务是将 Hacker News 上的帖子按"同一事件/话题"进行分组。

规则：
1. 只有真正讨论同一件事的帖子才应该合并。例如同一个产品发布、同一个收购事件、同一篇论文的不同讨论。
2. 大多数帖子应该保持独立（1 个帖子一组），不要过度合并。
3. "AI 相关"或"都是关于 LLM"这种宽泛的共同点不是合并理由。
4. 每个组需要一个简短的中文标签（5-15 字），概括该组话题。
5. 每个帖子只能属于一个组。
6. 所有输入的帖子都必须出现在某个组中，不能遗漏。`;

  const userPrompt = `请将以下帖子按"同一事件/话题"分组。

合并示例：
- "Astral joins OpenAI" + "OpenAI acquires Astral" → 同一收购事件，合并
- "GPT-5 released" + "First impressions of GPT-5" → 同一产品发布，合并
- "Rust vs Go performance" + "New Rust compiler update" → 不同话题，不合并

帖子列表：
${storyList}

输出 JSON 对象，格式：
{"groups": [{"label": "中文标签", "story_ids": [1, 2, 3]}, ...]}

注意：story_ids 里的数字是帖子的 ID（方括号里的数字），不是序号。`;

  try {
    const res = await fetch(DASHSCOPE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.DASHSCOPE_API_KEY}`,
      },
      body: JSON.stringify({
        model: "qwen3.5-plus",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.1,
        enable_thinking: false,
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) throw new Error(`Qwen API error: ${res.status}`);
    const data = await res.json();
    const content = data.choices[0]?.message?.content ?? "{}";

    const parsed = JSON.parse(content);
    let groups: Array<{ label: string; story_ids: number[] }>;

    if (Array.isArray(parsed)) {
      groups = parsed;
    } else if (parsed.groups && Array.isArray(parsed.groups)) {
      groups = parsed.groups;
    } else {
      // Try to find an array in the parsed object
      groups =
        (Object.values(parsed).find(Array.isArray) as Array<{
          label: string;
          story_ids: number[];
        }>) ?? [];
    }

    // Validate: ensure all story IDs are valid
    const validIds = new Set(stories.map((s) => s.id));
    const assignedIds = new Set<number>();
    const validGroups: AIClusterGroup[] = [];

    for (const group of groups) {
      if (!group.label || !Array.isArray(group.story_ids)) continue;
      const validStoryIds = group.story_ids.filter(
        (id) => validIds.has(id) && !assignedIds.has(id)
      );
      if (validStoryIds.length === 0) continue;
      validStoryIds.forEach((id) => assignedIds.add(id));
      validGroups.push({ label: group.label, storyIds: validStoryIds });
    }

    // Any stories not assigned by AI get their own cluster
    for (const story of stories) {
      if (!assignedIds.has(story.id)) {
        validGroups.push({
          label: story.title.slice(0, 30),
          storyIds: [story.id],
        });
      }
    }

    return validGroups;
  } catch (err) {
    console.error("AI clustering failed, falling back to individual clusters:", err);
    // Fallback: each story is its own cluster
    return stories.map((s) => ({
      label: s.title.slice(0, 30),
      storyIds: [s.id],
    }));
  }
}

/**
 * Cluster stories and persist to the topic_clusters table.
 */
export async function clusterStories(
  stories: StoryInput[],
  dateStr: string
): Promise<Cluster[]> {
  // Call Qwen AI to semantically group stories
  const aiGroups = await aiClusterStories(stories);

  // Save clusters to DB and compute merged stats
  const clusters: Cluster[] = [];
  const now = new Date();

  for (const group of aiGroups) {
    const groupStories = stories.filter((s) => group.storyIds.includes(s.id));
    if (groupStories.length === 0) continue;

    const primaryStory = groupStories.reduce((a, b) =>
      a.score > b.score ? a : b
    );

    const mergedScore = Math.max(...groupStories.map((s) => s.score));
    const mergedComments = Math.max(...groupStories.map((s) => s.commentsCount));

    const [inserted] = await db
      .insert(topicClusters)
      .values({
        date: dateStr,
        label: group.label,
        primaryStoryId: primaryStory.id,
        storyIds: JSON.stringify(group.storyIds),
        mergedScore,
        mergedComments,
        totalAppearances: 0, // will be set by scorer
        createdAt: now,
      })
      .returning();

    clusters.push({
      id: inserted.id,
      label: group.label,
      storyIds: group.storyIds,
      primaryStoryId: primaryStory.id,
      mergedScore,
      mergedComments,
      totalAppearances: 0,
    });
  }

  return clusters;
}
