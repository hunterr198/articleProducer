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
    system: `你是一位资深科技内容策划，正在为一个面向中国技术从业者和AI爱好者的公众号策划深度解读文章。`,

    user: `# 素材包
${materialPack}

# 任务：设计文章大纲

要求：
- 开头：用一个具体场景、数据点或反直觉的事实引入
- 中间：按逻辑递进（是什么→为什么重要→社区怎么看→对我们的影响）
- 结尾：抛出一个能引发评论区讨论的开放性问题，不要做全文总结
- 总字数目标：300-500字

输出以下 JSON（不要用 markdown 代码块包裹，直接输出 JSON）：
{"title":"标题（不超过30字，不用感叹号，要有悬念感）","hook":"开头第一句话（要让人想继续读）","sections":[{"heading":"小标题（可选）","key_points":["要覆盖的信息点"],"source_refs":["来自素材包的哪些信息"],"word_target":100}],"closing_question":"结尾的讨论问题"}`
  };
}

// --- ARTICLE GENERATION (Qwen, Chinese) ---
export function articlePrompt(outline: string, materialPack: string) {
  return {
    system: `你是一位在AI和科技领域深耕多年的技术博主。你的风格介于"机器之心"的严谨和科技播客的亲切之间——专业但不学术，有观点但不煽情。你的读者是25-40岁的技术从业者、AI应用开发者和对科技商业感兴趣的人。`,

    user: `# 大纲
${outline}

# 素材包
${materialPack}

# 写作风格要求

## 语言
- 正文用中文，技术术语保留英文原文（如 Transformer、LLM、fine-tuning）
- 首次出现的术语格式：中文名（English Term）
- 之后直接用英文即可

## 语气和节奏
- 像一个懂技术的朋友在跟你聊今天圈子里发生了什么
- 句子长短交错——长句解释原理，短句做判断。偶尔用一个3-5字的短句制造节奏感
- 可以用反问句和设问句增加互动感
- 段落长短不一，有的段落可以只有一两句话
- 适当加入思考过程的痕迹："说实话""我觉得""有意思的是"

## 内容要求
- 引用 HN 评论区的观点时标注 "HN 网友 @username 提到"
- 如果有争议，呈现正反两方观点，然后给出你的判断
- 用具体例子和类比解释抽象概念
- 每段都要提供新信息或新视角

## 绝对禁止（违反任何一条请重写该段落）
- ❌ "首先/其次/最后/总而言之/综上所述"
- ❌ "值得注意的是/不可否认/毋庸置疑/不言而喻"
- ❌ "在当今...时代/随着...的发展"
- ❌ "扮演着重要角色/具有重要意义/应运而生/如火如荼"
- ❌ 排比句和对仗句
- ❌ 以总结性段落结尾
- ❌ 感叹号
- ❌ "重磅/炸裂/震惊/颠覆"

# 字数：300-500字，宁可精炼也不要注水。直接输出文章正文，不要加任何前缀说明。`
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
    system: `你是一位严谨的事实核查编辑。`,
    user: `请逐句检查以下文章中的事实性陈述。

对于每个事实性陈述：
1. 对照素材包验证是否准确
2. 标注确信度：高/中/低
3. 如果确信度为"中"或"低"，修改措辞使其更准确
4. 如果文章中出现了素材包里没有的信息，标记为"可能是AI幻觉"并删除

素材包：
${materialPack}

文章：
${article}

输出格式（直接输出 JSON，不要用 markdown 代码块）：
{"revised":"修改后的完整文章","changes":["修改1的说明","修改2的说明"]}`
  };
}

// --- REVIEW PASS 2: DE-AI (Qwen) ---
export function reviewDeAIPrompt(article: string) {
  return {
    system: `你是一位反AI检测专家。`,
    user: `请检查以下文章，找出所有"AI味"痕迹并修改：

检查项：
1. 是否包含禁止词汇（首先/其次/值得注意的是/总而言之...）
2. 是否存在连续3个以上长度相近的句子（需改为长短交错）
3. 是否存在排比句或对仗句
4. 是否有段落听起来像教科书或新闻稿而不像朋友聊天
5. 结尾是否在做全文总结（应该是一个讨论问题）

文章：
${article}

输出格式（直接输出 JSON，不要用 markdown 代码块）：
{"revised":"修改后的完整文章","changes":["修改1: 原文→修改后 (原因)"]}`
  };
}

// --- REVIEW PASS 3: READABILITY (Qwen) ---
export function reviewReadabilityPrompt(article: string) {
  return {
    system: `你是一位公众号运营编辑。`,
    user: `请从公众号读者的角度最终优化这篇文章：

1. 开头前两句能否让人想继续读？如果不够抓人，请重写
2. 有没有可以加入互动元素的地方（反问、"你觉得呢？"）
3. 段落节奏是否舒服？有没有需要拆分的长段落？
4. 结尾的讨论问题是否足够开放、足够有讨论性？
5. 标题是否在30字以内、有悬念感、没有感叹号？

只修改需要改的部分，其余保持不变。

文章：
${article}

输出格式（直接输出 JSON，不要用 markdown 代码块）：
{"revised":"最终版本文章","changes":["修改说明1"]}`
  };
}

// --- BRIEF SUMMARY FOR SCORING (GPT) ---
export function briefSummaryPrompt(title: string, url: string | undefined) {
  return {
    system: `Summarize this HN story in 2-3 sentences for a Chinese tech editor to understand what it's about.`,
    user: `Title: ${title}\nURL: ${url ?? "N/A"}\n\nProvide a brief factual summary.`
  };
}
