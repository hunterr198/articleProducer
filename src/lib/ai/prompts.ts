// --- WRITABILITY EVALUATION (lightweight, no comments needed) ---
export function writabilityPrompt(stories: Array<{
  id: number;
  title: string;
  url?: string;
  score: number;
  commentsCount: number;
}>) {
  const storyList = stories
    .map((s) => `[ID:${s.id}] "${s.title}" | ${s.url ?? "N/A"} | ${s.score}pts ${s.commentsCount}comments`)
    .join("\n");

  return {
    system: `你是「通往 AGI」公众号的选题编辑，对标「新智元」和「机器之心」。
你的任务是评估每个话题能不能写成一篇 2000 字的深度分析文章。

重要：先分析，再打分。大多数话题不值得深度分析——要严格。`,

    user: `# 待评估话题
${storyList}

# 评估方法

对每个话题，按以下 3 个维度各打 1-5 分。先写一句分析理由，再打分。

## 维度 1：话题深度潜力（能不能撑起 2000 字？）
1 = 单一事实，一句话就说完了（如"某公司融了 X 亿"）
2 = 简单新闻，最多写 500 字
3 = 有一定深度，能展开技术原理或背景
4 = 多层次话题，有技术面 + 商业面 + 社会影响
5 = 极佳素材，有争议、有数据、有多方博弈，天然适合长文

## 维度 2：受众匹配度（中国技术从业者在乎吗？）
1 = 跟中国读者几乎无关（如美国本地法规细节）
2 = 小众话题，只有极少数人关心
3 = 有一定相关性，部分读者会感兴趣
4 = 广泛相关，影响大部分技术从业者的工作或认知
5 = 直接影响读者的日常工作或职业决策

## 维度 3：争议与多方博弈（有没有对立观点？）
1 = 无争议，纯公告或事实陈述
2 = 观点较一致，没什么可辩论的
3 = 有一些不同看法，但不强烈
4 = 明确的多方立场，社区有真正的分歧
5 = 尖锐对立，多个利益方公开博弈

# HN 热度参考
HN 的分数和评论数是重要的质量信号：
- 300+ 分或 100+ 评论：社区高度认可，话题几乎一定有深度
- 100-300 分：明确的社区共鸣
- 50 以下分：需要从标题本身判断话题价值

注意：HN 热度是参考信号，不是唯一标准。一个 50 分但话题极具深度的帖子，可能比一个 500 分但内容浅薄的帖子更值得深度分析。

# 输出格式
直接输出 JSON 数组（不要代码块）：
[{"id": ID号, "d1": 1-5, "d2": 1-5, "d3": 1-5, "reason": "一句话总结为什么值得/不值得写"}]`
  };
}

// --- MATERIAL ANALYSIS ---
export function materialAnalysisPrompt(materials: {
  originalContent: string;
  hnComments: string;
  webSearch: string;
}) {
  return {
    system: `You are a research analyst preparing structured materials for a Chinese tech journalist.
Your job is to preserve CONCRETE DETAILS — specific quotes, usernames, data points, and source attributions.
The journalist needs REAL material to cite, not abstract summaries.`,

    user: `# Source Materials

## Original Article
${materials.originalContent.slice(0, 8000)}

## HN Comment Highlights
${materials.hnComments.slice(0, 6000)}

## Supplementary Web Search
${materials.webSearch.slice(0, 3000)}

# Task: Create a structured material pack that PRESERVES concrete details.

CRITICAL RULES:
- For HN comments: Keep the EXACT username and their key argument (paraphrased but attributed)
- For the original article: Keep specific data points, quotes, and the author/publication name
- Do NOT abstract away details into vague summaries — the journalist needs citable facts

Output ONLY valid JSON (no markdown fences):
{
  "source_article": {
    "title": "exact title of the original article",
    "author": "author name if available",
    "publication": "publication/site name",
    "url": "URL",
    "key_facts": ["specific fact 1 with numbers/data", "specific fact 2", "specific fact 3"]
  },
  "hn_quotes": [
    {"username": "@xxx", "stance": "for/against/neutral", "key_argument": "their specific point in 1-2 sentences", "raw_quote": "a memorable short quote from them"},
    {"username": "@yyy", "stance": "for/against/neutral", "key_argument": "...", "raw_quote": "..."}
  ],
  "controversy": "The specific disagreement: Side A says X because... Side B says Y because...",
  "context": "Why this matters in the bigger tech picture",
  "suggested_angle": "Best angle for Chinese tech audience — what's the story here?",
  "discussion_question": "A specific, arguable question (not a generic 'what do you think?')"
}`
  };
}

