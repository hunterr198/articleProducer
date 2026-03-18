"use client";
import { use, useCallback, useEffect, useRef, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { MarkdownPreview } from "@/components/markdown-preview";

interface HnComment {
  author: string;
  text: string;
  points?: number;
}

interface WebSearchItem {
  title: string;
  url: string;
  snippet?: string;
}

interface ResearchData {
  originalContent: string | null;
  hnComments: HnComment[];
  webSearch: WebSearchItem[];
  aiSummary: Record<string, unknown>;
}

interface Article {
  id: number;
  type: "deep_dive" | "brief";
  title: string | null;
  status: string | null;
  contentMd: string | null;
  contentReviewed: string | null;
  contentEdited: string | null;
  storyId: number | null;
  createdAt: string | null;
  updatedAt: string | null;
}

interface ArticleDetailResponse {
  article: Article;
  story: { id: number; title: string; url: string | null } | null;
  research: ResearchData | null;
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  generating: { label: "生成中", className: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  draft: { label: "草稿", className: "bg-gray-100 text-gray-700 border-gray-200" },
  reviewed: { label: "已审校", className: "bg-blue-100 text-blue-800 border-blue-200" },
  edited: { label: "已编辑", className: "bg-green-100 text-green-800 border-green-200" },
  published: { label: "已发布", className: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  failed: { label: "失败", className: "bg-red-100 text-red-800 border-red-200" },
};

const TYPE_BADGE: Record<string, { label: string; className: string }> = {
  deep_dive: { label: "深度", className: "bg-purple-100 text-purple-800 border-purple-200" },
  brief: { label: "快讯", className: "bg-sky-100 text-sky-800 border-sky-200" },
};

function mdToHtml(md: string): string {
  // Simple conversion for copy: wrap in a div with markdown
  return md;
}

export default function ArticleEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data, error, mutate } = useSWR<ArticleDetailResponse>(
    `/api/articles/${id}`
  );

  const article = data?.article;
  const research = data?.research;

  const initialContent =
    article?.contentEdited ??
    article?.contentReviewed ??
    article?.contentMd ??
    "";

  const [content, setContent] = useState(initialContent);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [researchOpen, setResearchOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initializedRef = useRef(false);

  // Initialize content once data loads
  useEffect(() => {
    if (article && !initializedRef.current) {
      const init =
        article.contentEdited ??
        article.contentReviewed ??
        article.contentMd ??
        "";
      setContent(init);
      initializedRef.current = true;
    }
  }, [article]);

  const save = useCallback(
    async (text: string) => {
      setSaving(true);
      try {
        await fetch(`/api/articles/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contentEdited: text }),
        });
        setSavedAt(new Date());
        mutate();
      } finally {
        setSaving(false);
      }
    },
    [id, mutate]
  );

  const handleContentChange = (val: string) => {
    setContent(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      save(val);
    }, 1000);
  };

  const handleManualSave = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    save(content);
  };

  const handleCopyHtml = () => {
    // Copy content as-is (markdown); could convert to HTML
    navigator.clipboard.writeText(mdToHtml(content));
  };

  if (error) {
    return (
      <div className="p-8 text-center text-red-500">
        加载失败 —{" "}
        <Link href="/articles" className="underline">
          返回列表
        </Link>
      </div>
    );
  }

  if (!data || !article) {
    return (
      <div className="p-8 text-center text-muted-foreground">加载中...</div>
    );
  }

  const typeBadge = TYPE_BADGE[article.type] ?? { label: article.type, className: "" };
  const statusBadge = STATUS_BADGE[article.status ?? ""] ?? {
    label: article.status ?? "-",
    className: "",
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Header */}
      <header className="border-b px-6 py-3 flex items-center gap-3 bg-background shrink-0">
        <Link href="/articles">
          <Button variant="ghost" size="sm" className="text-xs">
            ← 返回列表
          </Button>
        </Link>
        <Separator orientation="vertical" className="h-5" />
        <Badge
          variant="outline"
          className={`text-xs ${typeBadge.className}`}
        >
          {typeBadge.label}
        </Badge>
        <h1 className="font-semibold text-sm flex-1 truncate">
          {article.title ?? "(无标题)"}
        </h1>
        <Badge
          variant="outline"
          className={`text-xs shrink-0 ${statusBadge.className}`}
        >
          {statusBadge.label}
        </Badge>
        {savedAt && !saving && (
          <span className="text-xs text-muted-foreground shrink-0">
            已保存 {savedAt.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </span>
        )}
        {saving && (
          <span className="text-xs text-muted-foreground shrink-0">保存中...</span>
        )}
        <Button
          size="sm"
          variant="outline"
          onClick={handleCopyHtml}
          className="text-xs shrink-0"
        >
          复制 HTML
        </Button>
        <Button
          size="sm"
          onClick={handleManualSave}
          disabled={saving}
          className="text-xs shrink-0"
        >
          保存
        </Button>
      </header>

      {/* Editor area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: textarea */}
        <div className="w-1/2 flex flex-col border-r overflow-hidden">
          <div className="px-4 py-2 text-xs text-muted-foreground border-b bg-muted/30 shrink-0">
            Markdown 编辑
          </div>
          <Textarea
            value={content}
            onChange={(e) => handleContentChange(e.target.value)}
            className="flex-1 resize-none rounded-none border-0 font-mono text-sm min-h-[600px] focus-visible:ring-0 focus-visible:ring-offset-0"
            placeholder="文章内容 (Markdown)..."
            spellCheck={false}
          />
        </div>

        {/* Right: preview */}
        <div className="w-1/2 flex flex-col overflow-hidden">
          <div className="px-4 py-2 text-xs text-muted-foreground border-b bg-muted/30 shrink-0">
            预览
          </div>
          <div className="flex-1 overflow-y-auto p-6">
            {content ? (
              <MarkdownPreview content={content} />
            ) : (
              <p className="text-muted-foreground text-sm">开始编辑以预览...</p>
            )}
          </div>
        </div>
      </div>

      {/* Research panel */}
      <div className="border-t bg-background shrink-0">
        <button
          className="w-full flex items-center justify-between px-6 py-3 text-sm font-medium hover:bg-muted/30 transition-colors"
          onClick={() => setResearchOpen((v) => !v)}
        >
          <span>参考资料</span>
          <span className="text-muted-foreground text-xs">
            {researchOpen ? "▲ 收起" : "▼ 展开"}
          </span>
        </button>

        {researchOpen && research && (
          <div className="px-6 pb-6 max-h-80 overflow-y-auto">
            <Tabs defaultValue="original">
              <TabsList className="mb-4">
                <TabsTrigger value="original">原文内容</TabsTrigger>
                <TabsTrigger value="hn">HN 精选评论</TabsTrigger>
                <TabsTrigger value="web">补充搜索</TabsTrigger>
              </TabsList>

              <TabsContent value="original">
                <Card>
                  <CardContent className="p-4">
                    {research.originalContent ? (
                      <pre className="text-xs whitespace-pre-wrap font-mono text-muted-foreground">
                        {research.originalContent}
                      </pre>
                    ) : (
                      <p className="text-sm text-muted-foreground">暂无原文内容</p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="hn">
                <div className="space-y-3">
                  {research.hnComments.length === 0 ? (
                    <p className="text-sm text-muted-foreground">暂无评论</p>
                  ) : (
                    research.hnComments.map((comment, i) => (
                      <Card key={i}>
                        <CardContent className="p-3">
                          <p className="text-xs font-medium text-muted-foreground mb-1">
                            @{comment.author}
                            {comment.points !== undefined &&
                              ` · ${comment.points} 点`}
                          </p>
                          <p className="text-sm">{comment.text}</p>
                        </CardContent>
                      </Card>
                    ))
                  )}
                </div>
              </TabsContent>

              <TabsContent value="web">
                <div className="space-y-3">
                  {research.webSearch.length === 0 ? (
                    <p className="text-sm text-muted-foreground">暂无搜索结果</p>
                  ) : (
                    research.webSearch.map((item, i) => (
                      <Card key={i}>
                        <CardContent className="p-3">
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-medium text-blue-600 hover:underline"
                          >
                            {item.title}
                          </a>
                          {item.snippet && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {item.snippet}
                            </p>
                          )}
                        </CardContent>
                      </Card>
                    ))
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </div>
        )}

        {researchOpen && !research && (
          <div className="px-6 pb-6">
            <p className="text-sm text-muted-foreground">暂无参考资料</p>
          </div>
        )}
      </div>
    </div>
  );
}
