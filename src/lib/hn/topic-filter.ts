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

import { withRetry } from "@/lib/ai/retry";

const DASHSCOPE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";

interface ClassificationResult {
  relevant: boolean;
  category: string;
  confidence: number;
}

/**
 * 第二层 AI 分类
 * 将一批标题发给 Qwen（便宜+快），判断是否属于 AI/科技前沿领域
 * 单次调用处理所有标题，成本 < $0.01
 */
export async function aiClassifyBatch(
  titles: { id: number; title: string }[]
): Promise<Map<number, ClassificationResult>> {
  if (titles.length === 0) return new Map();

  const titleList = titles
    .map((t, i) => `${i + 1}. [ID:${t.id}] ${t.title}`)
    .join("\n");

  const systemPrompt = `你是一位科技媒体编辑，负责判断 Hacker News 上的帖子是否属于以下领域：

**我们关注的领域（返回 relevant: true）：**
- AI/ML/大模型（LLM、GPT、Claude、开源模型、训练、推理、Agent 等）
- AI 芯片和算力（NVIDIA、GPU、TPU、AI 加速器）
- 机器人和具身智能
- AI 应用（AI 编程、AI 搜索、AI 视频/图像生成）
- AI 安全和治理
- AI 领域的学术研究和论文
- AI 公司的重大战略/融资/产品发布
- 前沿计算技术（量子计算、新型架构）

**我们不关注的领域（返回 relevant: false）：**
- 传统软件工程（Web 框架、编程语言、数据库，除非跟 AI 直接相关）
- 政治、法律、社会新闻（除非直接涉及 AI 政策）
- 个人理财、职业建议
- 游戏、娱乐
- 硬件 DIY（除非是 AI 硬件）
- 加密货币、区块链

判断要准确但宽容——如果一个帖子跟 AI/前沿科技有一定关联，就标为 relevant。`;

  const userPrompt = `请对以下 Hacker News 帖子标题进行分类。

${titleList}

对每个帖子，返回 JSON 数组（直接输出 JSON，不要代码块）：
[{"id":ID号,"relevant":true/false,"category":"分类","confidence":0.0-1.0}]

category 从以下选择：AI_Model | AI_Agent | AI_Chip | AI_Safety | AI_Application | AI_Research | AI_Company | Robotics | Frontier_Tech | Not_Relevant`;

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
  stories: { id: number; title: string }[]
): Promise<{
  passed: number[];    // 通过的 story IDs
  rejected: number[];  // 被过滤的 story IDs
  stats: { tier1Pass: number; aiPass: number; rejected: number };
}> {
  const tier1Passed: number[] = [];
  const needsAI: { id: number; title: string }[] = [];
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

  // 第二层：AI 精筛（只处理 "maybe" 的）
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
