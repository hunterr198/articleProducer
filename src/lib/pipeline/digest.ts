import { db } from "@/lib/db";
import { articles } from "@/lib/db/schema";
import { and, gte } from "drizzle-orm";

export async function assembleDailyDigest(dateStr: string): Promise<string> {
  const dayStart = new Date(`${dateStr}T00:00:00+08:00`);
  const dayEnd = new Date(`${dateStr}T23:59:59+08:00`);

  const allArticles = await db
    .select()
    .from(articles)
    .where(
      and(
        gte(articles.createdAt, dayStart),
      )
    );

  // Filter to today's articles that aren't failed
  const todayArticles = allArticles.filter(
    (a) => a.createdAt <= dayEnd && a.status !== "failed" && a.status !== "generating"
  );

  const deepDives = todayArticles.filter((a) => a.type === "deep_dive");
  const briefs = todayArticles.filter((a) => a.type === "brief");

  let md = `# 科技日报 ${dateStr}\n\n`;

  if (deepDives.length > 0) {
    md += `## 今日深度\n\n`;
    deepDives.forEach((article, i) => {
      const content = article.contentEdited || article.contentReviewed || article.contentMd || "";
      md += `### ${i + 1}. ${article.title ?? "Untitled"}\n\n`;
      md += `${content}\n\n`;
    });
  }

  if (briefs.length > 0) {
    md += `---\n\n## 快讯\n\n`;
    briefs.forEach((article) => {
      const content = article.contentEdited || article.contentReviewed || article.contentMd || "";
      md += `- **${article.title ?? "Untitled"}**：${content}\n\n`;
    });
  }

  md += `---\n\n> 今天的内容就到这里，你对哪个话题最感兴趣？欢迎留言讨论。\n`;

  return md;
}
