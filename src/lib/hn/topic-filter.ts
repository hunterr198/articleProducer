/**
 * 两层过滤：关键词预筛 + AI 精筛
 *
 * 目标：只保留跟 AI/ML/科技前沿 相关的 HN 帖子
 * 对标：新智元、机器之心的选题范围
 */

// ===== 第一层：关键词预筛 =====

// Tier 1: 核心 AI/ML 术语（标题命中任一即通过）
const TIER1_KEYWORDS = [
  // 模型和架构
  "LLM", "GPT", "Claude", "Gemini", "Llama", "Mistral", "DeepSeek", "Qwen",
  "Grok", "DALL-E", "Sora", "Midjourney", "Stable Diffusion",
  "transformer", "diffusion model", "foundation model",
  "large language model", "language model",
  "neural network", "deep learning", "machine learning",
  "reinforcement learning",
  // Agent 生态
  "AI agent", "agentic", "MCP protocol", "function calling", "tool use",
  "computer use", "browser automation",
  // 关键技术
  "fine-tuning", "fine tuning", "RLHF", "RAG",
  "retrieval augmented", "vector database", "embeddings",
  "prompt engineering", "chain-of-thought", "reasoning model",
  "context window", "attention mechanism", "tokenizer",
  "mixture of experts", "MoE", "scaling law",
  "Mamba", "state space model", "SSM",
  "quantization", "distillation", "inference",
  "multimodal", "vision-language", "text-to-image", "text-to-video",
  "text-to-speech", "speech recognition",
  // AI 安全
  "AI safety", "alignment", "red teaming", "jailbreak",
  // AI 公司
  "OpenAI", "Anthropic", "DeepMind", "Hugging Face", "Together AI",
  "Groq", "Cerebras", "xAI", "Perplexity",
  // AI 芯片
  "AI chip", "GPU", "NVIDIA", "TPU", "CUDA",
  // 机器人
  "robotics", "humanoid robot", "embodied AI", "autonomous driving",
  // 学术会议
  "ICLR", "NeurIPS", "ICML", "AAAI", "CVPR", "arXiv",
  // AI 应用
  "AI coding", "code generation", "Copilot", "Cursor",
  "AI for science", "protein folding", "AlphaFold",
  "computer vision", "object detection",
  "AGI", "ASI", "superintelligence",
  // 宽泛但高信号的 AI 相关词（原 Tier 2 合并）
  "artificial intelligence", "neural", "model training",
  "pre-training", "benchmark",
  "open-source model", "open source model",
  "synthetic data",
  "edge AI", "on-device",
  "AI regulation", "AI governance",
  "world model",
  "self-driving",
  "natural language", "NLP",
  "image generation", "video generation",
  "AI startup", "AI infrastructure",
  "MLOps",
];

// Tier 2 已合并到 Tier 1（不再单独使用，所有非 Tier 1 非排除的都交给 AI）

// 排除关键词：命中这些且没命中 Tier 1 的帖子直接排除
const EXCLUSION_KEYWORDS = [
  // 加密货币/区块链
  "cryptocurrency", "bitcoin", "ethereum", "blockchain", "NFT", "Web3",
  "DeFi", "crypto", "token sale", "mining pool",
  // 招聘/职业
  "hiring", "job board", "career", "salary", "interview tips",
  "Who is hiring", "Who wants to be hired",
  // 个人理财
  "personal finance", "tax", "mortgage", "investing", "retirement",
  // 硬件 DIY（非 AI）
  "mechanical keyboard", "3D printing", "woodworking", "soldering",
  // 自托管/家庭服务器
  "home server", "homelab", "self-hosted", "NAS",
  // 游戏
  "game engine", "Unity", "Unreal", "indie game", "game jam",
  // 纯前端/Web 开发（非 AI）
  "CSS", "HTML", "jQuery", "Bootstrap", "Tailwind",
  // 政治/法律（非 AI 治理）
  "supreme court", "election", "lawsuit", "congress", "senate",
  // 运动/娱乐
  "NFL", "NBA", "soccer", "football", "Olympics",
  "movie", "TV show", "Netflix", "Spotify",
];