// --- OUTLINE GENERATION ---
export function outlinePrompt(materialPack: string) {
  return {
    system: `你是一位资深科技内容策划，正在为一个面向中国技术从业者和AI爱好者的公众号策划深度解读文章。你的文章风格介于「新智元」的叙事感和「机器之心」的专业度之间。`,

    user: `# 素材包
${materialPack}

# 任务：设计一篇约 2000 字的深度解读文章大纲

## 文章结构要求（必须包含以下 5-7 个段落）

1. **事件核心**（300-400字）：直接陈述发生了什么、谁做的、关键数据。不要铺垫，第一句话就是最重要的事实。
2. **技术/背景解读**（400-500字）：为什么这件事重要？技术原理或行业背景是什么？用类比让非专家也能理解。要点明一个大多数报道没有提到的"暗线"或深层逻辑。
3. **多方观点**（400-500字）：精选 2-3 个有代表性的观点（可以来自 HN 评论、业内人士、原文作者），呈现正反两面。每个观点后要有你的分析，并明确表态你更认同谁。
4. **洞察与判断**（300-400字）：不要泛泛地说"对行业有影响"。要具体回答：这件事改变了什么游戏规则？读者明天上班需要做什么不同的决策？给出你的明确看法和理由。
5. **结尾**（50-100字）：一个简短的、具体的开放性问题（不是"你怎么看？"这种泛泛之问），语气平实。

## 格式要求
- 每个 section 的 word_target 按上述要求填写
- 总字数目标：1800-2200 字
- 标题不超过 25 字，有悬念感，不用感叹号

输出以下 JSON（不要用 markdown 代码块包裹，直接输出 JSON）：
{"title":"标题","hook":"开头第一句话","sections":[{"heading":"段落小标题","key_points":["要覆盖的信息点1","信息点2","信息点3"],"source_refs":["来自素材包的哪些信息"],"word_target":400}],"closing_question":"结尾的讨论问题"}`
  };
}

