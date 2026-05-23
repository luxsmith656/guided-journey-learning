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
  dayLabel?: string;
  minutes?: number;
  source?: 'deadline' | 'module' | 'recall' | 'weakness' | 'checkpoint';
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
  assignments?: any[];
  progressByModule?: Record<string, any>;
}): StudyPlanItem[] {
  const now = Date.now();
  const modules = params.modules.map((module) => {
    const progress = params.progressByModule?.[module.id] || {};
    const minutes = getModuleMinutes(module);
    const remainingPercent = Math.max(0, 100 - (module.progress ?? progress.progressPercent ?? 0));
    return {
      ...module,
      progress: module.progress ?? progress.progressPercent ?? 0,
      paceMinutes: Math.max(10, Math.round(minutes * (remainingPercent / 100))),
      dueTime: module.dueAt ? new Date(module.dueAt).getTime() : Number.POSITIVE_INFINITY,
      quizDifficulty: getDifficultyWeight(module),
    };
  }).sort((a, b) => (a.dueTime - b.dueTime) || (b.quizDifficulty - a.quizDifficulty));

  const nextModule = modules.find((module) => module.progress < 100);
  const review = params.recallInsights[0];
  const plan: StudyPlanItem[] = [];
  const urgentAssignment = (params.assignments || [])
    .filter((assignment) => assignment.dueAt)
    .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())[0];

  if (urgentAssignment) {
    const dueTime = new Date(urgentAssignment.dueAt).getTime();
    plan.push({
      title: `Prepare ${urgentAssignment.title}`,
      body: dueTime < now ? 'This is overdue. Submit the required link as soon as possible.' : `Due ${new Date(urgentAssignment.dueAt).toLocaleDateString()}. Reserve time to finish and check link access.`,
      targetLink: '/student/todo',
      priority: dueTime - now < 86_400_000 ? 'high' : 'medium',
      dayLabel: dueTime - now < 86_400_000 ? 'Today' : 'This week',
      minutes: 25,
      source: 'deadline',
    });
  }

  if (nextModule) {
    plan.push({
      title: `Continue ${nextModule.title}`,
      body: nextModule.progress > 0
        ? `Finish the next section today, then take the checkpoint tomorrow. Estimated focus time: ${nextModule.paceMinutes} minutes.`
        : `Start section 1 today, then take the checkpoint tomorrow. Estimated focus time: ${nextModule.paceMinutes} minutes.`,
      targetLink: `/quest?moduleId=${nextModule.id}`,
      priority: 'high',
      dayLabel: 'Today',
      minutes: nextModule.paceMinutes,
      source: 'module',
    });
    plan.push({
      title: `Checkpoint: ${nextModule.title}`,
      body: 'Take the mini quiz after a short break so the score reflects recall, not just reading memory.',
      targetLink: `/quest?moduleId=${nextModule.id}`,
      priority: 'medium',
      dayLabel: 'Tomorrow',
      minutes: 15,
      source: 'checkpoint',
    });
  }

  if (review) {
    plan.push({
      title: `Recall practice: ${review.topicId}`,
      body: `This was last reviewed ${review.daysSinceReview} days ago. Take a two-minute recall challenge before it fades more.`,
      targetLink: '/flashcards',
      priority: 'medium',
      dayLabel: 'Friday',
      minutes: 10,
      source: 'recall',
    });
  }

  plan.push({
    title: `Review ${params.weakTopicLabel}`,
    body: 'Use flashcards and module notes to repair the weakest topic before the next exam.',
    targetLink: '/flashcards',
    priority: 'low',
    dayLabel: 'This week',
    minutes: 20,
    source: 'weakness',
  });

  return plan.slice(0, 5);
}

function getModuleMinutes(module: any) {
  const fromDuration = Number(String(module.duration || '').match(/\d+/)?.[0] || 0);
  if (fromDuration) return fromDuration;
  const fromParts = (module.parts || []).reduce((sum: number, part: any) => sum + Number(part.textbookSection?.estimatedReadMinutes || 8) + 8, 0);
  return fromParts || 35;
}

function getDifficultyWeight(module: any) {
  const mix = module.examBlueprint?.difficultyMix || {};
  return Number(mix.hard || 0) * 2 + Number(mix.medium || 0);
}
