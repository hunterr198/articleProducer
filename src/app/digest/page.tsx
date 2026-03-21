"use client";
import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { MarkdownPreview } from "@/components/markdown-preview";

function todayBeijing() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai" }).format(new Date());
}

export default function DigestPage() {
  const [markdown, setMarkdown] = useState("");
  const [html, setHtml] = useState("");
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [dateStr, setDateStr] = useState("");
  const [selectedDate, setSelectedDate] = useState(todayBeijing());
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  const loadDigest = useCallback(async (date: string, fallbackToYesterday: boolean) => {
    setLoading(true);
    let res = await fetch(`/api/articles/digest?date=${date}`);
    let data = await res.json();

    // Only fall back to yesterday on initial page load, not on manual date selection
    if (fallbackToYesterday && (!data.markdown || data.markdown.length < 200)) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai" }).format(yesterday);
      res = await fetch(`/api/articles/digest?date=${yesterdayStr}`);
      data = await res.json();
      setSelectedDate(yesterdayStr);
    }

    setMarkdown(data.markdown ?? "");
    setHtml(data.html ?? "");
    setDateStr(data.date ?? "");
    setLoading(false);
  }, []);

  useEffect(() => {
    loadDigest(selectedDate, isInitialLoad);
    if (isInitialLoad) setIsInitialLoad(false);
  }, [selectedDate, loadDigest, isInitialLoad]);

  function changeDate(offset: number) {
    const d = new Date(selectedDate + "T12:00:00");
    d.setDate(d.getDate() + offset);
    setSelectedDate(d.toISOString().slice(0, 10));
  }

  async function handleCopyHTML() {
    try {
      await navigator.clipboard.writeText(html);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select and copy
      const textarea = document.createElement("textarea");
      textarea.value = html;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  async function handleCopyMarkdown() {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  const datePicker = (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={() => changeDate(-1)}>
        &larr; 前一天
      </Button>
      <input
        type="date"
        value={selectedDate}
        max={todayBeijing()}
        onChange={(e) => setSelectedDate(e.target.value)}
        className="border rounded px-2 py-1 text-sm"
      />
      <Button
        variant="outline"
        size="sm"
        onClick={() => changeDate(1)}
        disabled={selectedDate >= todayBeijing()}
      >
        后一天 &rarr;
      </Button>
    </div>
  );

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-6 space-y-4">
        <h1 className="text-2xl font-bold">日报预览</h1>
        {datePicker}
        <p className="text-center text-muted-foreground mt-8">加载日报中...</p>
      </div>
    );
  }

  const hasContent = markdown && markdown.length >= 200;

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">日报预览</h1>
          <div className="mt-1">{datePicker}</div>
        </div>
        {hasContent && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleCopyMarkdown}>
              {copied ? "已复制" : "复制 Markdown"}
            </Button>
            <Button onClick={handleCopyHTML}>
              {copied ? "已复制" : "复制公众号 HTML"}
            </Button>
          </div>
        )}
      </div>

      {!hasContent ? (
        <div className="text-center text-muted-foreground py-16">
          <p>{selectedDate} 暂无日报内容</p>
        </div>
      ) : (
        <>
          {/* Rendered Preview */}
          <div className="border rounded-lg p-8 bg-white shadow-sm">
            <MarkdownPreview content={markdown} />
          </div>

          {/* HTML Preview (collapsible) */}
          <details className="border rounded-lg p-4">
            <summary className="cursor-pointer text-sm text-muted-foreground font-medium">
              查看原始 HTML（用于粘贴到公众号编辑器）
            </summary>
            <pre className="mt-4 p-4 bg-gray-50 rounded text-xs overflow-auto max-h-96">
              {html}
            </pre>
          </details>
        </>
      )}
    </div>
  );
}
