// Adaptive learning helper - non-UI logic that computes per-topic mastery
// from an attempt and asks the AI gateway for recommended next modules.
import { collection, doc, getDoc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { db } from './firebase';

export interface AttemptAnswerRecord {
  questionId: string;
  selectedOptionId: string | null;
  correctOptionId: string;
  isCorrect: boolean;
  categoryId?: string;
  topicId?: string;
  skillIds?: string[];
}

function bumpMastery(prev: number | undefined, isCorrect: boolean): number {
  // Exponential moving average against a 0-1 target
  const base = typeof prev === 'number' ? prev : 0.5;
  const target = isCorrect ? 1 : 0;
  return Math.max(0, Math.min(1, Number((base * 0.7 + target * 0.3).toFixed(3))));
}

export async function updateMasteryAndRecommend(params: {
  userId: string;
  answers: AttemptAnswerRecord[];
  goals?: string;
}) {
  const { userId, answers, goals = '' } = params;
  const profileRef = doc(db, 'learnerProfiles', userId);
  const snap = await getDoc(profileRef);
  const profile = snap.exists() ? snap.data() : {};

  const topicMastery: Record<string, number> = { ...(profile.topicMastery || {}) };
  const skillMastery: Record<string, number> = { ...(profile.skillMastery || {}) };
  const recentAttempts: any[] = [];

  for (const a of answers) {
    if (a.topicId) topicMastery[a.topicId] = bumpMastery(topicMastery[a.topicId], a.isCorrect);
    for (const sid of a.skillIds || []) {
      skillMastery[sid] = bumpMastery(skillMastery[sid], a.isCorrect);
    }
    recentAttempts.push({
      topicId: a.topicId,
      categoryId: a.categoryId,
      isCorrect: a.isCorrect,
    });
  }

  // Ask the AI gateway for a study plan (best-effort; non-fatal)
  let plan: any = null;
  try {
    const res = await fetch('/api/adaptive-recommend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mastery: topicMastery, recentAttempts, goals }),
    });
    const data = await res.json();
    if (data.success) plan = data.plan;
  } catch (e) {
    console.warn('adaptive-recommend failed', e);
  }

  // Map weakest topics → modules (fallback if AI plan is missing)
  let recommendedModuleIds: string[] = [];
  try {
    const weakTopicIds = Object.entries(topicMastery)
      .sort((a, b) => a[1] - b[1])
      .slice(0, 5)
      .map(([tid]) => tid);
    if (weakTopicIds.length) {
      const modSnap = await getDocs(
        query(collection(db, 'modules'), where('topicId', 'in', weakTopicIds.slice(0, 10)))
      );
      recommendedModuleIds = modSnap.docs.map((d) => d.id);
    }
  } catch (e) {
    console.warn('module lookup failed', e);
  }

  await updateDoc(profileRef, {
    topicMastery,
    skillMastery,
    recommendedModuleIds,
    nextRecommendedModuleId: recommendedModuleIds[0] || null,
    adaptivePlan: plan,
    lastAdaptiveUpdateAt: Date.now(),
  });

  return { topicMastery, skillMastery, recommendedModuleIds, plan };
}
