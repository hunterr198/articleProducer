/**
 * 两层过滤：关键词预筛 + AI 精筛
 *
 * 目标：只保留跟 AI/ML/科技前沿 相关的 HN 帖子
 * 对标：新智元、机器之心的选题范围
 */

// ===== 第一层：关键词预筛 =====

// Tier 1: 核心 AI/ML 术语（标题命中任一即通过）
// 最后更新：2026-03-21
const TIER1_KEYWORDS = [
  // === 闭源前沿模型 ===
  "LLM", "GPT", "GPT-5", "Claude", "Gemini", "Grok",
  "Sora", "DALL-E", "GPT Image",
  "o1", "o3", "o4",
  // === 开源/开放权重模型 ===
  "Llama", "Mistral", "Mixtral", "Codestral",
  "DeepSeek", "Qwen", "Phi-4",
  "FLUX", "Stable Diffusion", "Midjourney",
  "RWKV", "Gemma",
  // === 中国大模型 ===
  "Kimi", "Moonshot", "月之暗面",
  "ChatGLM", "GLM-4", "GLM-5", "智谱",
  "ERNIE", "文心", "百度",
  "豆包", "Doubao", "字节",
  "Baichuan", "百川",
  "Yi-", "零一万物",
  "MiniMax", "Hailuo", "海螺",
  "阶跃星辰", "StepFun",
  "混元", "Hunyuan",
  "星火", "Spark", "讯飞",
  "SenseNova", "商汤",
  "可灵", "Kling",
  "通义千问", "百炼",
  "Vidu", "生数科技",
  "Seedance",
  // === 模型架构 ===
  "transformer", "diffusion model", "foundation model",
  "large language model", "language model",
  "neural network", "deep learning", "machine learning",
  "reinforcement learning", "mixture of experts", "MoE",
  "state space model", "SSM", "Mamba",
  "vision-language", "multimodal",
  "flash attention", "sparse attention",
  // === Agent 生态 ===
  "AI agent", "agentic", "autonomous agent", "multi-agent",
  "MCP", "Model Context Protocol",
  "A2A", "Agent-to-Agent",
  "function calling", "tool use", "tool calling",
  "computer use", "browser use", "browser automation",
  "LangChain", "LangGraph", "AutoGen", "CrewAI",
  "LlamaIndex", "DSPy", "Semantic Kernel",
  "Haystack", "Pydantic AI", "Smolagents",
  "ReAct", "task decomposition",
  // === Agent 产品 ===
  "Devin", "SWE-agent", "OpenDevin", "OpenHands",
  "Manus", "Claude Code", "Codex CLI",
  "Copilot Workspace", "Replit Agent",
  "OpenCode",
  // === AI 编程工具 ===
  "AI coding", "code generation", "Copilot", "Cursor",
  "Windsurf", "Codeium", "Tabnine", "Aider",
  "Amazon Q Developer", "Gemini Code Assist",
  "Augment Code", "Sourcegraph Cody", "Qodo",
  "vibe coding",
  // === 训练与对齐 ===
  "fine-tuning", "fine tuning", "RLHF", "RLAIF",
  "DPO", "GRPO", "RLVR",
  "instruction tuning", "pre-training", "pretraining",
  "model training", "constitutional AI",
  "superalignment", "scalable oversight",
  "interpretability", "mechanistic interpretability",
  // === 推理与部署 ===
  "RAG", "retrieval augmented", "agentic RAG",
  "vector database", "embeddings",
  "Pinecone", "Weaviate", "Chroma", "Qdrant",
  "prompt engineering", "prompt injection",
  "chain-of-thought", "tree of thought",
  "test-time compute", "inference scaling",
  "reasoning model", "thinking model",
  "context window", "long context",
  "attention mechanism", "tokenizer",
  "scaling law",
  "quantization", "distillation", "inference",
  "speculative decoding", "KV cache",
  "LoRA", "QLoRA", "adapter",
  "GGUF", "GGML", "llama.cpp", "Ollama", "vLLM",
  "TensorRT", "local LLM", "on-device",
  "structured output", "JSON mode",
  // === 多模态生成 ===
  "text-to-image", "text-to-video",
  "text-to-speech", "speech recognition",
  "image generation", "video generation",
  "voice cloning", "TTS",
  "Runway", "Pika", "HeyGen", "Synthesia",
  "ElevenLabs", "Suno", "Udio",
  "Veo", "Imagen",
  // === AI 安全与治理 ===
  "AI safety", "alignment", "red teaming", "jailbreak",
  "AI regulation", "AI governance", "AI Act",
  "EU AI Act", "AI executive order",
  "frontier model", "AI risk", "existential risk",
  "AI audit", "AI transparency", "responsible AI",
  "hallucination", "watermarking",
  // === AI 公司 ===
  "OpenAI", "Anthropic", "DeepMind", "Meta AI",
  "Hugging Face", "Together AI",
  "Groq", "Cerebras", "xAI", "Perplexity",
  "Cohere", "AI21", "Reka",
  "Inflection", "Character.AI",
  "Scale AI", "Weights & Biases",
  "Stability AI", "Black Forest Labs",
  "Cognition", "Figure AI",
  "SambaNova", "Tenstorrent", "Etched",
  "Physical Intelligence",
  // === AI 芯片与硬件 ===
  "AI chip", "GPU", "NVIDIA", "TPU", "CUDA",
  "H100", "H200", "B100", "B200", "GB200", "GB300",
  "Blackwell", "Hopper", "Rubin",
  "NVLink", "DGX",
  "AMD", "MI300", "Instinct",
  "Gaudi", "Trainium", "Inferentia",
  "NPU", "neural engine",
  "HBM", "AI data center",
  "Jensen Huang", "GTC",
  // === 机器人与自动驾驶 ===
  "robotics", "humanoid robot", "embodied AI",
  "autonomous driving", "self-driving",
  "Waymo", "Tesla FSD", "Optimus",
  "Boston Dynamics", "Figure 0", "Unitree",
  "physical AI", "spatial AI",
  "NVIDIA Isaac",
  // === 学术会议与评测 ===
  "ICLR", "NeurIPS", "ICML", "AAAI", "CVPR", "ACL", "EMNLP", "ECCV",
  "arXiv",
  "SWE-bench", "MMLU", "HumanEval", "ARC-AGI",
  "GPQA", "LiveCodeBench", "LM Arena", "Chatbot Arena",
  "Terminal-Bench",
  // === AI 应用领域 ===
  "Copilot", "Cursor",
  "AI for science", "protein folding", "AlphaFold",
  "AI drug discovery", "AI diagnostics",
  "computer vision", "object detection",
  "AGI", "ASI", "superintelligence",
  // === 行业趋势 ===
  "artificial intelligence",
  "synthetic data", "data flywheel",
  "edge AI", "AI native", "AI factory",
  "AI sovereignty", "sovereign AI",
  "benchmark", "open-source model", "open source model",
  "open-weight", "world model",
  "natural language", "NLP",
  "AI startup", "AI infrastructure",
  "MLOps", "compound AI",
  "AI ROI", "inference cost",
  "token economy",
  // === 云 AI 平台 ===
  "Amazon Bedrock", "Azure AI", "Vertex AI",
  "Replicate", "Fireworks AI", "Modal",
];

