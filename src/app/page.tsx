"use client";
import useSWR from "swr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function Dashboard() {
  const { data } = useSWR("/api/dashboard");

  if (!data) return <div className="p-8 text-muted-foreground">Loading...</div>;

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">今日采样</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{data.samplesCollected}/{data.samplesTotal}</p>
            {data.lastSampleAt && (
              <p className="text-xs text-muted-foreground mt-1">
                上次: {new Date(data.lastSampleAt).toLocaleString("zh-CN")}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">候选话题</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{data.candidatesCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">已生成文章</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{data.articlesCount}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>系统日志</CardTitle>
        </CardHeader>
        <CardContent>
          {data.recentLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无日志</p>
          ) : (
            <div className="space-y-2">
              {data.recentLogs.map((log: any, i: number) => (
                <div key={i} className="flex items-center gap-3 text-sm">
                  <Badge variant={log.level === "error" ? "destructive" : "secondary"}>
                    {log.level}
                  </Badge>
                  <span className="text-muted-foreground whitespace-nowrap">
                    {new Date(log.createdAt).toLocaleString("zh-CN")}
                  </span>
                  <span className="truncate">{log.message}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
