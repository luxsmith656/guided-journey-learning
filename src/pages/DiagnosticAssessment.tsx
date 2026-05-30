import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  collection,
  doc,
  getDocs,
  increment,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { motion } from 'motion/react';

interface QuestionOption {
  id: string;
  text: string;
}

interface Question {
  id: string;
  stem: string;
  options: QuestionOption[];
  correctOptionId: string;
  categoryId: string;
  categoryName: string;
  topicId: string;
  skillIds: string[];
  difficulty: string;
  explanation?: string;
  rationalization?: string;
  competencyId?: string;
  wrongChoiceExplanations?: Record<string, string>;
  misconceptionTags?: string[];
  relatedModuleId?: string;
  moduleId?: string;
  type?: string;
  examType?: string;
  specialization?: string;
  familyId?: string;
}

interface ExamBlueprint {
  id?: string;
  title?: string;
  type?: string;
  examMode?: string;
  questionCount?: number;
  timeLimitMinutes?: number;
  passingScore?: number;
  categoryDistribution?: Record<string, number>;
  sectionDistribution?: Record<string, number>;
  difficultyMix?: Record<string, number>;
  integrityLevel?: string;
  status?: string;
  isPublished?: boolean;
  isActive?: boolean;
}

interface AnswerRecord {
  questionId: string;
  questionNumber: number;
  selectedOptionId: string;
  correctOptionId: string;
  isCorrect: boolean;
  isUnanswered: boolean;
  categoryId: string;
  topicId: string;
  skillIds: string[];
  competencyId: string;
  difficulty: string;
  stem: string;
  options: QuestionOption[];
  explanation: string;
  rationalization: string;
  wrongChoiceExplanations: Record<string, string>;
  misconceptionTags?: string[];
  relatedModuleId: string;
}

interface DiagnosticResult {
  attemptId: string;
  status: string;
  scorePercent: number;
  totalQuestions: number;
  correctCount: number;
  wrongCount: number;
  unansweredCount: number;
  answeredCount: number;
  timeUsedSeconds: number;
  categoryBreakdown: Record<string, { total: number; correct: number; scorePercent: number }>;
  answers: AnswerRecord[];
  warningLogs: any[];
  endedReason?: string;
}

const DEFAULT_DIAGNOSTIC_BLUEPRINT: ExamBlueprint = {
  id: 'default-let-diagnostic',
  title: 'LET Baseline Diagnostic',
  examMode: 'diagnostic',
  questionCount: 8,
  timeLimitMinutes: 25,
  passingScore: 0,
  categoryDistribution: { gened: 50, profed: 50 },
  difficultyMix: { easy: 60, medium: 40 },
  integrityLevel: 'light_protection',
};

