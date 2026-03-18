# HN Article Producer - Design Spec

## Overview

A semi-automated system that tracks Hacker News hot topics, evaluates their article-worthiness through multi-sample weighted scoring, and generates high-quality Chinese tech articles for WeChat Official Account publishing.

**Target audience**: Tech professionals, AI practitioners, and tech-business enthusiasts (25-40 years old).

**Content format**: Daily digest with 3 deep-dive analyses (300-500 words each) + several news briefs (80-120 words each).

**Content focus (Phase 1)**: Cutting-edge technology analysis. Phase 2 may expand to tech business opportunities.

---

## System Architecture

### Data Flow

```
[Every 3 hours] HN Official API + Algolia API
        ↓
   ① Data Collection: Fetch Top Stories + metadata
        ↓
   ② Persistence: Store snapshots in SQLite
        ↓
[Daily 21:00 Beijing Time]
   ③ Weighted Scoring: 5-dimension scoring across all daily samples
        ↓
   ④ Candidate List: Generate Top N candidates → push to Web UI
        ↓
[User action]
   ⑤ Topic Selection: Pick 3 deep-dives + briefs on Web UI
        ↓
   ⑥ Research: Auto-crawl source article + HN comments + web search
        ↓
   ⑦ Article Generation: GPT analysis → Qwen writing → 3-pass review
        ↓
   ⑧ Edit & Publish: Preview/edit on Web → md2wechat → WeChat draft box
```

### Tech Stack

| Component | Choice | Rationale |
|---|---|---|
| Framework | Next.js 15 (App Router) | Full-stack in one project |
| UI | shadcn/ui + Tailwind CSS | Professional admin UI, fast development |
| Database | SQLite + Drizzle ORM | Zero-config, local-friendly, type-safe |
| Scheduler | macOS launchd + API routes | OS-level scheduling, survives sleep/restart |
| HN Data (ranking) | Official Firebase API | Real-time front page ranking |
| HN Data (details) | Algolia HN Search API | Bulk queries, comment trees, search |
| Web Scraping | cheerio (static) + puppeteer (dynamic) | Cover most web pages |
| AI - Analysis | OpenAI GPT API | Best English comprehension + structured analysis |
| AI - Writing | Qwen API (Alibaba DashScope) | Best natural Chinese output |
| Web Search | Google Custom Search API | Freshness scoring + supplementary research |
| Article Format | Markdown → md2wechat converter | WeChat-compatible HTML output |

### Project Structure

```
articleProducer/
├── src/
│   ├── app/                    # Next.js pages
│   │   ├── page.tsx            # Dashboard
│   │   ├── topics/             # Topic candidate list
│   │   ├── articles/           # Article management
│   │   └── api/                # API Routes
│   │       ├── cron/           # Cron task triggers
│   │       ├── topics/         # Topic CRUD
│   │       ├── articles/       # Article CRUD
│   │       └── publish/        # Publishing
│   ├── lib/
│   │   ├── hn/                 # HN data fetching
│   │   ├── scoring/            # Weighted scoring algorithm
│   │   ├── research/           # Research (crawling + search)
│   │   ├── ai/                 # AI calls (GPT + Qwen)
│   │   ├── review/             # 3-pass review pipeline
│   │   └── db/                 # Database schema + operations
│   └── components/             # UI components
├── drizzle/                    # Database migrations
├── public/
├── package.json
└── next.config.ts
```

---

## Dual API Data Source Strategy

### Official HN Firebase API

- **Base URL**: `https://hacker-news.firebaseio.com/v0/`
- **Used for**: Getting current front page ranking (`/v0/topstories.json` → 500 IDs)
- **Strengths**: Real-time, official, no auth required, no rate limit
- **Limitations**: One item per request for details

### Algolia HN Search API

- **Base URL**: `https://hn.algolia.com/api/v1/`
- **Used for**: Bulk story details, full comment trees, search
- **Relationship with HN**: Official partner (YC W14 company). HN's own search bar uses it.
- **Data freshness**: 1-3 minutes behind real-time under normal conditions
- **Known risk**: ~1 major indexing outage per year (24-48h). Mitigated by official API fallback.
- **Rate limits**: No concern for our 8 requests/day pattern

