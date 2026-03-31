import { createHash } from "crypto";
import { join } from "path";
import { mkdir, writeFile } from "fs/promises";
import { existsSync } from "fs";
import type { ImageInfo } from "./scraper";

const IMAGE_DIR = join(process.cwd(), "data", "images");

/**
 * Download remote images to data/images/{storyId}/ and return local ImageInfo.
 * Skips images that fail to download or are too small (<1 KB).
 * Falls back to wsrv.nl proxy when direct download fails (for GFW-blocked CDNs).
 */
export async function downloadImages(
  images: ImageInfo[],
  storyId: number
): Promise<ImageInfo[]> {
  if (images.length === 0) return [];

  const dir = join(IMAGE_DIR, String(storyId));
  await mkdir(dir, { recursive: true });

  const results = await Promise.allSettled(
    images.map((img) => downloadOne(img, dir, storyId))
  );

  const downloaded = results
    .filter((r): r is PromiseFulfilledResult<ImageInfo | null> => r.status === "fulfilled")
    .map((r) => r.value)
    .filter((v): v is ImageInfo => v !== null);

  // Always log image download results for debugging
  const failed = images.length - downloaded.length;
  console.log(`[image-dl] story=${storyId}: ${downloaded.length}/${images.length} downloaded${failed > 0 ? `, ${failed} failed` : ""}`);
  if (downloaded.length === 0 && images.length > 0) {
    console.log(`[image-dl] ALL images failed for story=${storyId}. Sample URLs: ${images.slice(0, 3).map(i => i.url.slice(0, 80)).join(", ")}`);
  }

  return downloaded;
}

const BROWSER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

async function downloadOne(
  img: ImageInfo,
  dir: string,
  storyId: number
): Promise<ImageInfo | null> {
  // Try direct download first
  let buffer = await tryFetch(img.url);

  // Fallback: wsrv.nl image proxy (bypasses GFW-blocked CDNs)
  if (!buffer) {
    const proxyUrl = `https://wsrv.nl/?url=${encodeURIComponent(img.url)}&n=-1`;
    buffer = await tryFetch(proxyUrl);
    if (buffer) {
      console.log(`[image-dl] proxy OK: ${img.url.slice(0, 80)}`);
    }
  }

  if (!buffer) {
    console.log(`[image-dl] FAIL: ${img.url.slice(0, 80)}`);
    return null;
  }

  const ext = getExtFromBuffer(buffer, img.url);
  if (!ext) return null;

  const hash = createHash("md5").update(buffer).digest("hex").slice(0, 8);
  const filename = `${hash}.${ext}`;
  const filepath = join(dir, filename);

  if (!existsSync(filepath)) {
    await writeFile(filepath, buffer);
  }

  return { url: `/api/images/${storyId}/${filename}`, alt: img.alt };
}

async function tryFetch(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      headers: { "User-Agent": BROWSER_UA },
      redirect: "follow",
    });

    if (!res.ok) return null;

    const contentType = res.headers.get("content-type") || "";
    // Reject non-image responses
    if (contentType && !contentType.includes("image/")) return null;

    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length < 1024) return null; // skip tiny/broken images

    return buffer;
  } catch {
    return null;
  }
}

function getExtFromBuffer(buffer: Buffer, url: string): string | null {
  // Detect by magic bytes
  if (buffer[0] === 0x89 && buffer[1] === 0x50) return "png";
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return "jpg";
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) return "webp";
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) return "gif";

  // Fallback: try URL extension
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    for (const ext of ["png", "jpg", "jpeg", "webp", "gif"]) {
      if (pathname.endsWith(`.${ext}`)) return ext === "jpeg" ? "jpg" : ext;
    }
  } catch { /* ignore */ }

  return null;
}
