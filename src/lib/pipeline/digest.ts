import { db } from "@/lib/db";
import { articles } from "@/lib/db/schema";
import { and, gte } from "drizzle-orm";

export async function assembleDailyDigest(dateStr: string): Promise<string> {
  const dayStart = new Date(`${dateStr}T00:00:00+08:00`);
  const dayEnd = new Date(`${dateStr}T23:59:59+08:00`);

  const allArticles = await db
    .select()
    .from(articles)
    .where(gte(articles.createdAt, dayStart));

  const todayArticles = allArticles.filter(
    (a) => a.createdAt <= dayEnd && a.status !== "failed" && a.status !== "generating"
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
