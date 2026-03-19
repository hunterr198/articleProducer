// --- WRITABILITY EVALUATION (GPT, English) ---
export function writabilityPrompt(story: {
  title: string; url?: string; score: number;
  commentsCount: number; time: string; topComments: string;
}) {
  return {
    system: `You are a senior tech editor at a Chinese tech media outlet.
Your job is to evaluate whether a Hacker News story is worth writing a deep-dive article about for Chinese tech professionals.

IMPORTANT: Complete ALL analysis steps before providing scores. Be critical — most stories are NOT worth a deep dive.`,

    user: `# Story Data
Title: ${story.title}
URL: ${story.url ?? "N/A"}
Score: ${story.score}
Comments: ${story.commentsCount}
Posted: ${story.time}
Top HN Comments:
${story.topComments}

# Evaluation Process — complete ALL steps in order

## Step 1: Content Analysis
- What is the core topic? Classify: AI/ML | Security | Open Source | Industry | Dev Tools | Research | Other
- What is genuinely NEW here?

## Step 2: Discussion Quality
- What are the main viewpoints in HN comments?
- Is there genuine disagreement or just consensus?

## Step 3: Devil's Advocate
List 2-3 reasons why this story might NOT be worth covering.

## Step 4: Audience Fit
Would Chinese tech professionals (25-40, engineers/PMs/AI practitioners) care? Why?

## Step 5: Scoring (ONLY after Steps 1-4)

### writability [0-100]
0-20: Just a link, no depth | 21-40: Simple news | 41-60: Some depth
61-80: Rich topic, multiple angles | 81-100: Excellent material, strong narrative

### audience_fit [0-100]
0-20: Irrelevant | 21-40: Niche only | 41-60: Moderate
61-80: Broadly relevant | 81-100: Directly impacts readers' work

### freshness [0-100]
0-20: Already widely covered in Chinese media | 41-60: Partially covered
61-80: Barely covered, clear gap | 81-100: Completely new to Chinese audience

# Output: respond with ONLY valid JSON (no markdown fences, no extra text)
{"topic_category":"...","core_novelty":"one sentence","devil_advocate_concerns":["...","..."],"recommended_angle":"...","discussion_question":"...","scores":{"writability":0,"audience_fit":0,"freshness":0},"verdict":"deep_dive","verdict_reason":"one sentence"}`
  };
}

// --- MATERIAL ANALYSIS (GPT, English) ---
export function materialAnalysisPrompt(materials: {
  originalContent: string;
  hnComments: string;
  webSearch: string;
}) {
  return {
    system: `You are a research analyst preparing structured materials for a Chinese tech article writer.
Extract key facts, insights, and controversy from the provided sources. Be precise and cite sources.`,

    user: `# Source Materials

## Original Article
${materials.originalContent.slice(0, 8000)}

## HN Comment Highlights
${materials.hnComments.slice(0, 4000)}

## Supplementary Web Search
${materials.webSearch.slice(0, 3000)}

# Task: Create a structured material pack. Output ONLY valid JSON (no markdown fences):
{"core_facts":"What happened, who did it, what result (2-3 sentences)","key_insights":["Insight from original article","Unique perspective from HN comments (@username)","Background context from search"],"controversy":"Main disagreement in the community, or None if consensus","context":"Why this matters in the bigger tech picture","suggested_angle":"Best angle for Chinese tech audience","discussion_question":"Open question to provoke reader discussion"}`
  };
}

// --- OUTLINE GENERATION (GPT, Chinese output) ---
export function outlinePrompt(materialPack: string) {
  return {
    system: `你是一位资深科技内容策划，正在为一个面向中国技术从业者和AI爱好者的公众号策划深度解读文章。你的文章风格介于「新智元」的叙事感和「机器之心」的专业度之间。`,

    user: `# 素材包
${materialPack}

# 任务：设计一篇 2000-3000 字的深度解读文章大纲

## 文章结构要求（必须包含以下 5-7 个段落）

1. **开场钩子**（200-300字）：用一个具体场景、震撼数据或反直觉的事实引入。不要用"随着...的发展"。要让读者3秒内被抓住。
2. **事件本身**（300-500字）：到底发生了什么？谁做了什么？核心技术/产品/事件的关键信息。要有具体的数据、参数、时间线。
3. **技术解读**（300-500字）：为什么这件事在技术上重要？底层原理是什么？和已有方案相比有何不同？用类比让非专家也能理解。
4. **社区声音**（300-400字）：HN 评论区的精华观点。必须引用至少 2-3 个具体用户的观点，呈现正反两面。不是简单罗列，而是用这些观点推动叙事。
5. **行业影响**（200-300字）：这件事对行业/开发者/用户意味着什么？谁会受益？谁会受冲击？
6. **编辑观点**（200-300字）：你的判断。不骑墙，给出一个明确的看法，但要有论据支撑。
7. **讨论收尾**（100-150字）：抛出一个尖锐的、值得争论的开放性问题。不要做全文总结。

## 格式要求
- 每个 section 的 word_target 按上述要求填写
- 总字数目标：2000-3000 字
- 标题不超过 25 字，有悬念感，不用感叹号

输出以下 JSON（不要用 markdown 代码块包裹，直接输出 JSON）：
{"title":"标题","hook":"开头第一句话","sections":[{"heading":"段落小标题","key_points":["要覆盖的信息点1","信息点2","信息点3"],"source_refs":["来自素材包的哪些信息"],"word_target":400}],"closing_question":"结尾的讨论问题"}`
  };
}

