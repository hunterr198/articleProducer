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

  const systemPrompt = `你是「新智元」和「机器之心」这类中文 AI 科技媒体的选题编辑。

你的公众号只报道 AI 和前沿科技领域的内容。具体来说，你们报道的选题类型包括：
- 大模型发布、评测、架构创新（GPT、Claude、Gemini、Llama、DeepSeek、Qwen 等）
- AI Agent、AI 编程工具、AI 应用产品
- AI 芯片、算力基础设施（NVIDIA、GPU、TPU）
- 机器人、具身智能、自动驾驶
- AI 安全、对齐、治理政策
- AI 学术论文和顶会动态（ICLR、NeurIPS、ICML、arXiv）
- AI 公司的重大战略（融资、收购、IPO、产品发布）
- AI 对行业和社会的直接影响（AI 取代岗位、AI 版权争议、AI 生成内容检测）
- 前沿计算技术（量子计算、新型神经网络架构）

你们**不报道**的内容：传统软件工程、Web 开发、编程语言更新（除非直接服务于 AI）、操作系统、网络协议、加密货币、游戏、政治、法律、个人理财、硬件 DIY、计算机历史回顾。

判断标准：**这个话题能不能被「新智元」或「机器之心」写成一篇正式的文章？** 如果只是跟科技沾边但跟 AI 没有实质关联，就不算。

你会收到每个帖子的标题和来源域名。域名是重要线索——来自 arxiv.org、openai.com、anthropic.com 的内容大概率相关；来自普通新闻网站的需要看标题内容。`;

  const userPrompt = `请判断以下帖子是否属于「新智元」「机器之心」会报道的 AI/前沿科技领域。

先看几个真实案例，校准你的判断边界：

✅ "Nvidia NemoClaw" (nvidia.com) → relevant, 0.95, "NVIDIA AI 产品发布，核心选题"
✅ "AI coding is gambling" → relevant, 0.9, "讨论 AI 编程的局限性，AI 应用话题"
✅ "Snowflake AI Escapes Sandbox and Executes Malware" → relevant, 0.9, "AI 安全事件"
✅ "2% of ICML papers desk rejected because the authors used LLM" → relevant, 0.85, "AI 对学术界的影响"
✅ "Warranty Void If Regenerated" → relevant, 0.8, "AI 生成内容的版权问题，新智元会报道"
✅ "Juggalo Makeup Blocks Facial Recognition Technology" → relevant, 0.75, "AI 人脸识别对抗，AI 安全话题"
❌ "Conway's Game of Life, in real life" → not relevant, 0.85, "经典计算机科学话题，不是 AI"
❌ "Wander – A tiny, decentralised tool to explore the small web" → not relevant, 0.9, "去中心化 Web 工具，跟 AI 无关"
❌ "RX – a new random-access JSON alternative" → not relevant, 0.9, "数据格式/序列化，纯软件工程"
❌ "OpenBSD: PF queues break the 4 Gbps barrier" → not relevant, 0.95, "操作系统网络性能，跟 AI 无关"
❌ "Iran war energy shock sparks global push to reduce fossil fuel dependence" → not relevant, 0.95, "地缘政治/能源，跟 AI 无关"
❌ "A sufficiently detailed spec is code" → not relevant, 0.8, "软件工程方法论，不是 AI 话题"
❌ "Stdwin: Standard window interface by Guido Van Rossum" → not relevant, 0.9, "Python 创始人的历史项目，计算机历史"
❌ "ENIAC, the First General-Purpose Digital Computer, Turns 80" → not relevant, 0.85, "计算机历史回顾"

---

现在请判断以下帖子：

${titleList}

对每个帖子，想一想「新智元」或「机器之心」会不会为它写一篇文章，然后给出判断。
输出 JSON 数组（直接输出，不要代码块）：
[{"id": ID号, "relevant": true/false, "confidence": 0.0-1.0, "reason": "一句话说明"}]`;

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
