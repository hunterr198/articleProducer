"use client";
import useSWR, { mutate } from "swr";
import { TopicCard } from "@/components/topic-card";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

export default function TopicsPage() {
  const { data, error } = useSWR("/api/topics");
  const router = useRouter();

  async function handleSelect(id: number, status: "selected_deep" | "selected_brief" | "skipped") {
    await fetch(`/api/topics/${id}/select`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    mutate("/api/topics");
  }

  async function handleGenerate() {
    const selected = data?.candidates?.filter(
      (c: any) => c.status === "selected_deep" || c.status === "selected_brief"
    );
    if (!selected?.length) {
      alert("请先选择至少一个话题");
      return;
    }

    const res = await fetch("/api/articles/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        selections: selected.map((s: any) => ({
          dailyScoreId: s.id,
          type: s.status === "selected_deep" ? "deep_dive" : "brief",
        })),
      }),
    });
    const result = await res.json();
    if (result.success) {
      router.push("/articles");
    } else {
      alert(result.message || "生成失败");
    }
  }

  if (!data) return <div className="p-8 text-muted-foreground">Loading...</div>;

  const selectedCount = data.candidates?.filter(
    (c: any) => c.status === "selected_deep" || c.status === "selected_brief"
  ).length ?? 0;

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">今日选题</h1>
          <p className="text-sm text-muted-foreground">{data.date} · {data.candidates?.length ?? 0} 个候选</p>
        </div>
        <Button onClick={handleGenerate} disabled={selectedCount === 0}>
          生成文章 ({selectedCount} 篇已选)
        </Button>
      </div>

      {(!data.candidates || data.candidates.length === 0) ? (
        <div className="text-center py-12 text-muted-foreground">
          <p>暂无候选话题</p>
          <p className="text-sm mt-1">请先运行采样和评分</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {data.candidates.map((topic: any, i: number) => (
            <TopicCard
              key={topic.id}
              topic={topic}
              rank={i + 1}
              onSelect={handleSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}
