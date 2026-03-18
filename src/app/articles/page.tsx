"use client";
import useSWR from "swr";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState } from "react";

type ArticleStatus =
  | "generating"
  | "draft"
  | "reviewed"
  | "edited"
  | "published"
  | "failed";

interface Article {
  id: number;
  storyId: number | null;
  type: "deep_dive" | "brief";
  title: string | null;
  status: ArticleStatus | null;
  wordCount: number;
  createdAt: string | null;
  storyTitle: string | null;
  storyUrl: string | null;
}

interface ArticlesResponse {
  date: string;
  articles: Article[];
}

const STATUS_TABS = [
  { value: "all", label: "全部" },
  { value: "draft", label: "草稿" },
  { value: "reviewed", label: "已审校" },
  { value: "edited", label: "已编辑" },
  { value: "published", label: "已发布" },
  { value: "failed", label: "失败" },
];

const STATUS_BADGE: Record<
  string,
  { label: string; className: string }
> = {
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

function formatDate(val: string | null): string {
  if (!val) return "-";
  const d = new Date(val);
  return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

export default function ArticlesPage() {
  const [activeTab, setActiveTab] = useState("all");
  const url =
    activeTab === "all" ? "/api/articles" : `/api/articles?status=${activeTab}`;
  const { data, error } = useSWR<ArticlesResponse>(url);

  const articles = data?.articles ?? [];

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">文章管理</h1>
          <p className="text-sm text-muted-foreground">
            {data?.date} · {articles.length} 篇文章
          </p>
        </div>
        <Link href="/topics">
          <Button variant="outline">返回选题</Button>
        </Link>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          {STATUS_TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">文章列表</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {error ? (
            <div className="p-6 text-center text-red-500">加载失败</div>
          ) : !data ? (
            <div className="p-6 text-center text-muted-foreground">加载中...</div>
          ) : articles.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground">暂无文章</div>
          ) : (
            <div className="divide-y">
              {articles.map((article) => {
                const typeBadge = TYPE_BADGE[article.type] ?? {
                  label: article.type,
                  className: "",
                };
                const statusBadge = STATUS_BADGE[article.status ?? ""] ?? {
                  label: article.status ?? "-",
                  className: "",
                };
                return (
                  <div
                    key={article.id}
                    className="flex items-center gap-4 px-6 py-4 hover:bg-muted/30 transition-colors"
                  >
                    {/* Type badge */}
                    <Badge
                      variant="outline"
                      className={`shrink-0 text-xs ${typeBadge.className}`}
                    >
                      {typeBadge.label}
                    </Badge>

                    {/* Title */}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">
                        {article.title ?? "(无标题)"}
                      </p>
                      {article.storyTitle && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {article.storyUrl ? (
                            <a
                              href={article.storyUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="hover:underline"
                            >
                              {article.storyTitle}
                            </a>
                          ) : (
                            article.storyTitle
                          )}
                        </p>
                      )}
                    </div>

                    {/* Word count */}
                    <span className="text-sm text-muted-foreground shrink-0 w-20 text-right">
                      {article.wordCount.toLocaleString()} 字
                    </span>

                    {/* Status badge */}
                    <Badge
                      variant="outline"
                      className={`shrink-0 text-xs ${statusBadge.className}`}
                    >
                      {statusBadge.label}
                    </Badge>

                    {/* Created time */}
                    <span className="text-xs text-muted-foreground shrink-0 w-16 text-right">
                      {formatDate(article.createdAt)}
                    </span>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      <Link href={`/articles/${article.id}`}>
                        <Button size="sm" variant="outline" className="text-xs h-7">
                          预览
                        </Button>
                      </Link>
                      <Link href={`/articles/${article.id}`}>
                        <Button size="sm" variant="default" className="text-xs h-7">
                          编辑
                        </Button>
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