/**
 * 第一层关键词过滤
 * 返回: "pass" | "maybe" | "reject"
 * - pass: 命中 Tier 1，直接通过
 * - maybe: 命中 Tier 2 但没命中 Tier 1，需要 AI 精筛
 * - reject: 没命中任何关键词，或命中排除词
 */
export function keywordFilter(title: string): "pass" | "maybe" | "reject" {
  const titleLower = title.toLowerCase();

  // 检查 Tier 1（大小写不敏感匹配）
  const hitTier1 = TIER1_KEYWORDS.some((kw) =>
    titleLower.includes(kw.toLowerCase())
  );

  if (hitTier1) return "pass"; // Tier 1 命中 → 直接通过（即使同时命中排除词）

  // 检查排除词（明确不相关的领域直接拒绝）
  const hitExclusion = EXCLUSION_KEYWORDS.some((kw) =>
    titleLower.includes(kw.toLowerCase())
  );

  if (hitExclusion) return "reject"; // 没命中 Tier 1 + 命中排除词 → 拒绝

  // 其余所有帖子都交给 AI 判断（宁可多送 AI 审，不漏选）
  return "maybe";
}

// ===== 第二层：AI 精筛 =====

const DASHSCOPE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";

interface ClassificationResult {
  relevant: boolean;
  category: string;
  confidence: number;
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return "";
  }
}

/**
 * 第二层 AI 分类
 *
 * 设计原则（基于调研）：
 * 1. 正面描述意图，不做反面清单（避免粉色大象问题）
 * 2. 用概念性描述而非关键词列表（泛化能力更强）
 * 3. 输入 title + URL（URL 域名是强分类信号）
 * 4. 6-8 个 few-shot 示例（含边界案例 + 推理过程）
 * 5. 输出要求包含 reason（强制 AI 思考，提升准确率）
 */
