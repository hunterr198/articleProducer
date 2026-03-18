interface SearchResult {
  title: string;
  snippet: string;
  url: string;
}

export async function searchWeb(query: string, limit = 5): Promise<SearchResult[]> {
  const apiKey = process.env.GOOGLE_CUSTOM_SEARCH_API_KEY;
  const cx = process.env.GOOGLE_CUSTOM_SEARCH_CX;

  if (!apiKey || !cx) {
    console.warn("Google Custom Search not configured, skipping web search");
    return [];
  }

  try {
    const params = new URLSearchParams({
      key: apiKey,
      cx,
      q: query,
      num: String(limit),
    });

    const res = await fetch(`https://www.googleapis.com/customsearch/v1?${params}`);
    if (!res.ok) return [];

    const data = await res.json();
    return (data.items ?? []).map((item: { title: string; snippet: string; link: string }) => ({
      title: item.title,
      snippet: item.snippet,
      url: item.link,
    }));
  } catch {
    return [];
  }
}

// Search Chinese tech media specifically for freshness scoring
export async function searchChineseMedia(query: string): Promise<number> {
  const apiKey = process.env.GOOGLE_CUSTOM_SEARCH_API_KEY;
  const cx = process.env.GOOGLE_CUSTOM_SEARCH_CX;

  if (!apiKey || !cx) return 50; // default middle value

  try {
    const params = new URLSearchParams({
      key: apiKey,
      cx,
      q: `${query} site:jiqizhixin.com OR site:36kr.com OR site:mp.weixin.qq.com`,
      num: "10",
    });

    const res = await fetch(`https://www.googleapis.com/customsearch/v1?${params}`);
    if (!res.ok) return 50;

    const data = await res.json();
    const totalResults = parseInt(data.searchInformation?.totalResults ?? "0");

    // Map result count to coverage score (0-100, higher = more covered)
    if (totalResults === 0) return 0; // not covered at all
    if (totalResults <= 2) return 20;
    if (totalResults <= 5) return 40;
    if (totalResults <= 10) return 60;
    return 80; // heavily covered
  } catch {
    return 50;
  }
}
