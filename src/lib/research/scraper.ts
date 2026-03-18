import * as cheerio from "cheerio";

export async function scrapeUrl(url: string): Promise<string> {
  try {
    // First try: fetch + cheerio (fast)
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ArticleProducer/1.0)" },
    });
    clearTimeout(timeout);

    if (!res.ok) return "";
    const html = await res.text();
    const content = extractContent(html, url);

    if (content.length >= 200) return content;

    // Fallback: puppeteer for JS-rendered pages
    return await scrapeWithPuppeteer(url);
  } catch {
    return "";
  }
}

function extractContent(html: string, url: string): string {
  const $ = cheerio.load(html);

  // Remove noise
  $(
    "script, style, nav, footer, header, aside, .sidebar, .ads, .comments, .nav, .menu, .footer"
  ).remove();

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
    return `${title}\n\n${abstract}`;
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
  return content.replace(/\s+/g, " ").trim().slice(0, 10000);
}

async function scrapeWithPuppeteer(url: string): Promise<string> {
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
    return "";
  }
}
