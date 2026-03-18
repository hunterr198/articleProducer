"use client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface TopicCandidate {
  id: number;
  storyId: number;
  title: string;
  url: string | null;
  storyType: string;
  score: number;
  commentsCount: number;
  appearanceCount: number;
  discussionScore: number | null;
  trendScore: number | null;
  writabilityScore: number | null;
  freshnessScore: number | null;
  finalScore: number | null;
  aiAnalysis: string | null;
  status: string;
}

interface TopicCardProps {
  topic: TopicCandidate;
  rank: number;
  onSelect: (id: number, status: "selected_deep" | "selected_brief" | "skipped") => void;
}

function ScoreBar({ label, value }: { label: string; value: number | null }) {
  const v = value ?? 0;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-16 text-muted-foreground">{label}</span>
      <Progress value={v} className="h-2 flex-1" />
      <span className="w-8 text-right font-mono">{Math.round(v)}</span>
    </div>
  );
}

export function TopicCard({ topic, rank, onSelect }: TopicCardProps) {
  const isSelected = topic.status === "selected_deep" || topic.status === "selected_brief";
  const isSkipped = topic.status === "skipped";

  return (
    <Card className={cn(
      isSelected && "border-green-500 bg-green-50",
      isSkipped && "opacity-50"
    )}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline" className="text-xs">#{rank}</Badge>
              <Badge variant="secondary" className="text-xs">
                {Math.round(topic.finalScore ?? 0)} 分
              </Badge>
              {topic.storyType !== "story" && (
                <Badge variant="outline" className="text-xs">{topic.storyType}</Badge>
              )}
              {isSelected && (
                <Badge className="text-xs bg-green-600">
                  {topic.status === "selected_deep" ? "深度" : "快讯"}
                </Badge>
              )}
            </div>
            <a
              href={topic.url ?? `https://news.ycombinator.com/item?id=${topic.storyId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium hover:underline"
            >
              {topic.title}
            </a>
            <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
              <span>★ {topic.score} pts</span>
              <span>💬 {topic.commentsCount}</span>
              <span>📊 上榜 {topic.appearanceCount} 次</span>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1">
          <ScoreBar label="持续热度" value={(topic.appearanceCount / 8) * 100} />
          <ScoreBar label="讨论深度" value={topic.discussionScore} />
          <ScoreBar label="增长趋势" value={topic.trendScore} />
          <ScoreBar label="可写性" value={topic.writabilityScore} />
          <ScoreBar label="新鲜度" value={topic.freshnessScore} />
        </div>

        <div className="flex gap-2">
          <Button
            size="sm"
            variant={topic.status === "selected_deep" ? "default" : "outline"}
            onClick={() => onSelect(topic.id, "selected_deep")}
          >
            深度分析
          </Button>
          <Button
            size="sm"
            variant={topic.status === "selected_brief" ? "default" : "outline"}
            onClick={() => onSelect(topic.id, "selected_brief")}
          >
            快讯
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onSelect(topic.id, "skipped")}
          >
            跳过
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