### Combined Usage

```
Each sample:
  1. Official API → /v0/topstories.json → current ranking (who is #1, #30, etc.)
  2. Algolia API → bulk fetch story details (score, comments, URL)
  3. Store snapshot in SQLite

After topic selection:
  Algolia API → /items/{id} → full comment tree for research

Fallback (Algolia outage):
  Official API → /v0/item/{id}.json → fetch details one by one (slower but works)
```

---

## Scheduling Design

### Timezone Consideration

HN is most active during US business hours:
- US Pacific 9:00-18:00 = Beijing 01:00-10:00
- US Eastern 9:00-18:00 = Beijing 22:00-07:00

### Schedule

| Beijing Time | Sample # | HN Activity (Pacific) | Action |
|---|---|---|---|
| 00:00 | #1 | 08:00 - HN waking up | Sample |
| 03:00 | #2 | 11:00 - Morning peak | Sample |
| 06:00 | #3 | 14:00 - Afternoon peak | Sample |
| 09:00 | #4 | 17:00 - Late afternoon | Sample |
| 12:00 | #5 | 20:00 - Evening active | Sample |
| 15:00 | #6 | 23:00 - Declining | Sample |
| 18:00 | #7 | 02:00 - Low activity | Sample |
| 21:00 | #8 | 05:00 - Low activity | Sample + **Trigger weighted scoring** |
| 21:05 | — | — | Top N candidates ready in Web UI |
| After 21:05 | — | — | User selects topics → generates articles |

8 samples/day covers the full HN activity cycle, ensuring we capture slow-building stories that rise over many hours.

### Scheduling Implementation

Use **macOS launchd** (not in-process node-cron) to trigger samples via HTTP requests to the Next.js API:

```
launchd plist → curl http://localhost:3000/api/cron/sample  (every 3 hours)
launchd plist → curl http://localhost:3000/api/cron/score   (daily 21:00)
```

**Why launchd over node-cron**: launchd is OS-level — it survives process crashes, Next.js restarts, and will execute missed jobs when the machine wakes from sleep. node-cron only runs while the Node.js process is alive.

**Sleep/missed sample handling**: If the machine was asleep during a scheduled sample, launchd triggers it on wake. The API route checks `sampled_at` timestamps and skips if a sample was already taken within the last 2 hours (deduplication). The scoring algorithm at 21:00 works with however many samples were collected (minimum 4 samples required for meaningful scoring; if fewer, defer to next day).

---

## Weighted Scoring Algorithm

### 5 Dimensions

#### 1. Sustained Presence (持续热度) — Weight: 0.25

```
score = (appearance_count / total_samples_today) × 100
```

Stories that appear repeatedly across samples indicate sustained interest, filtering out flash-in-the-pan spikes.

#### 2. Discussion Depth (讨论深度) — Weight: 0.25

```
score = normalize(comments_count) × 0.5
      + normalize(comments_to_score_ratio) × 0.5
```

