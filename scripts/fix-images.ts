/**
 * 修复已有文章中的外链图片：下载到本地并替换 URL。
 *
 * 用法（在服务器上）：
 *   npx tsx scripts/fix-images.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { db } from "../src/lib/db";
import { articles } from "../src/lib/db/schema";
import { downloadImages } from "../src/lib/research/image-downloader";

const IMG_RE = /!\[([^\]]*)\]\((https?:\/\/[^)]+)\)/g;

async function fixArticle(article: {
  id: number;
  storyId: number | null;
  contentMd: string | null;
  contentReviewed: string | null;
  contentEdited: string | null;
}) {
  const storyId = article.storyId ?? article.id;

  // 收集所有内容字段中的外链图片
  const allContent = [article.contentMd, article.contentReviewed, article.contentEdited]
    .filter(Boolean)
    .join("\n");

  const externalUrls = [...allContent.matchAll(IMG_RE)].map((m) => m[2]);
  // 过滤掉已经是本站地址的
  const remoteUrls = [...new Set(externalUrls.filter((u) => !u.startsWith("/api/images/")))];

  if (remoteUrls.length === 0) {
    console.log(`  [${article.id}] 无外链图片，跳过`);
    return 0;
  }

  console.log(`  [${article.id}] 发现 ${remoteUrls.length} 张外链图片，下载中...`);

  // 下载图片
  const localUrls = await downloadImages(remoteUrls, storyId);

  // 构建替换映射：remote URL → local URL
  const urlMap = new Map<string, string>();
  remoteUrls.forEach((remote, i) => {
    if (localUrls[i]) {
      urlMap.set(remote, localUrls[i]);
    }
  });

  if (urlMap.size === 0) {
    console.log(`  [${article.id}] 所有图片下载失败（可能已过期）`);
    return 0;
  }

  // 替换各内容字段中的 URL
  const replaceUrls = (content: string | null) => {
    if (!content) return content;
    let result = content;
    for (const [remote, local] of urlMap) {
      result = result.split(remote).join(local);
    }
    return result;
  };

  const updates: Record<string, string> = {};
  const newMd = replaceUrls(article.contentMd);
  const newReviewed = replaceUrls(article.contentReviewed);
  const newEdited = replaceUrls(article.contentEdited);

  if (newMd !== article.contentMd) updates.contentMd = newMd!;
  if (newReviewed !== article.contentReviewed) updates.contentReviewed = newReviewed!;
  if (newEdited !== article.contentEdited && newEdited != null) updates.contentEdited = newEdited;

  if (Object.keys(updates).length > 0) {
    const { eq } = await import("drizzle-orm");
    await db
      .update(articles)
      .set({ ...updates, updatedAt: new Date() } as Record<string, unknown>)
      .where(eq(articles.id, article.id));
    console.log(`  [${article.id}] 替换 ${urlMap.size} 张图片 ✓`);
  }

  return urlMap.size;
}

async function main() {
  const allArticles = await db.select().from(articles);
  console.log(`共 ${allArticles.length} 篇文章\n`);

  let totalFixed = 0;
  for (const article of allArticles) {
    totalFixed += await fixArticle(article);
  }

  console.log(`\n完成，共修复 ${totalFixed} 张图片`);
  process.exit(0);
}

main().catch((err) => {
  console.error("脚本执行失败:", err);
  process.exit(1);
});