// --- ARTICLE GENERATION (Qwen, Chinese) ---
export function articlePrompt(
  outline: string,
  materialPack: string,
  meta: {
    sources: Array<{ title: string; url: string; hnUrl: string; score: number }>;
    images: Array<{ url: string; alt: string }>;
  }
) {
  const imageInstruction = meta.images.length > 0
    ? `\n## 插图
以下是与话题相关的图片，每张都附有描述。请根据描述判断图片内容，在文章合适的位置插入：
${meta.images.map((img, i) => `- 图${i + 1}: ${img.url}（${img.alt || "无描述"}）`).join("\n")}

插图要求：
- 根据图片描述判断它适合放在哪个段落，不要乱放
- 如果图片描述与当前段落内容不相关，就不要插入该图片
- 格式：![使用图片自带的描述](url)
- 不需要把所有图片都用上，只用真正相关的`
    : `\n## 插图
没有可用的配图。请用其他排版元素增强视觉效果：
- 用 > 引用块突出核心观点和 HN 评论
- 用 **加粗** 标记关键数据和结论
- 用 --- 分隔线划分段落节奏
- 不要插入任何图片占位符`;

  const sourcesSection = meta.sources
    .map((s) => `- [${s.title}](${s.url})（HN ${s.score} 分）[讨论](${s.hnUrl})`)
    .join("\n");

  return {
    system: `你是一位在AI和科技领域深耕多年的技术博主，为微信公众号写深度解读文章。

你的文章定位：**基于 Hacker News 热门讨论的中文深度报道**。
- 你不是在写百科全书或科普文，你是在**报道一个正在 HN 社区引发热议的话题**
- 你的文章必须让读者感受到"这件事正在国外技术圈被热烈讨论"
- 你的独特价值是：帮中文读者看到 HN 社区里那些最精彩的观点碰撞

你的风格定位：
- 比「新智元」更克制——不煽情、不用感叹号，但保留叙事感和节奏感
- 比「机器之心」更亲切——不像论文摘要翻译，而是像懂技术的朋友在聊天
- 关键词：**有来源、有引用、有观点、有信息密度**

你的读者是25-40岁的技术从业者、AI应用开发者和对科技商业感兴趣的人。`,

    user: `# 大纲
${outline}

# 素材包
${materialPack}
${imageInstruction}

# 写作要求

## 字数：严格控制在 1800-2200 字
- 超过 2200 字视为不合格，请自行删减
- 这是公众号日报中的深度分析，不是长篇论文
- 紧凑有力，每句话都要有信息量，不要注水
- 不要在正文中插入反问句式的"你觉得呢？""你准备好了吗？"——这不是互动直播

## 语言
- 正文用中文，技术术语保留英文原文（如 Transformer、LLM、fine-tuning）
- 首次出现的术语格式：中文名（English Term），之后直接用英文
- 关键信息和核心观点用 **加粗** 标记（像新智元那样，但不要过度）

## 微信公众号排版风格
- 每个段落加 **加粗小标题**
- 段落要短，每段 2-4 句话（手机阅读优先）
- 用 > 引用块（blockquote）来突出 HN 用户的精彩观点
- 用 **加粗** 标记关键数据、核心结论、重要观点
- 关键段落之间可以用 --- 分隔线增加呼吸感
- 如果有图片链接，用 ![描述](url) 插入到合适位置

## 语气和节奏
- 像一个懂技术的朋友在跟你聊今天圈子里发生了什么——不是在做报告，是在分享
- 句子长短交错——长句解释原理，短句做判断。偶尔一个3-5字的短句
- 加入思考痕迹和个人判断标记："说实话""我觉得""有意思的是""但话说回来""坦白讲""这里有个细节容易被忽略"
- 偶尔插入你作为从业者的亲身感受，比如"做过类似项目的人都知道...""如果你用过X，就会理解..."
- 允许有节奏上的"闲笔"——一句不那么严肃的吐槽或类比，能让文章更像人写的
- 不要用反问句来制造互动感，用陈述式的判断来代替（"我觉得这比X更值得关注"比"你觉得呢？"好得多）

## 开头和来源引用
- **开头直接切入事件本身**，不要写"最近在HN上引发热议"之类的套话
- 好的开头示例：
  - "Anthropic 正式对 OpenCode 提起诉讼，指控其未经授权抓取 Claude 的输出用于模型训练。"
  - "Waymo 刚刚发布了一份长达 80 页的安全报告，数据显示其无人车的事故率比人类司机低 57%。"
  - "一行代码的改动，让一个 24B 参数的模型逻辑推理能力从 22% 飙到 76%。"
- **开头就是最重要的事实**，让读者一句话知道发生了什么
- 来源信息（HN 链接、原文链接）放在文章末尾的"来源与参考"里，不要在正文开头提
- **必须引用原文的具体信息**：发布方、关键数据点、技术细节
- 在"社区声音"段落引用 2-3 个 HN 用户的精彩观点即可，用 > 引用块格式
- 引用要精选——只挑最有代表性的、能推动叙事的观点，不要堆砌
- 引用之后要有你的分析和解读，不是简单罗列
- 同一个用户最多引用一次
- 文章其他段落不要出现 @用户名，用自然的表述替代（如"有开发者指出..."、"反对者认为..."）

## 内容深度与洞察
- 不要浮于表面，每个核心事实后面都要追问"so what"——这件事为什么重要？对谁重要？会改变什么？
- 技术原理要用类比让非专家也能懂（比如"就像..."）
- 给出你自己的明确判断，不要骑墙。好的判断示例："我认为这对中小团队是个坏消息，因为..."
- 在技术解读段落，点明这件事对读者日常工作的具体影响——他们明天上班需要做什么不同的事？
- 在观点碰撞段落，不要只罗列正反方，要说清楚你更认同哪一边、为什么
- 找出事件背后不那么明显的"暗线"——比如商业利益、权力博弈、技术路线之争
- 不要编造任何不在素材包里的事实或数据

## 文章末尾（必须包含）
在文章正文结束后，加上以下来源信息块：

---

**来源与参考**
${sourcesSection}

## 绝对禁止
- ❌ "首先/其次/最后/总而言之/综上所述"
- ❌ "值得注意的是/不可否认/毋庸置疑/不言而喻"
- ❌ "在当今...时代/随着...的发展"
- ❌ "扮演着重要角色/具有重要意义/应运而生/如火如荼"
- ❌ 排比句和对仗句
- ❌ 以总结性段落结尾
- ❌ 结尾用夸张表达（"让你睡不着""细思极恐""脊背发凉""留给我们的时间不多了"）
- ❌ 正文中频繁使用反问句（"你觉得呢？""你准备好了吗？""这意味着什么？"），最多在结尾用一个
- ❌ 感叹号
- ❌ "重磅/炸裂/震惊/颠覆"

直接输出文章正文（Markdown 格式），不要加任何前缀说明。`
  };
}

