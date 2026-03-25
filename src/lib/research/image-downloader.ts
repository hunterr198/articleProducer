import { createHash } from "crypto";
import { join } from "path";
import { mkdir, writeFile } from "fs/promises";
import { existsSync } from "fs";
import type { ImageInfo } from "./scraper";

const IMAGE_DIR = join(process.cwd(), "data", "images");

const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

function getExtension(contentType: string, url: string): string | null {
  for (const [mime, ext] of Object.entries(EXT_BY_MIME)) {
    if (contentType.includes(mime)) return ext;
  }
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    for (const ext of ["png", "jpg", "jpeg", "webp", "gif"]) {
      if (pathname.endsWith(`.${ext}`)) return ext === "jpeg" ? "jpg" : ext;
    }
  } catch { /* ignore */ }
  return null;
}

/**
 * Download remote images to data/images/{storyId}/ and return local ImageInfo.
 * Skips images that fail to download or are too small (<1 KB).
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

  return results
    .filter((r): r is PromiseFulfilledResult<ImageInfo | null> => r.status === "fulfilled")
    .map((r) => r.value)
    .filter((v): v is ImageInfo => v !== null);
}

async function downloadOne(
  img: ImageInfo,
  dir: string,
  storyId: number
): Promise<ImageInfo | null> {
  const res = await fetch(img.url, {
    signal: AbortSignal.timeout(15000),
    headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" },
    redirect: "follow",
  });

  if (!res.ok) return null;

  const contentType = res.headers.get("content-type") || "";
  const ext = getExtension(contentType, img.url);
  if (!ext) return null;

  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length < 1024) return null; // skip tiny/broken images

  const hash = createHash("md5").update(buffer).digest("hex").slice(0, 8);
  const filename = `${hash}.${ext}`;
  const filepath = join(dir, filename);

  if (!existsSync(filepath)) {
    await writeFile(filepath, buffer);
  }

  return { url: `/api/images/${storyId}/${filename}`, alt: img.alt };
}
