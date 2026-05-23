export interface RecallInsight {
  topicId: string;
  mastery: number;
  decayedMastery: number;
  daysSinceReview: number;
  recallDueAt: string;
}

export interface StudyPlanItem {
  title: string;
  body: string;
  targetLink: string;
  priority: 'high' | 'medium' | 'low';
}

const DECAY_START_DAYS = 14;

function toMillis(value: any) {
  if (!value) return 0;
  if (value.toMillis) return value.toMillis();
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return new Date(value).getTime();
  return 0;
}

export function getRecallInsights(profile: any): RecallInsight[] {
  const masteryByTopic = profile?.masteryByTopic || {};
  const freshness = profile?.masteryFreshnessByTopic || {};
  const now = Date.now();

  return Object.entries(masteryByTopic)
    .map(([topicId, masteryValue]) => {
      const mastery = Number(masteryValue || 0);
      const fresh = freshness[topicId] || {};
      const lastReviewedAt = toMillis(fresh.lastReviewedAt || fresh.lastMasteredAt || profile?.lastUpdatedAt);
      const daysSinceReview = lastReviewedAt ? Math.floor((now - lastReviewedAt) / 86_400_000) : DECAY_START_DAYS + 1;
      const decayDays = Math.max(0, daysSinceReview - DECAY_START_DAYS);
      const decayedMastery = Math.max(0, Math.round(mastery - decayDays * 2));

      return {
        topicId,
        mastery,
        decayedMastery,
        daysSinceReview,
        recallDueAt: new Date((lastReviewedAt || now) + DECAY_START_DAYS * 86_400_000).toISOString(),
      };
    })
    .filter((item) => item.mastery >= 60 && item.daysSinceReview >= DECAY_START_DAYS && item.decayedMastery < item.mastery)
    .sort((a, b) => a.decayedMastery - b.decayedMastery)
    .slice(0, 3);
}

export function buildStudyPlan(params: {
  modules: any[];
  recallInsights: RecallInsight[];
  weakTopicLabel: string;
}): StudyPlanItem[] {
  const nextModule = params.modules.find((module) => module.progress < 100);
  const review = params.recallInsights[0];
  const plan: StudyPlanItem[] = [];

  if (nextModule) {
    plan.push({
      title: `Continue ${nextModule.title}`,
      body: nextModule.progress > 0 ? 'Finish the next section today, then take the checkpoint tomorrow.' : 'Start the first section today and keep the session short.',
      targetLink: `/quest?moduleId=${nextModule.id}`,
      priority: 'high',
    });
  }

  if (review) {
    plan.push({
      title: `Recall practice: ${review.topicId}`,
      body: `This was last reviewed ${review.daysSinceReview} days ago. Take a two-minute recall challenge before it fades more.`,
      targetLink: '/flashcards',
      priority: 'medium',
    });
  }

  plan.push({
    title: `Review ${params.weakTopicLabel}`,
    body: 'Use flashcards and module notes to repair the weakest topic before the next exam.',
    targetLink: '/flashcards',
    priority: 'low',
  });

  return plan.slice(0, 3);
}