// --- BRIEF GENERATION (Qwen, Chinese) ---
export function briefPrompt(title: string, score: number, comments: number, summary: string, sourceUrl?: string, hnUrl?: string) {
  const links = [
    sourceUrl ? `[阅读原文](${sourceUrl})` : "",
    hnUrl ? `[讨论](${hnUrl})` : "",
  ].filter(Boolean).join(" | ");

  return {
    system: `你是一位科技媒体编辑，正在写日报快讯栏目。`,
    user: `用 200-250 字写一条科技快讯（严格不超过 250 字，超过视为不合格）。这是公众号日报中的快讯栏目。

素材：
标题：${title}
摘要：${summary}

要求：
- 直接描述事件本身，不要提 Hacker News、热度、评论数等来源信息
- 用 2-3 段把事情说清楚：发生了什么 → 为什么重要 → 一个关键细节或数据
- 关键信息用 **加粗** 标记
- 技术术语保留英文
- 语气客观平实，不加感叹词和夸张表达
${links ? `- 末尾另起一行附链接：${links}` : ""}

直接输出快讯正文（Markdown 格式）。`
  };
}

// --- REVIEW PASS 1: FACT CHECK (Qwen) ---
export function reviewFactCheckPrompt(article: string, materialPack: string) {
  return {
    system: `你是一位严谨的事实核查编辑。你的任务是修正事实错误，但绝不删减内容或缩短文章。`,
    user: `请逐句检查以下文章中的事实性陈述。

规则：
1. 对照素材包验证事实是否准确
2. 如果发现不准确的事实，修改措辞使其更准确（但不要删除整段）
3. 如果文章中出现了素材包里完全没有的具体数据（如具体数字、日期），将其改为更模糊但准确的表述
4. **严禁删除段落或大幅缩短文章。你的工作是修正，不是精简**
5. 修改后的文章字数应与原文基本一致（允许 ±5% 的浮动）

素材包：
${materialPack}

文章：
${article}

请直接输出修改后的完整文章正文，不要加任何前缀说明、不要用 JSON 格式、不要用代码块包裹。直接输出文章内容。`
  };
}

// --- REVIEW PASS 2: DE-AI (Qwen) ---
export function reviewDeAIPrompt(article: string) {
  return {
    system: `你是一位反AI检测专家。你的任务是替换AI腔调的表达，但绝不删减内容或缩短文章。`,
    user: `请检查以下文章，找出所有"AI味"痕迹，用更自然的表达替换：

检查项：
1. 是否包含禁止词汇（首先/其次/值得注意的是/总而言之...）→ 用更口语化的过渡替换
2. 是否存在连续3个以上长度相近的句子 → 改为长短交错
3. 是否存在排比句或对仗句 → 打散结构
4. 是否有段落听起来像教科书或新闻稿 → 改成朋友聊天的语气
5. 结尾是否在做全文总结 → 必须是一个讨论问题

**重要：你只能替换表达方式，不能删除内容。修改后的文章字数必须与原文基本一致（±5%）。**

文章：
${article}

请直接输出修改后的完整文章正文，不要加任何前缀说明、不要用 JSON 格式、不要用代码块包裹。直接输出文章内容。`
  };
}

// --- REVIEW PASS 3: READABILITY (Qwen) ---
export function reviewReadabilityPrompt(article: string) {
  return {
    system: `你是一位资深公众号运营编辑。你的任务是优化阅读体验，但绝不删减内容或缩短文章。`,
    user: `请从公众号读者的角度最终优化这篇文章：

1. 开头前两句能否让人想继续读？如果不够抓人，请重写开头（但保持相同长度）
2. 检查正文中的反问句数量——如果超过1个，必须删减到最多1个（仅保留在结尾）。用陈述式判断替换多余的反问句
3. 超过5句话的长段落，拆分成2-3个短段落（手机阅读体验）
4. 关键信息是否用了 **加粗** 标记？如果没有，添加适当的加粗
5. 结尾是否平实自然？不要煽情夸张的表达
6. 文章读起来是否像一个真人在写？检查是否有"个人判断"和"思考痕迹"（如"我觉得""说实话"），如果没有，适当添加1-2处

**重要：只能优化表达和格式，不能删除任何内容段落。修改后字数必须 >= 原文字数。**

文章：
${article}

请直接输出修改后的完整文章正文，不要加任何前缀说明、不要用 JSON 格式、不要用代码块包裹。直接输出文章内容。`
  };
}

// --- BRIEF SUMMARY FOR SCORING ---
export function briefSummaryPrompt(title: string, url: string | undefined) {
  return {
    system: `Summarize this HN story in 2-3 sentences for a Chinese tech editor to understand what it's about.`,
    user: `Title: ${title}\nURL: ${url ?? "N/A"}\n\nProvide a brief factual summary.`
  };
}
