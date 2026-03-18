export interface MaterialPack {
  coreFacts: string;
  keyInsights: string[];
  controversy: string;
  context: string;
  suggestedAngle: string;
  discussionQuestion: string;
}

export interface ArticleOutline {
  title: string;
  hook: string;
  sections: Array<{
    heading?: string;
    keyPoints: string[];
    sourceRefs: string[];
    wordTarget: number;
  }>;
  closingQuestion: string;
}

export interface WritabilityEvaluation {
  topicCategory: string;
  coreNovelty: string;
  devilAdvocateConcerns: string[];
  recommendedAngle: string;
  discussionQuestion: string;
  scores: {
    writability: number;
    audienceFit: number;
    freshness: number;
  };
  verdict: "deep_dive" | "brief" | "skip";
  verdictReason: string;
}