// --- ARTICLE GENERATION (Qwen, Chinese) ---
export function articlePrompt(outline: string, materialPack: string) {
  return {
    system: `你是一位在AI和科技领域深耕多年的技术博主，为微信公众号写深度解读文章。

你的风格定位：
- 比「新智元」更克制——不煽情、不用感叹号，但保留叙事感和节奏感
- 比「机器之心」更亲切——不像论文摘要翻译，而是像懂技术的朋友在聊天
- 关键词：**专业、有观点、有温度、有信息密度**

你的读者是25-40岁的技术从业者、AI应用开发者和对科技商业感兴趣的人。他们爱折腾，但不一定是纯技术人员。`,

    user: `# 大纲
${outline}

# 素材包
${materialPack}

# 写作要求

## 字数：2000-3000 字（这是硬性要求，不是建议）
- 这是一篇公众号深度文章，不是摘要
- 每个大纲段落都要充分展开，不要跳过或压缩
- 如果某个段落信息不够写到目标字数，用类比、延伸分析、行业对比来充实

## 语言
- 正文用中文，技术术语保留英文原文（如 Transformer、LLM、fine-tuning）
- 首次出现的术语格式：中文名（English Term），之后直接用英文
- 关键信息和核心观点用 **加粗** 标记（像新智元那样，但不要过度）

## 语气和节奏
- 像一个懂技术的朋友在跟你聊今天圈子里发生了什么
- 句子长短交错——长句解释原理，短句做判断。偶尔一个3-5字的短句
- 段落要短，每段 2-4 句话（手机阅读体验）
- 适当用反问句和设问句增加互动感
- 加入思考痕迹："说实话""我觉得""有意思的是""但话说回来"

## 内容深度
- 不要浮于表面，要挖到"so what"——这件事为什么重要？对谁重要？
- 引用 HN 评论区的观点时标注 "HN 网友 @username 指出"
- 至少引用 2-3 个 HN 用户的具体观点，呈现正反两面
- 技术原理要用类比让非专家也能懂（比如"就像..."）
- 给出你自己的明确判断，不要骑墙

## 文章结构
- 每个段落加 **加粗小标题**
- 段落之间用自然过渡，不用"首先/其次/最后"
- 结尾必须是一个尖锐的讨论问题，不是全文总结

## 绝对禁止
- ❌ "首先/其次/最后/总而言之/综上所述"
- ❌ "值得注意的是/不可否认/毋庸置疑/不言而喻"
- ❌ "在当今...时代/随着...的发展"
- ❌ "扮演着重要角色/具有重要意义/应运而生/如火如荼"
- ❌ 排比句和对仗句
- ❌ 以总结性段落结尾
- ❌ 感叹号
- ❌ "重磅/炸裂/震惊/颠覆"

直接输出文章正文（Markdown 格式），不要加任何前缀说明。`
  };
}

// --- BRIEF GENERATION (Qwen, Chinese) ---
export function briefPrompt(title: string, score: number, comments: number, summary: string) {
  return {
    system: `你是一位科技博主，正在写科技快讯。`,
    user: `用80-120字写一条科技快讯。

素材：
标题：${title}
分数：${score} 评论：${comments}
摘要：${summary}

要求：
- 第一句：发生了什么（who did what）
- 第二句：为什么重要（so what）
- 可选第三句：一个有趣的细节或数据点
- 技术术语保留英文
- 不加任何评论和感叹词

直接输出快讯正文。`
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

输出格式（直接输出 JSON，不要用 markdown 代码块）：
{"revised":"修改后的完整文章（长度必须与原文基本一致）","changes":["修改1的说明","修改2的说明"]}`
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

**重要：你只能替换表达方式，不能删除内容。修改后的文章字数必须与原文基本一致（±5%）。每处修改都是"替换"而不是"删除"。**

文章：
${article}

输出格式（直接输出 JSON，不要用 markdown 代码块）：
{"revised":"修改后的完整文章（长度必须与原文基本一致）","changes":["修改1: 原文→修改后 (原因)"]}`
  };
}

// --- REVIEW PASS 3: READABILITY (Qwen) ---
export function reviewReadabilityPrompt(article: string) {
  return {
    system: `你是一位资深公众号运营编辑。你的任务是优化阅读体验，但绝不删减内容或缩短文章。`,
    user: `请从公众号读者的角度最终优化这篇文章：

1. 开头前两句能否让人想继续读？如果不够抓人，请重写开头（但保持相同长度）
2. 有没有可以加入互动元素的地方（反问、"你觉得呢？"）
3. 超过5句话的长段落，拆分成2-3个短段落（手机阅读体验）
4. 关键信息是否用了 **加粗** 标记？如果没有，添加适当的加粗
5. 结尾的讨论问题是否足够尖锐、值得争论？

**重要：只能优化表达和格式，不能删除任何内容段落。修改后字数必须 >= 原文字数。**

文章：
${article}

输出格式（直接输出 JSON，不要用 markdown 代码块）：
{"revised":"最终版本文章（长度必须 >= 原文）","changes":["修改说明1"]}`
  };
}

// --- BRIEF SUMMARY FOR SCORING (GPT) ---
export function briefSummaryPrompt(title: string, url: string | undefined) {
  return {
    system: `Summarize this HN story in 2-3 sentences for a Chinese tech editor to understand what it's about.`,
    user: `Title: ${title}\nURL: ${url ?? "N/A"}\n\nProvide a brief factual summary.`
  };
}
