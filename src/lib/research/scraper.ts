import * as cheerio from "cheerio";

export interface ImageInfo {
  url: string;
  alt: string; // alt 属性或 figcaption 文字
}

export interface ScrapeResult {
  content: string;
  images: ImageInfo[];
}

export async function scrapeUrl(url: string): Promise<ScrapeResult> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" },
    });
    clearTimeout(timeout);

    if (!res.ok) return { content: "", images: [] };
    const html = await res.text();
    const result = extractContent(html, url);

    if (result.content.length >= 200) return result;

    // Fallback: Jina Reader for JS-rendered / anti-scraping pages
    return await scrapeWithJinaReader(url);
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

  // Extract images with descriptions (alt + figcaption)
  const images: ImageInfo[] = [];
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

    // 提取描述信息：alt 属性 + figcaption + title
    const alt = $(el).attr("alt") || "";
    const title = $(el).attr("title") || "";
    const figcaption = $(el).closest("figure").find("figcaption").text().trim();
    const desc = figcaption || alt || title || "";

    seenUrls.add(src);
    images.push({ url: absoluteUrl, alt: desc });
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
    return { content: `${title}\n\n${abstract}`, images: images.slice(0, 10) };
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

  return { content, images: images.slice(0, 10) };
}

async function scrapeWithJinaReader(url: string): Promise<ScrapeResult> {
  try {
    const res = await fetch(`https://r.jina.ai/${url}`, {
      signal: AbortSignal.timeout(30000),
      headers: {
        Accept: "text/markdown",
        "X-No-Cache": "true",
      },
    });

    if (!res.ok) return { content: "", images: [] };
    const markdown = await res.text();

    // 从 Markdown 中提取图片 URL 和 alt 描述: ![alt](url)
    const images: ImageInfo[] = [];
    const imgRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
    let match;
    while ((match = imgRegex.exec(markdown)) !== null) {
      const imgAlt = match[1];
      const imgUrl = match[2];
      if (imgUrl.startsWith("http") && !imgUrl.endsWith(".svg")) {
        images.push({ url: imgUrl, alt: imgAlt });
      }
    }

    // 去掉 Markdown 图片语法和链接语法，保留纯文本
    const content = markdown
      .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/[#*_>`~-]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 10000);

    return { content, images: images.slice(0, 10) };
  } catch {
    return { content: "", images: [] };
  }
}
