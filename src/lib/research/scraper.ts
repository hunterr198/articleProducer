import * as cheerio from "cheerio";

export interface ScrapeResult {
  content: string;
  images: string[]; // 提取的图片 URL 列表
}

export async function scrapeUrl(url: string): Promise<ScrapeResult> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ArticleProducer/1.0)" },
    });
    clearTimeout(timeout);

    if (!res.ok) return { content: "", images: [] };
    const html = await res.text();
    const result = extractContent(html, url);

    if (result.content.length >= 200) return result;

    // Fallback: puppeteer for JS-rendered pages
    return await scrapeWithPuppeteer(url);
  } catch {
    return { content: "", images: [] };
  }
}

function extractContent(html: string, url: string): ScrapeResult {
  const $ = cheerio.load(html);

  // Remove noise
  $(
    "script, style, nav, footer, header, aside, .sidebar, .ads, .comments, .nav, .menu, .footer"
  ).remove();

  // Extract images (before removing elements, from the main content area)
  const images: string[] = [];
  const seenUrls = new Set<string>();

  $("article img, main img, .post-content img, .entry-content img, .article-body img, img").each((_, el) => {
    // 优先取 data-src（懒加载真实地址），其次 src
    const src = $(el).attr("data-src") || $(el).attr("src") || "";
    if (!src || seenUrls.has(src)) return;

    // 过滤掉 base64 占位符和 SVG 占位符
    if (src.startsWith("data:")) return;

    // 过滤掉小图标、tracking pixels、logo 等
    const width = parseInt($(el).attr("width") || "0");
    const height = parseInt($(el).attr("height") || "0");
    if ((width > 0 && width < 100) || (height > 0 && height < 100)) return;

    // 过滤掉常见的非内容图片
    const srcLower = src.toLowerCase();
    if (
      srcLower.includes("logo") ||
      srcLower.includes("icon") ||
      srcLower.includes("avatar") ||
      srcLower.includes("favicon") ||
      srcLower.includes("pixel") ||
      srcLower.includes("tracking") ||
      srcLower.includes("badge") ||
      srcLower.includes("button") ||
      srcLower.includes("shields.io") ||
      srcLower.includes("camo.githubusercontent.com") ||
      srcLower.includes("img.shields.io") ||
      srcLower.endsWith(".svg") ||
      (srcLower.endsWith(".gif") && !srcLower.includes("animation"))
    ) return;

    // 处理相对路径
    let absoluteUrl = src;
    try {
      absoluteUrl = new URL(src, url).href;
    } catch { /* keep original */ }

    seenUrls.add(src);
    images.push(absoluteUrl);
  });

  // Special: arXiv
  if (url.includes("arxiv.org")) {
    const abstract = $("blockquote.abstract")
      .text()
      .replace(/^Abstract:\s*/i, "")
      .trim();
    const title = $("h1.title")
      .text()
      .replace(/^Title:\s*/i, "")
      .trim();
    return { content: `${title}\n\n${abstract}`, images: images.slice(0, 5) };
  }

  // Try semantic elements first
  let content = "";
  for (const selector of [
    "article",
    "main",
    "[role='main']",
    ".post-content",
    ".article-content",
    ".entry-content",
  ]) {
    const el = $(selector);
    if (el.length && el.text().trim().length > 200) {
      content = el.text().trim();
      break;
    }
  }

  // Fallback: largest text block
  if (!content || content.length < 200) {
    let maxLen = 0;
    $("div, section").each((_, el) => {
      const text = $(el).text().trim();
      if (text.length > maxLen) {
        maxLen = text.length;
        content = text;
      }
    });
  }

  // Clean up whitespace
  content = content.replace(/\s+/g, " ").trim().slice(0, 10000);

  return { content, images: images.slice(0, 5) }; // 最多保留 5 张图
}

async function scrapeWithPuppeteer(url: string): Promise<ScrapeResult> {
  try {
    const puppeteer = await import("puppeteer");
    const browser = await puppeteer.default.launch({ headless: true });
    const page = await browser.newPage();
    await page.setUserAgent("Mozilla/5.0 (compatible; ArticleProducer/1.0)");
    await page.goto(url, { waitUntil: "networkidle2", timeout: 10000 });
    const html = await page.content();
    await browser.close();
    return extractContent(html, url);
  } catch {
    return { content: "", images: [] };
  }
}
