export interface HNStory {
  id: number;
  title: string;
  url?: string;
  author: string;
  score: number;
  commentsCount: number;
  storyText?: string;
  storyType: "story" | "ask_hn" | "show_hn" | "poll";
  createdAt: Date;
}

export interface HNComment {
  id: number;
  author: string;
  text: string;
  points: number | null;
  createdAt: Date;
  children: HNComment[];
}

export interface SampleResult {
  stories: HNStory[];
  rankings: Map<number, number>; // storyId -> rank
  sampledAt: Date;
}