Normalization uses log-scale (suitable for HN's power-law distribution):
```
normalize(value) = log(1 + value) / log(1 + max_value_today) × 100
```

Key insight from research: HN's own algorithm PENALIZES high-controversy posts (comments >> votes). But these are often the BEST candidates for deep-dive articles because they have genuine debate and multiple viewpoints.

#### 3. Growth Trend (增长趋势) — Weight: 0.20

```
score = normalize(latest_score - first_seen_score) × 0.5
      + normalize(comment_growth_rate) × 0.5
```

Same log-scale normalization as above. Rising stories have more timeliness value than stories that have already peaked.

#### 4. Content Writability (内容可写性) — Weight: 0.20

```
score = GPT evaluation (0-100) using the analysis prompt
```

AI evaluates whether the topic has enough depth, multiple angles, and sufficient source material to sustain a 300-500 word article. Includes "Devil's Advocate" step to counteract LLM agreeableness bias.

**Cost optimization**: Writability evaluation only runs on the top ~30 candidates after dimensions 1-3 are computed (these are purely algorithmic and free). This avoids calling GPT for hundreds of stories.

#### 5. Freshness (新鲜度) — Weight: 0.10

```
score = 100 - chinese_media_coverage_score
```

Use Google Custom Search API (or SerpAPI as alternative) to search Chinese tech sites for the topic. Count results from known outlets (新智元, 机器之心, 量子位, 36Kr) to estimate coverage level. Cost: ~$5/month for Google Custom Search (100 queries/day free tier).

### Final Score

```
final_score = sustained_presence × 0.25
            + discussion_depth × 0.25
            + growth_trend × 0.20
            + writability × 0.20
            + freshness × 0.10
```

### Cooling Mechanism

Stories that were selected in previous days receive a decay penalty to avoid repetition:

| Days since last selected | Decay factor |
|---|---|
| 1 day ago | 0.3 |
| 2 days ago | 0.6 |
| 3+ days ago | 1.0 (no penalty) |

```
adjusted_score = final_score × decay_factor
```

Prevents the same topic from dominating multiple consecutive days unless there are significant new developments.

---

## Database Design

### Tables

#### stories (HN posts, deduplicated)

| Column | Type | Description |
|---|---|---|
| id | INTEGER PK | HN original ID |
| title | TEXT NOT NULL | Title |
| url | TEXT | Source URL |
| author | TEXT | Author |
| story_type | TEXT | 'story' / 'ask_hn' / 'show_hn' / 'poll' |
| score | INTEGER | Latest score (updated each sample) |
| comments_count | INTEGER | Latest comment count |
| story_text | TEXT | Self-post body (Ask HN, etc.) |
| hn_created_at | DATETIME | Post time on HN |
| first_seen_at | DATETIME | First seen in our samples |
| last_seen_at | DATETIME | Last seen on front page |
| created_at | DATETIME | Record creation |
| updated_at | DATETIME | Record update |

#### snapshots (per-sample records)

| Column | Type | Description |
|---|---|---|
| id | INTEGER PK | Auto-increment |
| story_id | INTEGER FK → stories | Related story |
| sampled_at | DATETIME | Sample timestamp |
| rank | INTEGER | Rank in Top Stories at sample time |
| score | INTEGER | Score at sample time |
| comments_count | INTEGER | Comments at sample time |
| created_at | DATETIME | Record creation |

#### daily_scores (daily weighted scores)

| Column | Type | Description |
|---|---|---|
| id | INTEGER PK | Auto-increment |
| story_id | INTEGER FK → stories | Related story |
| date | DATE | Which day |
| appearance_count | INTEGER | Times appeared in samples |
| discussion_score | FLOAT | Discussion depth score |
| trend_score | FLOAT | Growth trend score |
| writability_score | FLOAT | Content writability score (AI) |
| freshness_score | FLOAT | Freshness score |
| final_score | FLOAT | Weighted final score |
| ai_analysis | TEXT (JSON) | Full GPT analysis output |
| status | TEXT | 'candidate' / 'selected_deep' / 'selected_brief' / 'skipped' |
| created_at | DATETIME | Record creation |

#### articles (generated articles)

| Column | Type | Description |
|---|---|---|
| id | INTEGER PK | Auto-increment |
| story_id | INTEGER FK → stories | Related HN story |
| daily_score_id | INTEGER FK → daily_scores | Related daily score |
| type | TEXT | 'deep_dive' / 'brief' |
| title | TEXT | Article title |
| content_md | TEXT | Markdown body (initial) |
| content_reviewed | TEXT | After 3-pass review |
| content_edited | TEXT | After user manual edits (preserves reviewed version) |
| outline | TEXT (JSON) | GPT-generated outline |
| status | TEXT | 'draft' / 'reviewed' / 'edited' / 'published' |
| review_log | TEXT (JSON) | Review pass details |
| published_at | DATETIME | Publish time |
| created_at | DATETIME | Record creation |
| updated_at | DATETIME | Record update |

#### research (research materials)

| Column | Type | Description |
|---|---|---|
| id | INTEGER PK | Auto-increment |
| story_id | INTEGER FK → stories | Related story |
| original_content | TEXT | Scraped source article |
| hn_comments | TEXT (JSON) | Selected HN comments |
| web_search | TEXT (JSON) | Supplementary search results |
| ai_summary | TEXT (JSON) | GPT structured material pack |
| created_at | DATETIME | Record creation |
| updated_at | DATETIME | Record update |

### Data Retention

| Data | Retention | Reason |
|---|---|---|
| stories | Permanent | Small, useful for history |
| snapshots | 30 days | Largest table, old data not useful |
| daily_scores | Permanent | Small, traceable topic selection history |
| articles | Permanent | Content assets |
| research | 90 days | Large, diminishing value post-publish |

---

## Web Admin UI

### 4 Pages

#### 1. Dashboard (/)

Status overview:
- Last/next sample time, success status
- Today's sample progress (e.g., 5/8)
- Today's candidate count, pending selection count, generated article count
- Recent sample log (time, status, new stories found)

#### 2. Topic Selection (/topics)

Core interaction page, used after 21:00 daily scoring:
- List of candidate stories sorted by final_score
- Category filter (AI/ML, Security, Open Source, etc.)
- Each card shows: title, score, comments, appearance count, 5-dimension score bars, AI recommendation reason
- Actions per card: "Deep Dive" / "Brief" / "Skip"
- "Generate Articles" button triggers the AI pipeline

#### 3. Article Management (/articles)

- List of generated articles with status filters (draft / reviewed / edited / published)
- Each row: title, type badge, word count, status, generation time
- Actions: Preview / Edit / Push to WeChat

#### 4. Article Editor (/articles/[id])

- Left panel: Markdown editor
- Right panel: Live rendered preview
- Bottom: Collapsible research materials (original article, HN comments, search results)
- Actions: Save / Push to WeChat Draft

---

## AI Pipeline

### Overview

```
Selected topic
    ↓
Step 1: Research (crawling + search)           ~15s
    ↓
Step 2: GPT Analysis → Structured material pack ~10s
    ↓
Step 3: GPT Generate article outline            ~5s
    ↓
Step 4: Qwen Generate Chinese article           ~15s
    ↓
Step 5: 3-pass review                           ~15s
    ↓
Finished article (draft status)          Total: ~1min/article
```

### Step 1: Research

Parallel execution for each selected topic:

- **A. Scrape source article**: cheerio extracts main content from the HN story's URL. For arXiv papers, extract abstract and key sections.
- **B. Extract HN comment highlights**: Algolia `/items/{id}` → full comment tree → sort by votes → take Top 20 substantive comments (filter out one-liners, +1s, emojis).
- **C. Supplementary web search**: Search engine API → "{topic keywords}" → scrape top 3-5 results for background/context.

Output stored in `research` table.

### Step 2: GPT Analysis → Structured Material Pack

Feed raw research to GPT. Output:

```json
{
  "core_facts": "Core facts: who did what, with what results",
  "key_insights": [
    "Insight from original article",
    "Unique perspective from HN comments",
    "Background from supplementary search"
  ],
  "controversy": "Main points of disagreement in the community",
  "context": "Why this matters in the bigger picture",
  "suggested_angle": "Recommended angle for Chinese audience",
  "discussion_question": "Question to provoke reader discussion"
}
```

### Step 3: GPT Generate Article Outline

Based on material pack, generate structured outline:

```json
{
  "title": "Title (≤30 chars, no exclamation marks, with suspense)",
  "hook": "Opening line (must make people want to read on)",
  "sections": [
    {
      "heading": "Section title (optional)",
      "key_points": ["Information points to cover"],
      "source_refs": ["Which material pack info to use"],
      "word_target": 100
    }
  ],
  "closing_question": "Discussion-provoking question"
}
```

### Step 4: Qwen Generate Chinese Article

Qwen receives outline + material pack + detailed style prompt.

**Style requirements baked into prompt**:
- Chinese body text with English technical terms preserved
- Conversational tone ("like a tech-savvy friend chatting")
- Variable sentence length (mix long explanations with short punchy lines)
- Cite HN comments with attribution ("HN user @xxx noted...")
- Present both sides of controversies

**Explicit blacklist in prompt**:
- No "首先/其次/最后/总而言之/综上所述"
- No "值得注意的是/不可否认/毋庸置疑"
- No "在当今...时代/随着...的发展"
- No parallel constructions (排比句)
- No exclamation marks
- No summary paragraph at the end

**Brief articles** use a separate, simpler prompt: 80-120 words, what happened + why it matters + one interesting detail.

### Step 5: 3-Pass Review

All passes executed by Qwen:

| Pass | Focus | Key Checks |
|---|---|---|
| 1. Fact Check | Accuracy | Verify against material pack; flag potential hallucinations; check numbers/names/dates |
| 2. De-AI | Style | Remove blacklisted phrases; fix uniform sentence lengths; ensure conversational tone; check ending is a question not a summary |
| 3. Readability | Polish | Opening hooks reader?; rhythm comfortable?; discussion question genuinely open? |

Each pass outputs the modified article + change log. Final version stored in `articles.content_reviewed`.

### Deep Dive vs Brief Processing Differences

| Step | Deep Dive | Brief |
|---|---|---|
| Research | Full (article + comments + search) | Metadata only |
| GPT Analysis | Full structured pack | Simple summary |
| Outline | 4-section structure | None |
| Qwen Writing | 300-500 words | 80-120 words |
| Review | All 3 passes | Pass 2 only (de-AI) |

### Daily Digest Assembly

After all articles are generated, auto-assemble into a single Markdown document:

```markdown
# 科技日报 2026-03-18

## 今日深度

### 1. [Deep dive title]
[Deep dive content...]

### 2. [Deep dive title]
[Deep dive content...]

### 3. [Deep dive title]
[Deep dive content...]

---

## 快讯

- **[Brief title]**: [Brief content...]
- **[Brief title]**: [Brief content...]
- **[Brief title]**: [Brief content...]

---

> 今天的内容就到这里，你对哪个话题最感兴趣？欢迎留言讨论。
```

---

## Article Style Guide

### Positioning

"Tech-savvy friend sharing what's happening in the tech world" — professional but not academic, opinionated but not sensational.

### Writing Principles

| Principle | Do | Don't |
|---|---|---|
| Tone | Conversational, knowledgeable friend | News anchor, textbook |
| Opening | Concrete scene, data point, or counter-intuitive fact | "随着AI技术的发展..." |
| Structure | Logical progression (what → why → so what) | Parallel listing (首先/其次/最后) |
| Opinions | Clear editorial stance on each topic | Neutral fence-sitting |
| Ending | Open question for discussion | Summary of the article |
| Technical depth | "Just enough to understand" | Deep-dive into implementation details |
| Exclamation marks | Never | "重磅！炸裂！" |

### Language Rules

- Body in Chinese, technical terms in English
- First mention: 大语言模型 (LLM)
- Subsequent mentions: use whichever is more natural
- Never-translate terms: Transformer, Token, GPU, API, fine-tuning, open source project names

---

## Publishing Pipeline

1. User reviews/edits article in Web editor
2. User clicks "Push to WeChat"
3. System converts Markdown → WeChat HTML via md2wechat
4. Upload to WeChat Official Account draft box via WeChat API
5. User does final review in WeChat editor and publishes

---

## Cost Estimate

### AI API Costs

| Step | Model | Tokens/article | Cost/article |
|---|---|---|---|
| Analysis (Step 2) | GPT | ~3K in + ~1K out | ~$0.014 |
| Outline (Step 3) | GPT | ~2K in + ~0.5K out | ~$0.008 |
| Writing (Step 4) | Qwen | ~3K in + ~1.5K out | ~$0.001 |
| Review (Step 5) | Qwen | ~5K in + ~2K out | ~$0.002 |
| Writability eval | GPT | ~2K in + ~0.5K out | ~$0.008 |
| **Total per deep dive** | | | **~$0.033** |
| **Total per brief** | | | **~$0.005** |

**Daily cost** (3 deep dives + 5 briefs + writability eval for ~15 candidates): **~$0.25/day**

**Monthly cost**: **~$7.50/month**

### Infrastructure

- Local machine only (no cloud costs)
- SQLite (no database server)
- HN APIs (free, no auth)
- Google Custom Search API: free tier 100 queries/day (sufficient); paid ~$5/month if exceeded

---

## Error Handling & Resilience

### Sampling Failures

| Scenario | Handling |
|---|---|
| HN Official API down | Skip ranking data, use Algolia-only mode for this sample |
| Algolia API down | Fall back to Official API (fetch details one by one, slower) |
| Both APIs down | Log error, skip this sample. Scoring requires minimum 4 samples/day |
| Machine was asleep | launchd triggers on wake; API deduplicates (skip if sampled within 2 hours) |
| Next.js process not running | launchd curl fails; user sees error in system logs. Provide a startup script that launches Next.js + verifies it's running |

### AI Pipeline Failures

| Scenario | Handling |
|---|---|
| GPT API timeout/error | Retry up to 2 times with exponential backoff (5s, 15s). If still failing, mark article as 'failed' with error message |
| Qwen API timeout/error | Same retry policy. Fall back to GPT for writing if Qwen is persistently down |
| Web scraping blocked/failed | Skip source article scraping; proceed with HN comments + search only. Article gets a "limited sources" flag |
| Search API failed | Skip freshness scoring (default to 50) and supplementary research. Proceed with available materials |
| Partial pipeline failure | Save intermediate state (research, outline, draft) so pipeline can resume from last successful step |

### Monitoring

- Dashboard shows last sample status and any errors
- Failed samples and API errors logged to `system_logs` table
- Consider adding desktop notifications (macOS Notification Center) for critical failures

---

## Database Indexes

```sql
-- Snapshot queries (find all snapshots for a story today)
CREATE INDEX idx_snapshots_story_sampled ON snapshots(story_id, sampled_at);
CREATE INDEX idx_snapshots_sampled ON snapshots(sampled_at);

-- Daily score queries (today's candidates)
CREATE INDEX idx_daily_scores_date_status ON daily_scores(date, status);
CREATE INDEX idx_daily_scores_story_date ON daily_scores(story_id, date);

-- Article queries (filter by status)
CREATE INDEX idx_articles_status ON articles(status);
```

---

## WeChat Publishing Integration

### Account Requirements

WeChat Official Account API requires a **verified Service Account** (服务号). Subscription accounts (订阅号) have limited API access and cannot use the draft API.

### Authentication

- Obtain `AppID` and `AppSecret` from WeChat Official Platform
- Access token refresh: tokens expire every 2 hours; implement auto-refresh with a token cache
- Store credentials in `.env.local` (never commit to git)

### Publishing Flow

```
1. Markdown → WeChat-compatible HTML (via md2wechat Node module or built-in converter)
2. Upload article images to WeChat media API → get media_ids
3. POST to /cgi-bin/draft/add with HTML content + media_ids
4. Return draft URL for user to review in WeChat editor
```

### Fallback (if WeChat API setup is deferred)

Phase 1 can skip WeChat API integration entirely:
- "Push to WeChat" button instead copies the formatted HTML to clipboard
- User pastes into WeChat editor manually
- WeChat API integration added as Phase 2 enhancement

---

## AI Pipeline Execution Strategy

### Concurrency

- **Research (Step 1)**: 3 topics researched in parallel (web scraping + API calls)
- **AI calls (Steps 2-5)**: Sequential per article to respect API rate limits, but multiple articles can pipeline (article 1 in Step 4 while article 2 in Step 2)
- **Briefs**: All briefs processed in parallel (single API call each, no research needed)

### Progress Reporting

The Web UI shows real-time progress during article generation:

```
✅ Research: xz backdoor event (3/3 sources collected)
✅ GPT Analysis: structured material pack ready
🔄 Qwen Writing: generating Chinese article...
⏳ Review: pending
⏳ Research: Claude 5 release
⏳ Research: React 25
```

### Expected Total Time

| Selection | Time |
|---|---|
| 3 deep dives | ~3 min (sequential pipeline) |
| 5 briefs | ~30s (parallel) |
| Daily digest assembly | ~5s |
| **Total** | **~4 min** |

---

## HN Story Type Handling

| Story Type | Detection | Research Behavior |
|---|---|---|
| **Regular story** | Has `url` field | Scrape URL + HN comments + web search |
| **Ask HN** | Title starts with "Ask HN:" | Use `story_text` as primary source + HN comments (no URL to scrape) |
| **Show HN** | Title starts with "Show HN:" | Scrape project page + HN comments + web search |
| **Job posts** | Type = 'job' | Filter out entirely (not article-worthy) |