// Tier 2 已合并到 Tier 1（不再单独使用，所有非 Tier 1 非排除的都交给 AI）

// 排除关键词：命中这些且没命中 Tier 1 的帖子直接排除
// 注意：有交叉可能的词（如 Rust, Docker）不放这里，交给 AI 精筛
const EXCLUSION_KEYWORDS = [
  // 加密货币/区块链
  "cryptocurrency", "bitcoin", "ethereum", "blockchain", "NFT", "Web3",
  "DeFi", "crypto", "token sale", "mining pool", "solana", "dogecoin",
  // 招聘/职业
  "hiring", "job board", "career", "salary", "interview tips",
  "Who is hiring", "Who wants to be hired",
  // 个人理财
  "personal finance", "tax", "mortgage", "investing", "retirement",
  "stock market", "day trading",
  // 硬件 DIY（非 AI）
  "mechanical keyboard", "3D printing", "woodworking", "soldering",
  "gardening", "cooking", "recipe",
  // 自托管/家庭服务器
  "home server", "homelab", "self-hosted", "NAS",
  // 游戏
  "game engine", "Unity", "Unreal", "indie game", "game jam",
  "Steam", "PlayStation", "Xbox", "Nintendo",
  // 纯前端/Web 开发（非 AI）
  "CSS", "HTML", "jQuery", "Bootstrap", "Tailwind",
  // 操作系统/网络协议（非 AI）
  "FreeBSD", "OpenBSD",
  "DNS", "BGP", "SMTP",
  // 编辑器/终端（非 AI）
  "emacs", "neovim",
  // 硬件（非 AI 芯片）
  "FPGA", "RISC-V",
  // 政治/法律（非 AI 治理）
  "supreme court", "election", "lawsuit", "congress", "senate",
  "impeach", "ballot",
  // 运动/娱乐
  "NFL", "NBA", "soccer", "football", "Olympics",
  "movie", "TV show", "Netflix", "Spotify",
  "book review", "reading list",
  // 历史/怀旧
  "turns 80", "turns 50", "anniversary of",
  "retrocomputing", "vintage",
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

  const systemPrompt = `你是「通往 AGI」公众号的选题编辑。你的号对标「新智元」和「机器之心」，核心关注 AI 的发展。

判断标准：**这个话题跟 AI 的训练、推理、应用、商业化、或社会影响有没有直接关系？能不能被「新智元」或「机器之心」写成一篇正式的文章？** 两个条件满足任一即通过。

通过的选题类型：
- AI 模型、架构、训练方法的进展
- AI Agent、AI 编程工具、AI 应用产品
- 直接服务于 AI 的硬件和算力（AI 芯片、GPU 集群、推理加速）
- AI 驱动的机器人和自动驾驶
- AI 安全、对齐、监管政策
- AI 公司的战略动态（融资、收购、产品发布）
- AI 对就业、版权、教育等社会层面的直接冲击

**不通过**的选题：传统软件工程、Web 开发、编程语言、操作系统、网络协议、加密货币、游戏、纯政治、个人理财、硬件 DIY、计算机历史。即使是前沿科技（量子计算、生物技术），如果跟 AI 没有直接关联也不通过。

注意：你收到的帖子都是标题里没有明显 AI 关键词的——它们已经通过了关键词筛选。你的任务是判断这些"看起来不像 AI 话题"的帖子是否其实跟 AI 有直接关系。

域名是重要线索——来自 arxiv.org、openai.com、anthropic.com 的内容大概率相关；来自普通新闻网站的需要看标题内容。`;

  const userPrompt = `请判断以下帖子是否跟 AI 的发展有直接关系。

注意：这些帖子的标题里都没有明显的 AI 关键词，所以你需要"看穿标题表面"来判断。

先看几个边界案例，校准你的判断：

✅ "The $600B Question" → relevant, 0.85, "讲的是 AI 投资泡沫，跟 AI 商业化直接相关"
✅ "Photonic chip cuts inference energy by 90%" (nature.com) → relevant, 0.85, "光子芯片用于推理加速，直接服务于 AI"
✅ "Warranty Void If Regenerated" → relevant, 0.8, "AI 生成内容的版权问题，AI 社会影响"
✅ "Why every junior developer I interview can't code anymore" → relevant, 0.75, "暗示 AI 编程工具导致基础能力退化，AI 对就业的影响"
✅ "Apple hires 200 engineers for secret Cupertino lab" (bloomberg.com) → relevant, 0.7, "很可能是 AI 相关招聘，但标题不明确，给中等置信度"
❌ "Photonic chip for 800G telecom switching" → not relevant, 0.85, "同样是光子芯片，但用于通信而非 AI"
❌ "Show HN: A CLI tool for managing dotfiles" → not relevant, 0.9, "纯开发工具，跟 AI 无关"
❌ "The Unreasonable Effectiveness of PostgreSQL" → not relevant, 0.9, "数据库优化，纯软件工程"
❌ "Why I Left Google After 15 Years" → not relevant, 0.85, "个人职业故事，除非明确提到 AI 团队"
❌ "How We Cut Our AWS Bill by 60%" → not relevant, 0.9, "云成本优化，跟 AI 无直接关系"
❌ "A New Era for Quantum Error Correction" (nature.com) → not relevant, 0.8, "量子计算，前沿科技但跟 AI 没有直接关联"

---

现在请判断以下帖子：

${titleList}

对每个帖子，想一想它跟 AI 的发展有没有直接关系，然后给出判断。
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
        model: "qwen3.5-plus-2026-02-15",
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