const formatTime = (seconds: number) => {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const secs = safeSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

const normalizeQuestion = (id: string, data: any): Question => ({
  id,
  stem: data.stem || data.question || '',
  options: (data.options || []).map((option: any, index: number) => ({
    id: option.id || String.fromCharCode(65 + index),
    text: option.text || option.value || '',
  })),
  correctOptionId: data.correctOptionId || data.correctOption || data.answer || '',
  categoryId: data.categoryId || '',
  categoryName: data.categoryName || data.categoryId || 'Unknown',
  topicId: data.topicId || '',
  skillIds: data.skillIds || [],
  difficulty: data.difficulty || 'medium',
  explanation: data.explanation || data.rationalization || '',
  rationalization: data.rationalization || data.explanation || '',
  competencyId: data.competencyId || data.competency || '',
  wrongChoiceExplanations: data.wrongChoiceExplanations || {},
  misconceptionTags: data.misconceptionTags || [],
  relatedModuleId: data.relatedModuleId || data.moduleId || '',
  moduleId: data.moduleId || '',
  type: data.type || '',
  examType: data.examType || '',
  specialization: data.specialization || '',
  familyId: data.familyId || data.questionFamilyId || '',
});

const getBlueprintMode = (blueprint: ExamBlueprint) => String(blueprint.examMode || blueprint.type || '').toLowerCase();

function compileLocalResult(
  attemptId: string,
  questions: Question[],
  answers: Record<string, string>,
  startedAtMillis: number,
  reason: 'submitted' | 'time_expired' = 'submitted',
): DiagnosticResult {
  const answerRecords = questions.map((question, index) => {
    const selectedOptionId = answers[question.id] || '';
    const isUnanswered = !selectedOptionId;
    const isCorrect = Boolean(selectedOptionId) && selectedOptionId === question.correctOptionId;
    return {
      questionId: question.id,
      questionNumber: index + 1,
      selectedOptionId,
      correctOptionId: question.correctOptionId,
      isCorrect,
      isUnanswered,
      categoryId: question.categoryId || '',
      topicId: question.topicId || '',
      skillIds: question.skillIds || [],
      competencyId: question.competencyId || '',
      difficulty: question.difficulty || 'medium',
      stem: question.stem,
      options: question.options,
      explanation: question.explanation || '',
      rationalization: question.rationalization || question.explanation || '',
      wrongChoiceExplanations: question.wrongChoiceExplanations || {},
      misconceptionTags: question.misconceptionTags || [],
      relatedModuleId: question.relatedModuleId || question.moduleId || '',
    };
  });

  const correctCount = answerRecords.filter((answer) => answer.isCorrect).length;
  const unansweredCount = answerRecords.filter((answer) => answer.isUnanswered).length;
  const categoryBreakdown = answerRecords.reduce<Record<string, { total: number; correct: number; scorePercent: number }>>((acc, answer) => {
    const key = answer.categoryId || 'uncategorized';
    acc[key] = acc[key] || { total: 0, correct: 0, scorePercent: 0 };
    acc[key].total += 1;
    if (answer.isCorrect) acc[key].correct += 1;
    acc[key].scorePercent = Math.round((acc[key].correct / acc[key].total) * 100);
    return acc;
  }, {});

  return {
    attemptId,
    status: reason === 'time_expired' ? 'auto_submitted_time_expired' : 'submitted',
    scorePercent: answerRecords.length ? Math.round((correctCount / answerRecords.length) * 100) : 0,
    totalQuestions: answerRecords.length,
    correctCount,
    wrongCount: answerRecords.length - correctCount,
    unansweredCount,
    answeredCount: answerRecords.length - unansweredCount,
    timeUsedSeconds: startedAtMillis ? Math.max(0, Math.round((Date.now() - startedAtMillis) / 1000)) : 0,
    categoryBreakdown,
    answers: answerRecords,
    warningLogs: [],
    endedReason: reason,
  };
}

function analyzeDiagnostic(answerRecords: AnswerRecord[]) {
  const categoryStats: Record<string, { correct: number; total: number }> = {};
  const topicStats: Record<string, { correct: number; total: number }> = {};
  const skillStats: Record<string, { correct: number; total: number }> = {};

  answerRecords.forEach((answer) => {
    const categoryKey = answer.categoryId || 'uncategorized';
    const topicKey = answer.topicId || categoryKey;
    categoryStats[categoryKey] = categoryStats[categoryKey] || { correct: 0, total: 0 };
    topicStats[topicKey] = topicStats[topicKey] || { correct: 0, total: 0 };
    categoryStats[categoryKey].total += 1;
    topicStats[topicKey].total += 1;
    if (answer.isCorrect) {
      categoryStats[categoryKey].correct += 1;
      topicStats[topicKey].correct += 1;
    }
    answer.skillIds.forEach((skillId) => {
      skillStats[skillId] = skillStats[skillId] || { correct: 0, total: 0 };
      skillStats[skillId].total += 1;
      if (answer.isCorrect) skillStats[skillId].correct += 1;
    });
  });

  const toPercent = (rows: Record<string, { correct: number; total: number }>) => Object.fromEntries(
    Object.entries(rows).map(([id, stat]) => [id, stat.total ? Math.round((stat.correct / stat.total) * 100) : 0]),
  );
  const toDecimal = (rows: Record<string, number>) => Object.fromEntries(
    Object.entries(rows).map(([id, value]) => [id, Number((value / 100).toFixed(3))]),
  );

  const masteryByCategory = toPercent(categoryStats);
  const masteryByTopic = toPercent(topicStats);
  const masteryBySkill = toPercent(skillStats);
  const weakCategories = Object.entries(masteryByCategory).filter(([, score]) => score < 70).map(([id]) => id);
  const strongCategories = Object.entries(masteryByCategory).filter(([, score]) => score >= 70).map(([id]) => id);
  const weakTopics = Object.entries(masteryByTopic).filter(([, score]) => score < 70).map(([id]) => id);
  const strongTopics = Object.entries(masteryByTopic).filter(([, score]) => score >= 70).map(([id]) => id);
  const weakSkills = Object.entries(masteryBySkill).filter(([, score]) => score < 70).map(([id]) => id);
  const strongSkills = Object.entries(masteryBySkill).filter(([, score]) => score >= 70).map(([id]) => id);

  return {
    masteryByCategory,
    masteryByTopic,
    masteryBySkill,
    topicMastery: toDecimal(masteryByTopic),
    skillMastery: toDecimal(masteryBySkill),
    weakCategories,
    strongCategories,
    weakTopics,
    strongTopics,
    weakSkills,
    strongSkills,
  };
}

function buildDiagnosticPlan(result: DiagnosticResult, recommendedModuleIds: string[]) {
  const missedAnswers = result.answers.filter((answer) => !answer.isCorrect);
  const weakCategories = Object.entries(result.categoryBreakdown)
    .map(([id, row]) => ({ id, ...row }))
    .filter((row) => row.scorePercent < 70)
    .sort((a, b) => a.scorePercent - b.scorePercent);
  const weakTopicCounts = missedAnswers.reduce<Record<string, number>>((acc, answer) => {
    const key = answer.topicId || answer.categoryId || 'uncategorized';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const weakTopics = Object.entries(weakTopicCounts)
    .map(([id, missed]) => ({ id, missed }))
    .sort((a, b) => b.missed - a.missed);

  const tasks = missedAnswers.length === 0
    ? [{
      title: 'Keep the baseline fresh',
      body: 'No weak diagnostic items were recorded. Continue with public reviewers or a category drill.',
      targetLink: '/student/courses',
      priority: 'low',
    }]
    : [
      {
        title: 'Review diagnostic mistakes',
        body: `${missedAnswers.length} missed or blank item${missedAnswers.length === 1 ? '' : 's'} were saved to your mistake bank.`,
        targetLink: '/mistake-bank',
        priority: 'high',
      },
      {
        title: weakTopics[0]?.id ? `Start a reviewer for ${weakTopics[0].id}` : 'Start a weak-area reviewer',
        body: 'Use the related module before taking another diagnostic or mock exam.',
        targetLink: recommendedModuleIds[0] ? `/quest?moduleId=${recommendedModuleIds[0]}` : '/student/courses',
        priority: 'high',
      },
    ];

  return { weakCategories, weakTopics, recommendedModuleIds, tasks };
}

export default function DiagnosticAssessment() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();

  const [hasStarted, setHasStarted] = useState(false);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [questionPool, setQuestionPool] = useState<Question[]>([]);
  const [blueprint, setBlueprint] = useState<ExamBlueprint>(DEFAULT_DIAGNOSTIC_BLUEPRINT);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [attemptId, setAttemptId] = useState('');
  const [startedAtMillis, setStartedAtMillis] = useState(0);
  const [expiresAtMillis, setExpiresAtMillis] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(DEFAULT_DIAGNOSTIC_BLUEPRINT.timeLimitMinutes! * 60);
  const [isLoading, setIsLoading] = useState(true);
  const [isStarting, setIsStarting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [lastAttemptAt, setLastAttemptAt] = useState<Date | null>(null);
  const [attemptCount, setAttemptCount] = useState(0);

  const answersRef = useRef(answers);
  const questionsRef = useRef(questions);
  const attemptIdRef = useRef(attemptId);
  const startedAtRef = useRef(startedAtMillis);
  const expiresAtRef = useRef(expiresAtMillis);
  const submittingRef = useRef(false);

  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  useEffect(() => {
    questionsRef.current = questions;
  }, [questions]);

  useEffect(() => {
    attemptIdRef.current = attemptId;
  }, [attemptId]);

  useEffect(() => {
    startedAtRef.current = startedAtMillis;
  }, [startedAtMillis]);

  useEffect(() => {
    expiresAtRef.current = expiresAtMillis;
  }, [expiresAtMillis]);

  useEffect(() => {
    const loadDiagnosticPool = async () => {
      try {
        if (user) {
          const attemptsSnap = await getDocs(query(collection(db, 'diagnosticAttempts'), where('userId', '==', user.uid)));
          const attempts = attemptsSnap.docs.map((attemptDoc) => attemptDoc.data());
          setAttemptCount(attempts.length);
          const latest = attempts
            .map((attempt: any) => attempt.completedAt?.toDate?.() || attempt.submittedAt?.toDate?.() || (attempt.completedAt ? new Date(attempt.completedAt) : null))
            .filter(Boolean)
            .sort((a: Date, b: Date) => b.getTime() - a.getTime())[0];
          if (latest) setLastAttemptAt(latest);
        }

        const blueprintSnap = await getDocs(query(collection(db, 'examBlueprints'), where('isPublished', '==', true))).catch(() => null);
        const diagnosticBlueprint = blueprintSnap?.docs
          .map((blueprintDoc) => ({ id: blueprintDoc.id, ...blueprintDoc.data() } as ExamBlueprint))
          .find((item) => {
            const mode = getBlueprintMode(item);
            return item.status !== 'archived' &&
              item.isActive !== false &&
              ['diagnostic', 'diagnostic_exam', 'baseline_diagnostic'].includes(mode);
          });
        setBlueprint(diagnosticBlueprint || DEFAULT_DIAGNOSTIC_BLUEPRINT);

        const qSnap = await getDocs(query(
          collection(db, 'questions'),
          where('isPublished', '==', true),
          where('approved', '==', true),
        ));
        const focus = user?.specialization || user?.reviewTrack || user?.selectedFocus || '';
        const approvedDiagnostics = qSnap.docs
          .map((snap) => normalizeQuestion(snap.id, snap.data()))
          .filter((question) => ['diagnostic', 'diagnostic_exam', 'baseline_diagnostic'].includes(String(question.type || question.examType || '').toLowerCase()))
          .filter((question) => {
            if (!focus) return true;
            return !question.specialization || question.specialization === focus || ['gened', 'profed'].includes(question.categoryId);
          })
          .filter((question) => question.stem && question.options.length >= 2 && question.correctOptionId);
        setQuestionPool(approvedDiagnostics);
      } catch (error) {
        console.error('Failed to load diagnostic questions', error);
        setLoadError('Unable to prepare the diagnostic question bank.');
      } finally {
        setIsLoading(false);
      }
    };
    void loadDiagnosticPool();
  }, [user]);

  const findRecommendedModules = useCallback(async (answerRecords: AnswerRecord[]) => {
    const directIds = Array.from(new Set(answerRecords
      .filter((answer) => !answer.isCorrect)
      .map((answer) => answer.relatedModuleId)
      .filter(Boolean)));
    const weakTopicIds = Array.from(new Set(answerRecords
      .filter((answer) => !answer.isCorrect)
      .map((answer) => answer.topicId)
      .filter(Boolean)));
    const moduleIds = new Set<string>(directIds);

    if (weakTopicIds.length) {
      try {
        const moduleSnap = await getDocs(query(collection(db, 'modules'), where('topicId', 'in', weakTopicIds.slice(0, 10))));
        moduleSnap.docs.forEach((moduleDoc) => {
          const data = moduleDoc.data();
          if (data.isPublished === true && (data.publishScope === 'public' || data.visibility === 'public')) {
            moduleIds.add(moduleDoc.id);
          }
        });
      } catch (error) {
        console.warn('diagnostic module recommendation lookup failed', error);
      }
    }

    return Array.from(moduleIds).slice(0, 5);
  }, []);

  const submitDiagnostic = useCallback(async (
    finalAnswers: Record<string, string>,
    reason: 'submitted' | 'time_expired' = 'submitted',
  ) => {
    if (!user || submittingRef.current || questionsRef.current.length === 0) return;
    submittingRef.current = true;
    setIsSubmitting(true);

    const finalAttemptId = attemptIdRef.current || doc(collection(db, 'diagnosticAttempts')).id;
    if (!attemptIdRef.current) {
      setAttemptId(finalAttemptId);
      attemptIdRef.current = finalAttemptId;
    }

    let finalResult = compileLocalResult(finalAttemptId, questionsRef.current, finalAnswers, startedAtRef.current, reason);

    try {
      const response = await fetch('/api/exam/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attemptId: finalAttemptId,
          startedAtMillis: startedAtRef.current,
          expiresAtMillis: expiresAtRef.current,
          answers: finalAnswers,
          questions: questionsRef.current,
          warningLogs: [],
          reason,
        }),
      });
      const data = await response.json();
      if (response.ok && data.success && data.result) {
        finalResult = { ...data.result, attemptId: finalAttemptId };
      }
    } catch (error) {
      console.warn('diagnostic server finalization unavailable; using local result', error);
    }

    const analysis = analyzeDiagnostic(finalResult.answers);
    const recommendedModuleIds = await findRecommendedModules(finalResult.answers);
    const diagnosticPlan = buildDiagnosticPlan(finalResult, recommendedModuleIds);

    try {
      const attemptRef = doc(db, 'diagnosticAttempts', finalAttemptId);
      await setDoc(attemptRef, {
        id: finalAttemptId,
        userId: user.uid,
        type: 'diagnostic',
        mode: user.learningMode || 'self_review',
        status: finalResult.status,
        state: finalResult.status,
        blueprintId: blueprint.id || '',
        blueprintTitle: blueprint.title || 'LET Baseline Diagnostic',
        blueprintSnapshot: {
          id: blueprint.id || '',
          title: blueprint.title || '',
          questionCount: questionsRef.current.length,
          timeLimitMinutes: blueprint.timeLimitMinutes || DEFAULT_DIAGNOSTIC_BLUEPRINT.timeLimitMinutes,
          passingScore: blueprint.passingScore ?? 0,
          categoryDistribution: blueprint.categoryDistribution || blueprint.sectionDistribution || {},
          difficultyMix: blueprint.difficultyMix || {},
        },
        generatedQuestionIds: questionsRef.current.map((question) => question.id),
        generatedQuestions: questionsRef.current.map((question, index) => ({
          questionId: question.id,
          questionNumber: index + 1,
          stem: question.stem,
          options: question.options,
          categoryId: question.categoryId || '',
          topicId: question.topicId || '',
          competencyId: question.competencyId || '',
          difficulty: question.difficulty || 'medium',
        })),
        answers: finalResult.answers,
        scorePercent: finalResult.scorePercent,
        totalQuestions: finalResult.totalQuestions,
        answeredCount: finalResult.answeredCount,
        unansweredCount: finalResult.unansweredCount,
        correctCount: finalResult.correctCount,
        wrongCount: finalResult.wrongCount,
        timeUsedSeconds: finalResult.timeUsedSeconds,
        categoryBreakdown: finalResult.categoryBreakdown,
        weakCategories: analysis.weakCategories,
        strongCategories: analysis.strongCategories,
        weakTopics: analysis.weakTopics,
        strongTopics: analysis.strongTopics,
        recommendedModuleIds,
        diagnosticPlan,
        startedAtMillis: startedAtRef.current,
        expiresAtMillis: expiresAtRef.current,
        submittedAt: serverTimestamp(),
        completedAt: serverTimestamp(),
        endedReason: finalResult.endedReason || reason,
        attemptNumber: attemptCount + 1,
        updatedAt: serverTimestamp(),
      }, { merge: true });

      const mistakeWrites = finalResult.answers
        .filter((answer) => !answer.isCorrect)
        .map((answer) => setDoc(doc(db, 'mistakeBank', `${user.uid}_${answer.questionId}`), {
          userId: user.uid,
          questionId: answer.questionId,
          stem: answer.stem,
          options: answer.options,
          explanation: answer.explanation,
          rationalization: answer.rationalization || answer.explanation,
          wrongChoiceExplanations: answer.wrongChoiceExplanations,
          misconceptionTags: answer.misconceptionTags || [],
          selectedOptionId: answer.selectedOptionId,
          correctOptionId: answer.correctOptionId,
          categoryId: answer.categoryId,
          topicId: answer.topicId,
          competencyId: answer.competencyId,
          difficulty: answer.difficulty,
          skillIds: answer.skillIds,
          relatedModuleId: answer.relatedModuleId,
          examType: 'diagnostic',
          sourceAttemptId: finalAttemptId,
          isUnanswered: answer.isUnanswered,
          timesMissed: increment(1),
          firstMissedAt: serverTimestamp(),
          lastMissedAt: serverTimestamp(),
        }, { merge: true }));
      await Promise.all(mistakeWrites);

      await setDoc(doc(db, 'learnerProfiles', user.uid), {
        userId: user.uid,
        learningMode: user.learningMode || 'self_review',
        activeClassId: user.activeClassId || null,
        selectedFocus: user.selectedFocus || null,
        reviewTrack: user.reviewTrack || null,
        specialization: user.specialization || '',
        currentLevel: finalResult.scorePercent >= 75 ? 3 : finalResult.scorePercent >= 50 ? 2 : 1,
        overallScore: finalResult.scorePercent,
        masteryBySkill: analysis.masteryBySkill,
        masteryByTopic: analysis.masteryByTopic,
        masteryByCategory: analysis.masteryByCategory,
        topicMastery: analysis.topicMastery,
        skillMastery: analysis.skillMastery,
        weakSkills: analysis.weakSkills,
        strongSkills: analysis.strongSkills,
        weakTopics: analysis.weakTopics,
        strongTopics: analysis.strongTopics,
        weakCategories: analysis.weakCategories,
        strongCategories: analysis.strongCategories,
        recommendedModuleIds,
        nextRecommendedModuleId: recommendedModuleIds[0] || null,
        diagnosticAttemptId: finalAttemptId,
        diagnosticAttemptCount: attemptCount + 1,
        diagnosticBaseline: {
          attemptId: finalAttemptId,
          scorePercent: finalResult.scorePercent,
          totalQuestions: finalResult.totalQuestions,
          categoryBreakdown: finalResult.categoryBreakdown,
          weakTopics: analysis.weakTopics,
          weakCategories: analysis.weakCategories,
          completedAtMillis: Date.now(),
        },
        diagnosticPlan,
        badges: user.earnedBadges || [],
        lastUpdatedAt: serverTimestamp(),
      }, { merge: true });

      await setDoc(doc(db, 'users', user.uid), {
        diagnosticCompleted: true,
        diagnosticSkipped: false,
        updatedAt: serverTimestamp(),
        onboardingStep: 3,
      }, { merge: true });

      await refreshUser();
      navigate('/student/dashboard');
    } catch (err) {
      console.error('Failed to save diagnostic profile', err);
      navigate('/student/dashboard');
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  }, [attemptCount, blueprint, findRecommendedModules, navigate, refreshUser, user]);

  useEffect(() => {
    if (!hasStarted || isSubmitting || !expiresAtMillis) return;
    const timer = window.setInterval(() => {
      const remaining = Math.ceil((expiresAtRef.current - Date.now()) / 1000);
      setTimeRemaining(Math.max(0, remaining));
      if (remaining <= 0) {
        window.clearInterval(timer);
        void submitDiagnostic(answersRef.current, 'time_expired');
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [expiresAtMillis, hasStarted, isSubmitting, submitDiagnostic]);

  const skipAssessment = async () => {
    if (user) {
      await setDoc(doc(db, 'users', user.uid), {
        diagnosticCompleted: false,
        diagnosticSkipped: true,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      await refreshUser();
    }
    navigate('/student/dashboard');
  };

  const startAssessment = async () => {
    if (!user || questionPool.length === 0 || isStarting || isCooldownActive) return;
    setIsStarting(true);
    setLoadError('');

    try {
      const response = await fetch('/api/exam/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          blueprint,
          questionPool,
          categoryId: null,
          isFullMock: false,
          requireFullCount: true,
          assessmentMode: 'diagnostic',
          userTrack: user.specialization || user.reviewTrack || user.selectedFocus || '',
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Unable to start the diagnostic right now.');
      }

      const selectedQuestions = (data.questions || []) as Question[];
      if (selectedQuestions.length === 0) {
        throw new Error('The diagnostic blueprint did not return any approved questions.');
      }

      const nextAttemptId = data.attemptId || doc(collection(db, 'diagnosticAttempts')).id;
      const now = Number(data.startedAtMillis || Date.now());
      const expiresAt = Number(data.expiresAtMillis || (now + (blueprint.timeLimitMinutes || 25) * 60 * 1000));

      setQuestions(selectedQuestions);
      setAttemptId(nextAttemptId);
      setStartedAtMillis(now);
      setExpiresAtMillis(expiresAt);
      setTimeRemaining(Math.max(0, Math.ceil((expiresAt - now) / 1000)));
      setAnswers({});
      setCurrentIndex(0);

      await setDoc(doc(db, 'diagnosticAttempts', nextAttemptId), {
        id: nextAttemptId,
        userId: user.uid,
        type: 'diagnostic',
        mode: user.learningMode || 'self_review',
        status: 'in_progress',
        state: 'in_progress',
        blueprintId: blueprint.id || '',
        blueprintTitle: blueprint.title || 'LET Baseline Diagnostic',
        blueprintSnapshot: data.blueprintSnapshot || null,
        generatedQuestionIds: selectedQuestions.map((question) => question.id),
        generatedQuestions: selectedQuestions.map((question, index) => ({
          questionId: question.id,
          questionNumber: index + 1,
          stem: question.stem,
          options: question.options,
          categoryId: question.categoryId || '',
          topicId: question.topicId || '',
          competencyId: question.competencyId || '',
          difficulty: question.difficulty || 'medium',
        })),
        answers: {},
        startedAt: serverTimestamp(),
        startedAtMillis: now,
        expiresAtMillis: expiresAt,
        totalQuestions: selectedQuestions.length,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setHasStarted(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to start the diagnostic right now.';
      setLoadError(message);
    } finally {
      setIsStarting(false);
    }
  };

  const handleNext = async (optionId: string) => {
    if (isSubmitting) return;
    const currentQuestion = questions[currentIndex];
    if (!currentQuestion) return;
    const newAnswers = { ...answers, [currentQuestion.id]: optionId };
    setAnswers(newAnswers);

    if (attemptIdRef.current) {
      void setDoc(doc(db, 'diagnosticAttempts', attemptIdRef.current), {
        draftAnswers: newAnswers,
        answeredCount: Object.keys(newAnswers).length,
        updatedAt: serverTimestamp(),
      }, { merge: true }).catch((error) => console.warn('diagnostic answer autosave failed', error));
    }

    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
      return;
    }

    await submitDiagnostic(newAnswers, 'submitted');
  };

  const cooldownEndsAt = lastAttemptAt ? new Date(lastAttemptAt.getTime() + 3 * 24 * 60 * 60 * 1000) : null;
  const isCooldownActive = !!cooldownEndsAt && cooldownEndsAt.getTime() > Date.now();

  if (isLoading) return (
    <div className="min-h-screen bg-surface flex flex-col items-center justify-center p-6 text-center">
      <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mb-6"></div>
      <div className="font-headline text-xl font-bold text-on-surface">Assembling Assessment...</div>
      <div className="text-on-surface-variant mt-2">Checking the approved LET diagnostic bank</div>
    </div>
  );

  if (questionPool.length === 0) {
    return (
      <div className="p-12 text-center max-w-md mx-auto mt-20">
        <h2 className="text-xl font-bold mb-4">No diagnostic bank available</h2>
        <p className="text-slate-500 mb-6">We do not have approved diagnostic questions for your track yet. You can still explore public reviewers.</p>
        <button onClick={skipAssessment} className="bg-[#1b366a] text-white px-6 py-2 rounded-xl font-bold">Skip for now</button>
      </div>
    );
  }

  if (!hasStarted) {
    return (
      <div className="bg-surface text-on-surface font-body min-h-screen flex items-center justify-center p-6">
        <div className="max-w-2xl w-full bg-surface-container-lowest rounded-3xl p-8 md:p-12 shadow-xl shadow-primary/10 border border-outline-variant/30">
          <div className="w-16 h-16 bg-primary/10 text-primary rounded-2xl flex items-center justify-center mb-6">
            <span className="material-symbols-outlined text-3xl">psychology</span>
          </div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-primary mb-3">{blueprint.title || 'LET Baseline Diagnostic'}</p>
          <h1 className="text-3xl font-black font-headline text-on-surface mb-4">{attemptCount > 0 ? 'Reassessment' : 'Diagnostic Assessment'}</h1>
          <p className="text-on-surface-variant font-medium mb-8 leading-relaxed">
            {attemptCount > 0
              ? 'This reassessment updates your learning profile and tracks how your mastery changes over time.'
              : 'This diagnostic gives the AI mentor real baseline data without creating fake progress or fake scores.'}
          </p>
          {isCooldownActive && (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm font-bold text-amber-700 mb-6">
              You can reassess every 3 days. Next available: {cooldownEndsAt?.toLocaleString()}.
            </div>
          )}
          {loadError && (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm font-bold text-red-700 mb-6">
              {loadError}
            </div>
          )}

          <div className="grid sm:grid-cols-3 gap-3 mb-10">
            <div className="bg-surface-container p-4 rounded-2xl border border-outline-variant/30">
              <div className="text-xs font-black uppercase tracking-widest text-on-surface-variant/60">Question bank</div>
              <div className="mt-1 text-lg font-black">{questionPool.length} approved</div>
            </div>
            <div className="bg-surface-container p-4 rounded-2xl border border-outline-variant/30">
              <div className="text-xs font-black uppercase tracking-widest text-on-surface-variant/60">Blueprint target</div>
              <div className="mt-1 text-lg font-black">{blueprint.questionCount || DEFAULT_DIAGNOSTIC_BLUEPRINT.questionCount} items</div>
            </div>
            <div className="bg-surface-container p-4 rounded-2xl border border-outline-variant/30">
              <div className="text-xs font-black uppercase tracking-widest text-on-surface-variant/60">Time limit</div>
              <div className="mt-1 text-lg font-black">{blueprint.timeLimitMinutes || DEFAULT_DIAGNOSTIC_BLUEPRINT.timeLimitMinutes} min</div>
            </div>
          </div>

          <button
            onClick={startAssessment}
            disabled={isCooldownActive || isStarting}
            className="w-full bg-primary text-on-primary font-bold py-4 px-6 rounded-2xl shadow-lg hover:-translate-y-0.5 transition-transform uppercase tracking-widest text-sm flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isStarting ? 'Preparing fixed attempt...' : 'Start Assessment'} <span className="material-symbols-outlined text-lg">arrow_forward</span>
          </button>
          <button onClick={skipAssessment} className="w-full mt-3 text-on-surface-variant text-xs font-black uppercase tracking-widest py-3 rounded-xl hover:bg-surface-container">
            Skip for now
          </button>
        </div>
      </div>
    );
  }

  const currentQuestion = questions[currentIndex];

  return (
    <div className="bg-surface text-on-surface font-body min-h-screen flex flex-col antialiased">
      <header className="px-5 py-4 flex items-center justify-between bg-surface-container-lowest border-b border-outline-variant sticky top-0 z-20">
        <button onClick={skipAssessment} className="text-xs font-black uppercase tracking-widest text-on-surface-variant hover:text-primary">Exit</button>
        <div className="font-bold text-primary">Diagnostic Assessment {isSubmitting && '- Saving...'}</div>
        <div className="flex items-center gap-4 text-xs font-bold text-on-surface-variant/70">
          <span>{formatTime(timeRemaining)}</span>
          <span>Question {currentIndex + 1} of {questions.length}</span>
        </div>
      </header>

      <main className="flex-1 flex flex-col max-w-2xl mx-auto w-full px-5 py-8 opacity-100">
        <div className="mb-8">
          <div className="w-full bg-surface-container-high h-2 rounded-full overflow-hidden">
            <div
              className="bg-primary h-full transition-all duration-300"
              style={{ width: `${((currentIndex) / questions.length) * 100}%` }}
            />
          </div>
        </div>

        <div className="text-xl font-extrabold font-headline mb-8 text-on-surface">
          {currentQuestion?.stem}
        </div>

        <div className="space-y-4">
          {currentQuestion?.options.map((opt) => (
            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              key={opt.id}
              onClick={() => !isSubmitting && handleNext(opt.id)}
              className="w-full text-left p-5 rounded-2xl bg-surface-container-lowest border border-outline-variant shadow-sm hover:border-primary/50 transition-all font-semibold flex items-start gap-4"
            >
              <div className="w-8 h-8 rounded-xl bg-surface-container text-on-surface-variant/60 flex items-center justify-center font-bold">
                {opt.id}
              </div>
              <div className="pt-1.5 flex-1">{opt.text}</div>
            </motion.button>
          ))}
        </div>
      </main>
    </div>
  );
}
