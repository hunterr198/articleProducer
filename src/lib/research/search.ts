import { searchWithQwen, checkChineseMediaCoverage } from "@/lib/ai/qwen";

interface SearchResult {
  title: string;
  snippet: string;
  url: string;
}

// 使用 Qwen 联网搜索获取补充素材
export async function searchWeb(query: string, _limit = 5): Promise<SearchResult[]> {
  try {
    const result = await searchWithQwen(query);
    // Qwen 返回的是自然语言文本，我们包装成统一格式
    return [{
      title: query,
      snippet: result.slice(0, 2000),
      url: "",
    }];
  } catch {
    return [];
  }
}

// 使用 Qwen 联网搜索评估中文媒体覆盖度
export async function searchChineseMedia(query: string): Promise<number> {
  return checkChineseMediaCoverage(query);
}
