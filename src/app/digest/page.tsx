"use client";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { MarkdownPreview } from "@/components/markdown-preview";

export default function DigestPage() {
  const [markdown, setMarkdown] = useState("");
  const [html, setHtml] = useState("");
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [dateStr, setDateStr] = useState("");

  // Try today first, then yesterday
  useEffect(() => {
    async function loadDigest() {
      const today = new Intl.DateTimeFormat("sv-SE", {
        timeZone: "Asia/Shanghai",
      }).format(new Date());

      // Try today
      let res = await fetch(`/api/articles/digest?date=${today}`);
      let data = await res.json();

      if (!data.markdown || data.markdown.length < 200) {
        // Try yesterday
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = new Intl.DateTimeFormat("sv-SE", {
          timeZone: "Asia/Shanghai",
        }).format(yesterday);

        res = await fetch(`/api/articles/digest?date=${yesterdayStr}`);
        data = await res.json();
      }

      setMarkdown(data.markdown ?? "");
      setHtml(data.html ?? "");
      setDateStr(data.date ?? "");
      setLoading(false);
    }
    loadDigest();
  }, []);

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

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-6 text-center text-muted-foreground">
        加载日报中...
      </div>
    );
  }

  if (!markdown || markdown.length < 200) {
    return (
      <div className="max-w-4xl mx-auto p-6 text-center text-muted-foreground">
        <p>暂无日报内容</p>
        <p className="text-sm mt-2">请先运行聚合和文章生成</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">日报预览</h1>
          <p className="text-sm text-muted-foreground">{dateStr}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleCopyMarkdown}>
            {copied ? "已复制" : "复制 Markdown"}
          </Button>
          <Button onClick={handleCopyHTML}>
            {copied ? "已复制" : "复制公众号 HTML"}
          </Button>
        </div>
      </div>

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
    </div>
  );
}