export async function aiClassifyBatch(
  titles: { id: number; title: string; url?: string }[]
): Promise<Map<number, ClassificationResult>> {
  if (titles.length === 0) return new Map();

  const titleList = titles
    .map((t, i) => `${i + 1}. [ID:${t.id}] ${t.title}${t.url ? ` (${extractDomain(t.url)})` : ""}`)
    .join("\n");

  const systemPrompt = `你是一位资深科技媒体编辑，为一个聚焦 AI 和前沿科技的中文公众号筛选 Hacker News 上的选题。

你的读者是技术从业者和 AI 爱好者。他们关心的是：让机器变得更聪明的一切进展——无论是新的模型、新的工具、新的应用场景，还是这些技术对行业和社会的影响。

你的判断标准很简单：**这个话题能不能写成一篇让我们的读者愿意点开、读完、并且转发到朋友圈的文章？**

宽容一些。如果一个话题跟 AI 或前沿计算有哪怕间接的关联，都值得保留——我们的读者宁可多看到一些可能有趣的内容，也不想错过真正重要的东西。

你会收到每个帖子的标题和来源域名。域名是重要的上下文线索——比如来自 arxiv.org 的内容通常是学术研究，来自 openai.com 的通常是 AI 产品发布。`;

  const userPrompt = `请判断以下帖子是否适合我们的 AI/前沿科技公众号。

先看几个例子，理解我们的判断边界：

**示例 1**: "GPT-5 Released with 1M Context Window" (openai.com)
→ {"relevant": true, "confidence": 0.99, "reason": "AI 模型重大发布，核心选题"}

**示例 2**: "Show HN: I built a React component library"
→ {"relevant": false, "confidence": 0.95, "reason": "纯前端开发工具，跟 AI 无关"}

**示例 3**: "Warranty Void If Regenerated" (pluralistic.net)
→ {"relevant": true, "confidence": 0.8, "reason": "虽然标题不直接提 AI，但讨论的是 AI 生成内容的版权和伦理问题"}

**示例 4**: "Python 3.15's JIT is now back on track" (python.org)
→ {"relevant": true, "confidence": 0.6, "reason": "Python 是 AI 开发的主要语言，JIT 性能提升直接影响 AI 训练和推理效率"}

**示例 5**: "A data center opened next door. Then came the high-pitched whine" (nytimes.com)
→ {"relevant": true, "confidence": 0.65, "reason": "AI 算力基础设施的社会影响，读者会关心 AI 发展带来的现实问题"}

**示例 6**: "Austin's surge of new housing construction drove down rents"
→ {"relevant": false, "confidence": 0.9, "reason": "城市住房政策，跟科技无关"}

**示例 7**: "Juggalo Makeup Blocks Facial Recognition Technology"
→ {"relevant": true, "confidence": 0.7, "reason": "涉及 AI 人脸识别技术的对抗方法，属于 AI 安全和隐私话题"}

**示例 8**: "The math that explains why bell curves are everywhere" (quantamagazine.org)
→ {"relevant": false, "confidence": 0.7, "reason": "纯数学科普，虽然统计学跟 ML 有基础联系，但这篇文章本身不是关于 AI 的"}

---

现在请判断以下帖子：

${titleList}

对每个帖子，先思考它跟 AI/前沿科技的关联，然后给出判断。
输出 JSON 数组（直接输出，不要代码块）：
[{"id": ID号, "relevant": true/false, "confidence": 0.0-1.0, "reason": "一句话说明判断依据"}]`;

  try {
    const res = await fetch(DASHSCOPE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.DASHSCOPE_API_KEY}`,
      },
      body: JSON.stringify({
        model: "qwen3.5-plus",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.1,
        enable_thinking: false,
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) throw new Error(`Qwen API error: ${res.status}`);
    const data = await res.json();
    const content = data.choices[0]?.message?.content ?? "[]";

    // 解析 JSON（可能是数组或包含数组的对象）
    let results: any[];
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) {
      results = parsed;
    } else if (parsed.results && Array.isArray(parsed.results)) {
      results = parsed.results;
    } else {
      results = Object.values(parsed).find(Array.isArray) as any[] ?? [];
    }

    const map = new Map<number, ClassificationResult>();
    for (const r of results) {
      if (r.id !== undefined) {
        map.set(r.id, {
          relevant: r.relevant ?? false,
          category: r.category ?? "Not_Relevant",
          confidence: r.confidence ?? 0,
        });
      }
    }
    return map;
  } catch (err) {
    console.error("AI classification failed:", err);
    // 失败时所有标题默认通过（宁可多选不漏选）
    const map = new Map<number, ClassificationResult>();
    for (const t of titles) {
      map.set(t.id, { relevant: true, category: "Unknown", confidence: 0.5 });
    }
    return map;
  }
}

/**
 * 完整的两层过滤流程
 */
export async function filterTechStories(
  stories: { id: number; title: string; url?: string }[]
): Promise<{
  passed: number[];    // 通过的 story IDs
  rejected: number[];  // 被过滤的 story IDs
  stats: { tier1Pass: number; aiPass: number; rejected: number };
}> {
  const tier1Passed: number[] = [];
  const needsAI: { id: number; title: string; url?: string }[] = [];
  const rejected: number[] = [];

  // 第一层：关键词预筛
  for (const story of stories) {
    const result = keywordFilter(story.title);
    if (result === "pass") {
      tier1Passed.push(story.id);
    } else if (result === "maybe") {
      needsAI.push(story);
    } else {
      rejected.push(story.id);
    }
  }

  // 第二层：AI 精筛（处理所有非关键词命中、非排除的帖子）
  let aiPassed: number[] = [];
  if (needsAI.length > 0) {
    const classifications = await aiClassifyBatch(needsAI);
    for (const story of needsAI) {
      const result = classifications.get(story.id);
      if (result?.relevant && result.confidence >= 0.6) {
        aiPassed.push(story.id);
      } else {
        rejected.push(story.id);
      }
    }
  }

  return {
    passed: [...tier1Passed, ...aiPassed],
    rejected,
    stats: {
      tier1Pass: tier1Passed.length,
      aiPass: aiPassed.length,
      rejected: rejected.length,
    },
  };
}
