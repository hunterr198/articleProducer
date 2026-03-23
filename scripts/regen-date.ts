/**
 * 重新生成指定日期的日报文章。
 *
 * 用法：npx tsx scripts/regen-date.ts 2026-03-22
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { db } from "../src/lib/db";
import { articles, dailyScores } from "../src/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { generateDailyDigest } from "../src/lib/pipeline/generator";

async function main() {
  const dateStr = process.argv[2];
  if (!dateStr) {
    console.error("用法: npx tsx scripts/regen-date.ts <日期>\n例如: npx tsx scripts/regen-date.ts 2026-03-22");
    process.exit(1);
  }

  // 找出该日期已有的文章并删除，让 generateDailyDigest 重新生成
  const scores = await db
    .select({ id: dailyScores.id })
    .from(dailyScores)
    .where(eq(dailyScores.date, dateStr));

  const scoreIds = scores.map((s) => s.id);
  if (scoreIds.length === 0) {
    console.error(`${dateStr} 没有评分数据，无法重新生成`);
    process.exit(1);
  }

  const existing = await db
    .select({ id: articles.id })
    .from(articles)
    .where(inArray(articles.dailyScoreId, scoreIds));

  if (existing.length > 0) {
    const ids = existing.map((a) => a.id);
    await db.delete(articles).where(inArray(articles.id, ids));
    console.log(`已删除 ${dateStr} 的 ${ids.length} 篇旧文章 (IDs: ${ids.join(", ")})`);
  }

  console.log(`开始重新生成 ${dateStr} 的日报...\n`);
  const result = await generateDailyDigest(dateStr);

  console.log(`\n生成完成:`);
  console.log(`  深度文章: ${result.deepDiveIds.length} 篇 (IDs: ${result.deepDiveIds.join(", ")})`);
  console.log(`  快讯: ${result.briefIds.length} 篇 (IDs: ${result.briefIds.join(", ")})`);
  if (result.errors.length > 0) {
    console.log(`  错误: ${result.errors.join("\n    ")}`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("执行失败:", err);
  process.exit(1);
});
