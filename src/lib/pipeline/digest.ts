import { db } from "@/lib/db";
import { articles, dailyScores } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export async function assembleDailyDigest(dateStr: string): Promise<string> {
  // 按 dailyScores.date 筛选，而非 articles.createdAt（重新生成时 createdAt 会变）
  const todayArticles = await db
    .select({ article: articles })
    .from(articles)
    .innerJoin(dailyScores, eq(articles.dailyScoreId, dailyScores.id))
    .where(and(
      eq(dailyScores.date, dateStr),
    ))
    .then((rows) =>
      rows
        .map((r) => r.article)
        .filter((a) => a.status !== "failed" && a.status !== "generating")
    );

  const deepDives = todayArticles.filter((a) => a.type === "deep_dive");
  const briefs = todayArticles.filter((a) => a.type === "brief");

  const dateDisplay = dateStr.replace(/-/g, ".");

  let md = "";

  // 日报头部
  md += `# 前沿科技热点日报 · ${dateDisplay}\n\n`;
  md += `> 每日精选 AI 与前沿科技领域最值得关注的动态\n\n`;
  md += `---\n\n`;

  // 深度分析
  if (deepDives.length > 0) {
    md += `## 今日深度\n\n`;
    deepDives.forEach((article, i) => {
      const content = article.contentEdited || article.contentReviewed || article.contentMd || "";
      md += `### ${i + 1}. ${article.title ?? "Untitled"}\n\n`;
      md += `${content}\n\n`;
      if (i < deepDives.length - 1) {
        md += `---\n\n`;
      }
    });
  }

  // 快讯
  if (briefs.length > 0) {
    md += `\n---\n\n`;
    md += `## 今日快讯\n\n`;
    briefs.forEach((article, i) => {
      const content = article.contentEdited || article.contentReviewed || article.contentMd || "";
      const title = article.title ?? "Untitled";
      // 每条快讯：编号 + 标题 + 卡片式引用块
      md += `> **${i + 1}. ${title}**\n>\n`;
      const lines = content.split("\n");
      for (const line of lines) {
        md += `> ${line}\n`;
      }
      md += `\n`;
    });
  }

  // 日报尾部
  md += `---\n\n`;
  md += `> 以上就是今天的前沿科技热点，欢迎留言讨论。\n`;

  return md;
}
