import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import {
  AssessmentEndReason,
  AssessmentWarningLog,
  createIntegrityWarning,
  getAttemptStatus,
  getIntegrityPolicy,
  shouldAutoSubmitForWarning,
} from '../lib/assessmentIntegrity';
import { pickBalancedQuestionsFromBlueprint } from '../lib/examBlueprints';
import { calculateFullMockCooldown, ExamCooldown } from '../lib/examCooldown';

interface QuestionOption {
  id: string;
  text: string;
  originalId?: string;
}

interface Question {
  id: string;
  stem: string;
  options: QuestionOption[];
  correctOptionId: string;
  originalCorrectOptionId?: string;
  categoryId?: string;
  topicId?: string;
  skillIds?: string[];
  competencyId?: string;
  difficulty?: string;
  explanation?: string;
  rationalization?: string;
  wrongChoiceExplanations?: Record<string, string>;
  misconceptionTags?: string[];
  relatedModuleId?: string;
  moduleId?: string;
  type?: string;
  specialization?: string;
  familyId?: string;
  optionOrder?: Array<{ shownId: string; originalId: string }>;
  exposureRank?: number;
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
  specialization?: string;
  isActive?: boolean;
  isPublished?: boolean;
  status?: string;
}

interface AnswerRecord {
  questionId: string;
  questionNumber: number;
  selectedOptionId: string;
  correctOptionId: string;
  originalCorrectOptionId?: string;
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
  familyId?: string;
  optionOrder?: Array<{ shownId: string; originalId: string }>;
}

interface ExamResult {
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
  warningLogs: AssessmentWarningLog[];
}

type ExamPhase = 'loading' | 'instructions' | 'in_progress' | 'warning_blocked' | 'auto_submitting' | 'submitted';

interface RecoveryPlan {
  weakCategories: Array<{ id: string; scorePercent: number; total: number; correct: number }>;
  weakTopics: Array<{ id: string; missed: number }>;
  recommendedModuleIds: string[];
  tasks: Array<{ title: string; body: string; targetLink: string; priority: 'high' | 'medium' | 'low' }>;
}

const DEFAULT_PRACTICE_COUNT = 20;
const DEFAULT_MOCK_COUNT = 100;
const DEFAULT_PRACTICE_MINUTES = 30;
const DEFAULT_MOCK_MINUTES = 180;

const formatTime = (seconds: number) => {
  const safeSeconds = Math.max(0, seconds);
  const h = Math.floor(safeSeconds / 3600);
  const m = Math.floor((safeSeconds % 3600) / 60);
  const s = safeSeconds % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

function buildRecoveryPlan(result: ExamResult): RecoveryPlan {
  const missedAnswers = result.answers.filter((answer) => !answer.isCorrect);
  const weakCategories = Object.entries(result.categoryBreakdown)
    .map(([id, row]) => ({ id, ...row }))
    .filter((row) => row.scorePercent < 70 || row.correct < row.total)
    .sort((a, b) => a.scorePercent - b.scorePercent);
  const weakTopicMap = missedAnswers.reduce<Record<string, number>>((acc, answer) => {
    const key = answer.topicId || answer.categoryId || 'uncategorized';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const weakTopics = Object.entries(weakTopicMap)
    .map(([id, missed]) => ({ id, missed }))
    .sort((a, b) => b.missed - a.missed);
  const recommendedModuleIds = Array.from(new Set(missedAnswers.map((answer) => answer.relatedModuleId).filter(Boolean)));
  const topWeakTopic = weakTopics[0]?.id || weakCategories[0]?.id || '';
  const topCompetency = missedAnswers.find((answer) => answer.competencyId)?.competencyId || '';
  const topMisconception = missedAnswers.flatMap((answer) => answer.misconceptionTags || [])[0] || '';
  const tasks: RecoveryPlan['tasks'] = missedAnswers.length === 0
    ? [{
      title: 'Maintain recall',
      body: 'No missed items were recorded. Use flashcards to keep the concepts fresh before the next simulation.',
      targetLink: '/flashcards',
      priority: 'low',
    }]
    : [
      {
        title: 'Review missed items first',
        body: `${missedAnswers.length} item${missedAnswers.length === 1 ? '' : 's'} should go through rationalization before another exam.`,
        targetLink: '/mistake-bank',
        priority: 'high',
      },
      {
        title: topWeakTopic ? `Rebuild ${topWeakTopic}` : 'Rebuild weak concepts',
        body: `Focus on ${topCompetency || topWeakTopic || 'the missed competency'}${topMisconception ? `, especially ${topMisconception}` : ''}. Review the lesson, then take a targeted repair drill.`,
        targetLink: recommendedModuleIds[0] ? `/quest?moduleId=${recommendedModuleIds[0]}` : '/student/courses',
        priority: 'high',
      },
      {
        title: 'Use recall practice',
        body: 'Run flashcards after reviewing so weak concepts return before the next timed attempt.',
        targetLink: '/flashcards',
        priority: 'medium',
      },
    ];

  return { weakCategories, weakTopics, recommendedModuleIds, tasks };
}

const normalizeQuestion = (id: string, data: any): Question => ({
  id,
  stem: data.stem || data.question || '',
  options: (data.options || []).map((option: any, index: number) => ({
    id: option.id || String.fromCharCode(65 + index),
    text: option.text || option.value || '',
  })),
  correctOptionId: data.correctOptionId || data.correctOption || data.answer || '',
  originalCorrectOptionId: data.originalCorrectOptionId || data.correctOptionId || data.correctOption || data.answer || '',
  categoryId: data.categoryId || '',
  topicId: data.topicId || '',
  skillIds: data.skillIds || [],
  competencyId: data.competencyId || data.competency || '',
  difficulty: data.difficulty || 'medium',
  explanation: data.explanation || data.rationalization || '',
  rationalization: data.rationalization || data.explanation || '',
  wrongChoiceExplanations: data.wrongChoiceExplanations || {},
  misconceptionTags: data.misconceptionTags || [],
  relatedModuleId: data.relatedModuleId || data.moduleId || '',
  moduleId: data.moduleId || '',
  type: data.type || 'practice',
  specialization: data.specialization || '',
  familyId: data.familyId || data.questionFamilyId || '',
  optionOrder: data.optionOrder || [],
  exposureRank: data.exposureRank || undefined,
});

const buildDefaultBlueprint = (isFullMock: boolean): ExamBlueprint => ({
  id: isFullMock ? 'default-full-let' : 'default-practice',
  title: isFullMock ? 'Full LET Simulation' : 'Practice Drill',
  type: isFullMock ? 'full_mock' : 'practice',
  questionCount: isFullMock ? DEFAULT_MOCK_COUNT : DEFAULT_PRACTICE_COUNT,
  timeLimitMinutes: isFullMock ? DEFAULT_MOCK_MINUTES : DEFAULT_PRACTICE_MINUTES,
  passingScore: isFullMock ? 75 : 70,
});

const pickQuestionsFromBlueprint = (
  pool: Question[],
  blueprint: ExamBlueprint,
  isFullMock: boolean,
  categoryId: string | null,
) => {
  const count = blueprint.questionCount || (isFullMock ? DEFAULT_MOCK_COUNT : DEFAULT_PRACTICE_COUNT);
  return pickBalancedQuestionsFromBlueprint(pool, blueprint, {
    count,
    categoryId,
    requireFullCount: isFullMock,
  });
};

function buildExposurePolicyFromAttempts(attemptRows: any[], assessmentMode: string, categoryId: string | null) {
  const relevantRows = attemptRows
    .filter((attempt) => {
      if (assessmentMode === 'full_mock') return ['full_mock', 'mock_exam'].includes(attempt.assessmentMode || attempt.type || '');
      if (categoryId) return attempt.assessmentMode === assessmentMode || attempt.categoryId === categoryId || attempt.blueprintId?.includes(categoryId);
      return ['practice', 'category_practice', 'practice_exam'].includes(attempt.assessmentMode || attempt.type || '');
    })
    .sort((a, b) => {
      const bTime = Number(b.submittedAtMillis || b.startedAtMillis || b.createdAtMillis || b.submittedAt?.toMillis?.() || b.createdAt?.toMillis?.() || 0);
      const aTime = Number(a.submittedAtMillis || a.startedAtMillis || a.createdAtMillis || a.submittedAt?.toMillis?.() || a.createdAt?.toMillis?.() || 0);
      return bTime - aTime;
    });
  const allQuestions = new Set<string>();
  const allFamilies = new Set<string>();
  const recentQuestions = new Set<string>();
  const recentFamilies = new Set<string>();

  relevantRows.forEach((attempt, attemptIndex) => {
    const generatedQuestions = Array.isArray(attempt.generatedQuestions) ? attempt.generatedQuestions : [];
    const generatedQuestionIds = Array.isArray(attempt.generatedQuestionIds) ? attempt.generatedQuestionIds : [];
    generatedQuestionIds.forEach((questionId: string) => {
      if (questionId) allQuestions.add(questionId);
      if (attemptIndex < 3 && questionId) recentQuestions.add(questionId);
    });
    generatedQuestions.forEach((question: any) => {
      if (question.questionId) allQuestions.add(question.questionId);
      if (question.familyId) allFamilies.add(question.familyId);
      if (attemptIndex < 3) {
        if (question.questionId) recentQuestions.add(question.questionId);
        if (question.familyId) recentFamilies.add(question.familyId);
      }
    });
  });

  return {
    seenQuestionIds: [...allQuestions],
    seenFamilyIds: [...allFamilies],
    recentQuestionIds: [...recentQuestions],
    recentFamilyIds: [...recentFamilies],
  };
}

export default function ExamSimulation() {
  const [searchParams] = useSearchParams();
  const categoryId = searchParams.get('category');
  const topicId = searchParams.get('topic');
  const isFullMock = searchParams.get('type') === 'mock';
  const navigate = useNavigate();
  const { user } = useAuth();

  const [phase, setPhase] = useState<ExamPhase>('loading');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [questionPool, setQuestionPool] = useState<Question[]>([]);
  const [blueprint, setBlueprint] = useState<ExamBlueprint>(() => buildDefaultBlueprint(isFullMock));
  const [loadError, setLoadError] = useState('');
  const [attemptId, setAttemptId] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [flaggedIds, setFlaggedIds] = useState<string[]>([]);
  const [startedAtMillis, setStartedAtMillis] = useState(0);
  const [expiresAtMillis, setExpiresAtMillis] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState((isFullMock ? DEFAULT_MOCK_MINUTES : DEFAULT_PRACTICE_MINUTES) * 60);
  const [warningCount, setWarningCount] = useState(0);
  const [warningLogs, setWarningLogs] = useState<AssessmentWarningLog[]>([]);
  const [warningModal, setWarningModal] = useState<AssessmentWarningLog | null>(null);
  const [refreshCount, setRefreshCount] = useState(0);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [offlineSince, setOfflineSince] = useState<number | null>(null);
  const [lastActivityAt, setLastActivityAt] = useState(Date.now());
  const [agreementChecked, setAgreementChecked] = useState(false);
  const [result, setResult] = useState<ExamResult | null>(null);
  const [cooldown, setCooldown] = useState<ExamCooldown | null>(null);

  const phaseRef = useRef(phase);
  const questionsRef = useRef(questions);
  const answersRef = useRef(answers);
  const flaggedIdsRef = useRef(flaggedIds);
  const warningLogsRef = useRef(warningLogs);
  const warningCountRef = useRef(warningCount);
  const attemptIdRef = useRef(attemptId);
  const expiresAtRef = useRef(expiresAtMillis);
  const startedAtRef = useRef(startedAtMillis);
  const submittingRef = useRef(false);
  const restoredRef = useRef(false);

  const mode = isFullMock ? 'full_mock' : topicId ? 'topic_practice' : categoryId ? 'category_practice' : 'practice';
  const localAttemptKey = user ? `let-mastery-exam-attempt:${user.uid}:${mode}:${categoryId || 'all'}:${topicId || 'all'}` : '';
  const currentQuestion = questions[currentIndex];
  const answeredCount = Object.keys(answers).filter((questionId) => questions.some((question) => question.id === questionId)).length;
  const unansweredCount = Math.max(0, questions.length - answeredCount);
  const plannedQuestionCount = Math.max(1, Number(blueprint.questionCount || (isFullMock ? DEFAULT_MOCK_COUNT : DEFAULT_PRACTICE_COUNT)));
  const integrityLevel = isFullMock ? 'strict_exam_mode' : 'standard_protection';
  const integrityPolicy = useMemo(() => getIntegrityPolicy(integrityLevel), [integrityLevel]);
  const integrityLabel = integrityPolicy.label;

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    questionsRef.current = questions;
  }, [questions]);

  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  useEffect(() => {
    flaggedIdsRef.current = flaggedIds;
  }, [flaggedIds]);

  useEffect(() => {
    warningLogsRef.current = warningLogs;
  }, [warningLogs]);

  useEffect(() => {
    warningCountRef.current = warningCount;
  }, [warningCount]);

  useEffect(() => {
    attemptIdRef.current = attemptId;
  }, [attemptId]);

  useEffect(() => {
    expiresAtRef.current = expiresAtMillis;
  }, [expiresAtMillis]);

  useEffect(() => {
    startedAtRef.current = startedAtMillis;
  }, [startedAtMillis]);

  const compileResult = useCallback((finalAnswers: Record<string, string>, finalLogs: AssessmentWarningLog[], reason: AssessmentEndReason): ExamResult => {
    const finalQuestions = questionsRef.current;
    const answerRecords = finalQuestions.map((question, index) => {
      const selectedOptionId = finalAnswers[question.id] || '';
      const isUnanswered = !selectedOptionId;
      const isCorrect = Boolean(selectedOptionId) && selectedOptionId === question.correctOptionId;
      return {
        questionId: question.id,
        questionNumber: index + 1,
        selectedOptionId,
        correctOptionId: question.correctOptionId || '',
        originalCorrectOptionId: question.originalCorrectOptionId || question.correctOptionId || '',
        isCorrect,
        isUnanswered,
        categoryId: question.categoryId || '',
        topicId: question.topicId || '',
        skillIds: question.skillIds || [],
        competencyId: question.competencyId || '',
        difficulty: question.difficulty || 'medium',
        stem: question.stem,
        options: question.options || [],
        explanation: question.explanation || '',
        rationalization: question.rationalization || question.explanation || '',
        wrongChoiceExplanations: question.wrongChoiceExplanations || {},
        misconceptionTags: question.misconceptionTags || [],
        relatedModuleId: question.relatedModuleId || question.moduleId || '',
        familyId: question.familyId || '',
        optionOrder: question.optionOrder || [],
      };
    });

    const correctCount = answerRecords.filter((answer) => answer.isCorrect).length;
    const unanswered = answerRecords.filter((answer) => answer.isUnanswered).length;
    const wrongCount = answerRecords.length - correctCount;
    const categoryBreakdown = answerRecords.reduce<Record<string, { total: number; correct: number; scorePercent: number }>>((acc, answer) => {
      const key = answer.categoryId || 'uncategorized';
      acc[key] = acc[key] || { total: 0, correct: 0, scorePercent: 0 };
      acc[key].total += 1;
      if (answer.isCorrect) acc[key].correct += 1;
      acc[key].scorePercent = Math.round((acc[key].correct / acc[key].total) * 100);
      return acc;
    }, {});

    const scorePercent = answerRecords.length ? Math.round((correctCount / answerRecords.length) * 100) : 0;
    const now = Date.now();
    const timeUsedSeconds = startedAtRef.current ? Math.max(0, Math.round((now - startedAtRef.current) / 1000)) : 0;

    return {
      attemptId: attemptIdRef.current,
      status: getAttemptStatus(reason),
      scorePercent,
      totalQuestions: answerRecords.length,
      correctCount,
      wrongCount,
      unansweredCount: unanswered,
      answeredCount: answerRecords.length - unanswered,
      timeUsedSeconds,
      categoryBreakdown,
      answers: answerRecords,
      warningLogs: finalLogs,
    };
  }, []);

  const submitAttempt = useCallback(async (reason: AssessmentEndReason, logsOverride?: AssessmentWarningLog[]) => {
    if (submittingRef.current || !user) return;
    submittingRef.current = true;
    setPhase('auto_submitting');
    const finalAttemptId = attemptIdRef.current || doc(collection(db, 'mockExamAttempts')).id;
    if (!attemptIdRef.current) {
      setAttemptId(finalAttemptId);
      attemptIdRef.current = finalAttemptId;
    }

    const finalAnswers = answersRef.current;
    const finalLogs = logsOverride || warningLogsRef.current;
    let finalResult = compileResult(finalAnswers, finalLogs, reason);
    finalResult.attemptId = finalAttemptId;
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
          warningLogs: finalLogs,
          reason,
        }),
      });
      const data = await response.json();
      if (response.ok && data.success && data.result) {
        finalResult = { ...data.result, attemptId: finalAttemptId };
      }
    } catch (error) {
      console.warn('server exam finalization unavailable; using local result', error);
    }
    const attemptStatus = finalResult.status;
    const recoveryPlan = buildRecoveryPlan(finalResult);

    try {
      const attemptRef = doc(db, 'mockExamAttempts', finalAttemptId);
      await setDoc(attemptRef, {
        id: finalAttemptId,
        userId: user.uid,
        type: isFullMock ? 'mock_exam' : 'practice_exam',
        mode: user.learningMode || 'self_review',
        assessmentMode: mode,
        integrityLevel: integrityPolicy.level,
        status: attemptStatus,
        state: attemptStatus,
        blueprintId: blueprint.id || '',
        blueprintTitle: blueprint.title || '',
        generatedQuestionIds: questionsRef.current.map((question) => question.id),
        generatedQuestions: questionsRef.current.map((question, index) => ({
          questionId: question.id,
          questionNumber: index + 1,
          stem: question.stem,
          options: question.options,
          correctOptionId: question.correctOptionId || '',
          originalCorrectOptionId: question.originalCorrectOptionId || question.correctOptionId || '',
          optionOrder: question.optionOrder || [],
          familyId: question.familyId || '',
          categoryId: question.categoryId || '',
          topicId: question.topicId || '',
          competencyId: question.competencyId || '',
          difficulty: question.difficulty || 'medium',
          misconceptionTags: question.misconceptionTags || [],
        })),
        answers: finalResult.answers,
        flaggedItemIds: flaggedIdsRef.current,
        warningCount: finalLogs.length,
        warningLogs: finalLogs,
        refreshCount,
        startedAtMillis: startedAtRef.current,
        expiresAtMillis: expiresAtRef.current,
        submittedAt: serverTimestamp(),
        endedReason: reason,
        scorePercent: finalResult.scorePercent,
        totalQuestions: finalResult.totalQuestions,
        answeredCount: finalResult.answeredCount,
        unansweredCount: finalResult.unansweredCount,
        correctCount: finalResult.correctCount,
        wrongCount: finalResult.wrongCount,
        timeUsedSeconds: finalResult.timeUsedSeconds,
        categoryBreakdown: finalResult.categoryBreakdown,
        recoveryPlan,
        flaggedForReview: reason !== 'submitted' || finalLogs.length > 0,
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
          rationalization: answer.rationalization,
          wrongChoiceExplanations: answer.wrongChoiceExplanations,
          misconceptionTags: answer.misconceptionTags || [],
          selectedOptionId: answer.selectedOptionId,
          correctOptionId: answer.correctOptionId,
          originalCorrectOptionId: answer.originalCorrectOptionId || answer.correctOptionId,
          categoryId: answer.categoryId,
          topicId: answer.topicId,
          competencyId: answer.competencyId,
          difficulty: answer.difficulty,
          skillIds: answer.skillIds,
          familyId: answer.familyId || '',
          optionOrder: answer.optionOrder || [],
          relatedModuleId: answer.relatedModuleId,
          examType: isFullMock ? 'mock_exam' : 'practice_exam',
          sourceAttemptId: finalAttemptId,
          isUnanswered: answer.isUnanswered,
          timesMissed: increment(1),
          firstMissedAt: serverTimestamp(),
          lastMissedAt: serverTimestamp(),
        }, { merge: true }));
      await Promise.all(mistakeWrites);

      try {
        await updateDoc(doc(db, 'learnerProfiles', user.uid), {
          lastExamScore: finalResult.scorePercent,
          lastExamAttemptId: finalAttemptId,
          lastUpdatedAt: serverTimestamp(),
        });
      } catch (error) {
        console.warn('learner profile update failed', error);
      }

      try {
        const { updateMasteryAndRecommend } = await import('../lib/adaptiveEngine');
        await updateMasteryAndRecommend({
          userId: user.uid,
          answers: finalResult.answers.map((answer) => ({
            questionId: answer.questionId,
            selectedOptionId: answer.selectedOptionId,
            correctOptionId: answer.correctOptionId,
            isCorrect: answer.isCorrect,
            categoryId: answer.categoryId,
            topicId: answer.topicId,
            skillIds: answer.skillIds,
          })),
        });
      } catch (error) {
        console.warn('adaptive update failed', error);
      }

      if (isFullMock) {
        try {
          const attemptsSnap = await getDocs(query(collection(db, 'mockExamAttempts'), where('userId', '==', user.uid)));
          const attemptRows = attemptsSnap.docs.map((attemptDoc) => ({ id: attemptDoc.id, ...attemptDoc.data() }));
          const nextCooldown = calculateFullMockCooldown([
            ...attemptRows,
            {
              id: finalAttemptId,
              type: 'mock_exam',
              assessmentMode: mode,
              scorePercent: finalResult.scorePercent,
              status: attemptStatus,
              endedReason: reason,
              flaggedForReview: reason !== 'submitted' || finalLogs.length > 0,
              submittedAtMillis: Date.now(),
            },
          ]);
          if (nextCooldown) {
            setCooldown(nextCooldown);
            await setDoc(doc(db, 'studentReviewSettings', user.uid), {
              userId: user.uid,
              mockExamCooldownUntilMillis: nextCooldown.lockedUntilMillis,
              mockExamCooldownReason: nextCooldown.reason,
              mockExamCooldownMessage: nextCooldown.message,
              updatedAt: serverTimestamp(),
            }, { merge: true });
          }
        } catch (error) {
          console.warn('mock exam cooldown update failed', error);
        }
      }
    } catch (error) {
      console.error('Failed to save exam attempt', error);
    } finally {
      if (localAttemptKey) localStorage.removeItem(localAttemptKey);
      setResult(finalResult);
      setPhase('submitted');
      submittingRef.current = false;
    }
  }, [blueprint.id, blueprint.title, compileResult, integrityPolicy.level, isFullMock, localAttemptKey, mode, refreshCount, user]);

  const recordWarning = useCallback((type: string, message: string) => {
    if (!['in_progress', 'warning_blocked'].includes(phaseRef.current) || submittingRef.current) return;
    const nextCount = warningCountRef.current + 1;
    const nextLog = createIntegrityWarning(type, message, nextCount);
    const nextLogs = [...warningLogsRef.current, nextLog];
    setWarningCount(nextCount);
    setWarningLogs(nextLogs);
    setWarningModal(nextLog);

    if (shouldAutoSubmitForWarning(nextCount, integrityPolicy)) {
      void submitAttempt('warnings', nextLogs);
      return;
    }

    setPhase('warning_blocked');
    if (attemptIdRef.current) {
      void updateDoc(doc(db, 'mockExamAttempts', attemptIdRef.current), {
        status: 'warning_blocked',
        state: 'warning_blocked',
        warningCount: nextCount,
        warningLogs: nextLogs,
        updatedAt: serverTimestamp(),
      }).catch((error) => console.warn('warning update failed', error));
    }
  }, [integrityPolicy, submitAttempt]);

  useEffect(() => {
    const loadExam = async () => {
      if (!user) return;
      setPhase('loading');
      setLoadError('');

      if (localAttemptKey && !restoredRef.current) {
        const saved = localStorage.getItem(localAttemptKey);
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            if (parsed?.status === 'in_progress' && Array.isArray(parsed.questions) && parsed.questions.length > 0) {
              restoredRef.current = true;
              const nextRefreshCount = Number(parsed.refreshCount || 0) + 1;
              setQuestions(parsed.questions);
              setBlueprint(parsed.blueprint || buildDefaultBlueprint(isFullMock));
              setAttemptId(parsed.attemptId || '');
              setAnswers(parsed.answers || {});
              setFlaggedIds(parsed.flaggedIds || []);
              setCurrentIndex(parsed.currentIndex || 0);
              setStartedAtMillis(parsed.startedAtMillis || Date.now());
              setExpiresAtMillis(parsed.expiresAtMillis || Date.now());
              setWarningLogs(parsed.warningLogs || []);
              setWarningCount(parsed.warningCount || 0);
              setRefreshCount(nextRefreshCount);
              setPhase('warning_blocked');
              const recoveryLog = {
                type: 'refresh_recovery',
                message: nextRefreshCount >= 5
                  ? 'The exam was refreshed repeatedly. This attempt is now flagged for review.'
                  : 'The same exam attempt was restored after a refresh. Review the recovery notice before continuing.',
                createdAtMillis: Date.now(),
                count: Number(parsed.warningCount || 0),
              };
              setWarningModal(recoveryLog);
              if (parsed.attemptId) {
                void updateDoc(doc(db, 'mockExamAttempts', parsed.attemptId), {
                  refreshCount: nextRefreshCount,
                  status: 'warning_blocked',
                  state: 'warning_blocked',
                  updatedAt: serverTimestamp(),
                }).catch((error) => console.warn('refresh recovery update failed', error));
              }
              return;
            }
          } catch (error) {
            console.warn('failed to restore exam attempt', error);
          }
        }
      }

      try {
        if (isFullMock) {
          const settingsSnap = await getDoc(doc(db, 'studentReviewSettings', user.uid)).catch(() => null);
          const settings = settingsSnap?.exists() ? settingsSnap.data() as any : null;
          if (Number(settings?.mockExamCooldownUntilMillis || 0) > Date.now()) {
            setCooldown({
              lockedUntilMillis: Number(settings.mockExamCooldownUntilMillis),
              reason: settings.mockExamCooldownReason === 'repeated_low_scores' ? 'repeated_low_scores' : 'repeated_integrity_stops',
              message: settings.mockExamCooldownMessage || 'Full mock access is temporarily paused. Review first, then try again.',
            });
            setQuestions([]);
            setPhase('instructions');
            return;
          }

          const attemptSnap = await getDocs(query(collection(db, 'mockExamAttempts'), where('userId', '==', user.uid))).catch(() => null);
          const nextCooldown = calculateFullMockCooldown(attemptSnap ? attemptSnap.docs.map((attemptDoc) => ({ id: attemptDoc.id, ...attemptDoc.data() })) : []);
          if (nextCooldown) {
            setCooldown(nextCooldown);
            await setDoc(doc(db, 'studentReviewSettings', user.uid), {
              userId: user.uid,
              mockExamCooldownUntilMillis: nextCooldown.lockedUntilMillis,
              mockExamCooldownReason: nextCooldown.reason,
              mockExamCooldownMessage: nextCooldown.message,
              updatedAt: serverTimestamp(),
            }, { merge: true });
            setQuestions([]);
            setPhase('instructions');
            return;
          }
        }

        const blueprintRows = await getDocs(collection(db, 'examBlueprints')).catch(() => null);
        const availableBlueprints = blueprintRows
          ? blueprintRows.docs.map((blueprintDoc) => ({ id: blueprintDoc.id, ...blueprintDoc.data() } as ExamBlueprint))
          : [];
        const preferredBlueprint = availableBlueprints.find((item) => {
          const blueprintMode = item.type || item.examMode || '';
          return item.isActive !== false &&
            item.isPublished !== false &&
            item.status !== 'archived' &&
            (isFullMock
              ? ['full_mock', 'mock_exam', 'full_let_simulation'].includes(blueprintMode)
              : ['practice', 'category_practice', 'drill', 'practice_drill'].includes(blueprintMode || ''));
        }) || buildDefaultBlueprint(isFullMock);
        setBlueprint(preferredBlueprint);

        const questionsQuery = query(
          collection(db, 'questions'),
          where('isPublished', '==', true),
          where('approved', '==', true),
        );
        const questionSnap = await getDocs(questionsQuery);
        const focus = user.selectedFocus || user.reviewTrack || user.specialization || '';
        const approvedQuestions = questionSnap.docs
          .map((questionDoc) => normalizeQuestion(questionDoc.id, questionDoc.data()))
          .filter((question) => {
            if (categoryId && question.categoryId !== categoryId) return false;
            if (topicId && question.topicId !== topicId) return false;
            if (!isFullMock || !focus) return true;
            return !question.specialization || question.specialization === focus || ['gened', 'profed'].includes(question.categoryId || '');
          })
          .filter((question) => question.stem && question.options.length >= 2 && question.correctOptionId);

        pickQuestionsFromBlueprint(approvedQuestions, preferredBlueprint, isFullMock, categoryId);
        setQuestionPool(approvedQuestions);
        setQuestions([]);
        setPhase('instructions');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to prepare this exam right now.';
        setLoadError(message);
        setQuestionPool([]);
        setQuestions([]);
        setPhase('instructions');
      }
    };

    void loadExam();
  }, [categoryId, isFullMock, localAttemptKey, topicId, user]);

  useEffect(() => {
    if (!localAttemptKey || !['in_progress', 'warning_blocked'].includes(phase) || !attemptId) return;
    localStorage.setItem(localAttemptKey, JSON.stringify({
      status: 'in_progress',
      attemptId,
      questions,
      blueprint,
      answers,
      flaggedIds,
      currentIndex,
      startedAtMillis,
      expiresAtMillis,
      warningCount,
      warningLogs,
      refreshCount,
    }));
  }, [answers, attemptId, blueprint, currentIndex, expiresAtMillis, flaggedIds, localAttemptKey, phase, questions, refreshCount, startedAtMillis, warningCount, warningLogs]);

  useEffect(() => {
    if (!['in_progress', 'warning_blocked'].includes(phase)) return;
    const timer = window.setInterval(() => {
      const remaining = Math.ceil((expiresAtRef.current - Date.now()) / 1000);
      setTimeRemaining(Math.max(0, remaining));
      if (remaining <= 0) {
        void submitAttempt('time_expired');
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [phase, submitAttempt]);

  useEffect(() => {
    if (!['in_progress', 'warning_blocked'].includes(phase)) return;

    const markActivity = () => setLastActivityAt(Date.now());
    const activityEvents = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];
    activityEvents.forEach((eventName) => window.addEventListener(eventName, markActivity, { passive: true }));

    const idleTimer = window.setInterval(() => {
      const idleFor = Date.now() - lastActivityAt;
      if (idleFor >= integrityPolicy.idleStopMs) {
        void submitAttempt('idle');
      } else if (idleFor >= integrityPolicy.idleWarningMs && phaseRef.current === 'in_progress') {
        recordWarning('idle', 'No activity was detected for several minutes. The timer continued while you were idle.');
      }
    }, 30000);

    return () => {
      activityEvents.forEach((eventName) => window.removeEventListener(eventName, markActivity));
      window.clearInterval(idleTimer);
    };
  }, [integrityPolicy.idleStopMs, integrityPolicy.idleWarningMs, lastActivityAt, phase, recordWarning, submitAttempt]);

  useEffect(() => {
    if (!['in_progress', 'warning_blocked'].includes(phase)) return;

    const onVisibility = () => {
      if (document.hidden) {
        recordWarning('tab_hidden', 'The assessment tab was hidden or another window became active.');
      }
    };
    const onBlur = () => recordWarning('window_blur', 'The exam window lost focus.');
    const onCopy = (event: ClipboardEvent) => {
      event.preventDefault();
      recordWarning('copy_blocked', 'Copying assessment content is disabled for protected assessments.');
    };
    const onPaste = (event: ClipboardEvent) => {
      event.preventDefault();
      recordWarning('paste_blocked', 'Pasting into protected assessments is disabled.');
    };
    const onContextMenu = (event: MouseEvent) => {
      event.preventDefault();
      recordWarning('context_menu_blocked', 'Right-click actions are disabled during protected assessments.');
    };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    window.addEventListener('copy', onCopy);
    window.addEventListener('paste', onPaste);
    window.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('copy', onCopy);
      window.removeEventListener('paste', onPaste);
      window.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [phase, recordWarning]);

  useEffect(() => {
    const handleOffline = () => {
      const now = Date.now();
      setIsOnline(false);
      setOfflineSince(now);
      if (['in_progress', 'warning_blocked'].includes(phaseRef.current)) {
        recordWarning('offline', 'Connection was lost. Answers continue saving locally and the timer keeps running.');
      }
    };
    const handleOnline = () => {
      setIsOnline(true);
      setOfflineSince(null);
    };
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, [recordWarning]);

  useEffect(() => {
    if (!offlineSince || !['in_progress', 'warning_blocked'].includes(phase)) return;
    const timer = window.setInterval(() => {
      if (Date.now() - offlineSince >= integrityPolicy.offlineStopMs) {
        void submitAttempt('offline');
      }
    }, 15000);
    return () => window.clearInterval(timer);
  }, [integrityPolicy.offlineStopMs, offlineSince, phase, submitAttempt]);

  useEffect(() => {
    if (!['in_progress', 'warning_blocked'].includes(phase)) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') return;
      const key = event.key.toUpperCase();
      const option = currentQuestion?.options.find((item) => item.id.toUpperCase() === key);
      if (option) {
        setAnswers((current) => ({ ...current, [currentQuestion.id]: option.id }));
      }
      if (event.key === 'Enter') {
        setCurrentIndex((current) => Math.min(questions.length - 1, current + 1));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [currentQuestion, phase, questions.length]);

  const startAttempt = async () => {
    if (!user || questionPool.length === 0) return;
    setLoadError('');
    let startPayload: any = null;
    const previousAttemptsSnap = await getDocs(query(collection(db, 'mockExamAttempts'), where('userId', '==', user.uid))).catch(() => null);
    const previousAttempts = previousAttemptsSnap ? previousAttemptsSnap.docs.map((attemptDoc) => ({ id: attemptDoc.id, ...attemptDoc.data() })) : [];
    const exposurePolicy = buildExposurePolicyFromAttempts(previousAttempts, mode, categoryId);
    try {
      const response = await fetch('/api/exam/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          blueprint,
          questionPool,
          categoryId,
          isFullMock,
          assessmentMode: mode,
          userTrack: user.specialization || user.reviewTrack || user.selectedFocus || '',
          exposurePolicy,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Unable to start this exam attempt.');
      }
      startPayload = data;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to start this exam attempt.';
      setLoadError(message);
      return;
    }

    const selectedQuestions = (startPayload.questions || []) as Question[];
    if (selectedQuestions.length === 0) {
      setLoadError('The server did not return a valid fixed question set.');
      return;
    }

    const nextAttemptId = startPayload.attemptId || doc(collection(db, 'mockExamAttempts')).id;
    const now = Number(startPayload.startedAtMillis || Date.now());
    const expiresAt = Number(startPayload.expiresAtMillis || (now + (blueprint.timeLimitMinutes || (isFullMock ? DEFAULT_MOCK_MINUTES : DEFAULT_PRACTICE_MINUTES)) * 60 * 1000));
    setQuestions(selectedQuestions);
    setAttemptId(nextAttemptId);
    setStartedAtMillis(now);
    setExpiresAtMillis(expiresAt);
    setTimeRemaining(Math.max(0, Math.ceil((expiresAt - now) / 1000)));
    setAnswers({});
    setFlaggedIds([]);
    setCurrentIndex(0);
    setWarningCount(0);
    setWarningLogs([]);
    setRefreshCount(0);
    setPhase('in_progress');

    await setDoc(doc(db, 'mockExamAttempts', nextAttemptId), {
      id: nextAttemptId,
      userId: user.uid,
      type: isFullMock ? 'mock_exam' : 'practice_exam',
      mode: user.learningMode || 'self_review',
      assessmentMode: mode,
      integrityLevel: integrityPolicy.level,
      status: 'in_progress',
      state: 'in_progress',
      startedAt: serverTimestamp(),
      startedAtMillis: now,
      expiresAtMillis: expiresAt,
      blueprintId: blueprint.id || '',
      blueprintTitle: blueprint.title || '',
      blueprintSnapshot: startPayload.blueprintSnapshot || null,
      exposurePolicy: startPayload.exposurePolicy || exposurePolicy,
      totalQuestions: selectedQuestions.length,
      generatedQuestionIds: selectedQuestions.map((question) => question.id),
      generatedQuestions: selectedQuestions.map((question, index) => ({
        questionId: question.id,
        questionNumber: index + 1,
        stem: question.stem,
        options: question.options,
        correctOptionId: question.correctOptionId || '',
        originalCorrectOptionId: question.originalCorrectOptionId || question.correctOptionId || '',
        optionOrder: question.optionOrder || [],
        familyId: question.familyId || '',
        exposureRank: question.exposureRank || index + 1,
        categoryId: question.categoryId || '',
        topicId: question.topicId || '',
        competencyId: question.competencyId || '',
        difficulty: question.difficulty || 'medium',
        misconceptionTags: question.misconceptionTags || [],
      })),
      answers: {},
      flaggedItemIds: [],
      warningCount: 0,
      warningLogs: [],
      refreshCount: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await Promise.all(selectedQuestions.map((question, index) => setDoc(
      doc(db, 'questionExposures', `${user.uid}_${question.id}`),
      {
        userId: user.uid,
        questionId: question.id,
        familyId: question.familyId || '',
        categoryId: question.categoryId || '',
        topicId: question.topicId || '',
        competencyId: question.competencyId || '',
        difficulty: question.difficulty || 'medium',
        assessmentMode: mode,
        lastAttemptId: nextAttemptId,
        lastSeenAt: serverTimestamp(),
        lastOptionOrder: question.optionOrder || [],
        lastShownPosition: index + 1,
        timesSeen: increment(1),
        shownInAttemptIds: arrayUnion(nextAttemptId),
      },
      { merge: true },
    ))).catch((error) => console.warn('question exposure save failed', error));
  };

  const saveAnswer = (questionId: string, optionId: string) => {
    setAnswers((current) => ({ ...current, [questionId]: optionId }));
    if (attemptIdRef.current) {
      void updateDoc(doc(db, 'mockExamAttempts', attemptIdRef.current), {
        [`draftAnswers.${questionId}`]: optionId,
        answeredCount: Object.keys({ ...answersRef.current, [questionId]: optionId }).length,
        updatedAt: serverTimestamp(),
      }).catch((error) => console.warn('answer autosave failed', error));
    }
  };

  const toggleFlag = () => {
    if (!currentQuestion) return;
    setFlaggedIds((current) => {
      const next = current.includes(currentQuestion.id)
        ? current.filter((questionId) => questionId !== currentQuestion.id)
        : [...current, currentQuestion.id];
      if (attemptIdRef.current) {
        void updateDoc(doc(db, 'mockExamAttempts', attemptIdRef.current), {
          flaggedItemIds: next,
          updatedAt: serverTimestamp(),
        }).catch((error) => console.warn('flag autosave failed', error));
      }
      return next;
    });
  };

  const resumeAfterWarning = () => {
    setWarningModal(null);
    setPhase('in_progress');
    if (attemptIdRef.current) {
      void updateDoc(doc(db, 'mockExamAttempts', attemptIdRef.current), {
        status: 'in_progress',
        state: 'in_progress',
        updatedAt: serverTimestamp(),
      }).catch((error) => console.warn('resume update failed', error));
    }
  };

  const confirmManualSubmit = () => {
    const message = unansweredCount > 0
      ? `Submit now with ${unansweredCount} unanswered item${unansweredCount === 1 ? '' : 's'}? Blank answers will be marked incorrect.`
      : 'Submit this assessment now? You cannot change answers after submission.';
    if (window.confirm(message)) {
      void submitAttempt('submitted');
    }
  };

  const categoryRows = useMemo(() => Object.entries(result?.categoryBreakdown || {}), [result]);

  if (phase === 'loading') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-surface p-12 text-center">
        <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="font-bold text-on-surface-variant">Preparing LET simulation content...</p>
      </div>
    );
  }

  if (cooldown && cooldown.lockedUntilMillis > Date.now()) {
    const secondsLeft = Math.ceil((cooldown.lockedUntilMillis - Date.now()) / 1000);
    return (
      <div className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center p-8 text-center">
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-warning/15 text-on-surface">
          <span className="material-symbols-outlined text-4xl">timer_pause</span>
        </div>
        <p className="text-xs font-black uppercase tracking-widest text-primary">Full mock cooldown</p>
        <h2 className="mt-2 mb-3 font-headline text-2xl font-black text-on-surface">Review before another simulation</h2>
        <p className="mb-4 text-on-surface-variant">{cooldown.message}</p>
        <p className="mb-6 rounded-2xl bg-surface-container px-5 py-3 font-mono text-sm font-black text-on-surface">
          Available in {formatTime(secondsLeft)}
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <button onClick={() => navigate('/mistake-bank')} className="rounded-xl bg-surface-container px-5 py-3 text-sm font-bold text-on-surface">
            Review mistake bank
          </button>
          <button onClick={() => navigate('/student/courses')} className="rounded-xl bg-primary px-5 py-3 text-sm font-bold text-on-primary">
            Open reviewers
          </button>
        </div>
      </div>
    );
  }

  if (loadError || (phase !== 'instructions' && questions.length === 0) || (phase === 'instructions' && questionPool.length === 0)) {
    return (
      <div className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center p-8 text-center">
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-container text-on-surface-variant/40">
          <span className="material-symbols-outlined text-4xl">extension_off</span>
        </div>
        <h2 className="mb-3 font-headline text-2xl font-black text-on-surface">Exam cannot start yet</h2>
        <p className="mb-6 text-on-surface-variant">
          {loadError || 'There are no approved published questions for this assessment yet.'}
        </p>
        <button onClick={() => navigate('/student/dashboard')} className="rounded-xl bg-primary px-6 py-3 text-sm font-bold text-on-primary">
          Back to dashboard
        </button>
      </div>
    );
  }

  if (phase === 'instructions') {
    return (
      <div className="min-h-screen bg-surface px-5 py-8 text-on-surface">
        <div className="mx-auto max-w-4xl">
          <button onClick={() => navigate('/student/dashboard')} className="mb-6 text-sm font-bold text-on-surface-variant hover:text-on-surface">
            Back to dashboard
          </button>
          <section className="rounded-3xl border border-outline-variant/40 bg-surface-container-lowest p-6 shadow-sm md:p-8">
            <p className="text-xs font-black uppercase tracking-widest text-primary">{isFullMock ? 'Full LET Simulation' : 'Protected Practice'}</p>
            <h1 className="mt-2 font-headline text-3xl font-black tracking-tight text-on-surface">{blueprint.title || 'LET Assessment'}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-on-surface-variant">
              This attempt will create a real exam record. AI help, reviewer notes, rationalizations, and explanations are locked until you submit.
            </p>

            <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-4">
              {[
                ['Items', String(plannedQuestionCount)],
                ['Time limit', `${blueprint.timeLimitMinutes || (isFullMock ? DEFAULT_MOCK_MINUTES : DEFAULT_PRACTICE_MINUTES)} min`],
                ['Integrity', integrityLabel],
                ['Passing guide', `${blueprint.passingScore || (isFullMock ? 75 : 70)}%`],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-outline-variant/30 bg-surface-container p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/60">{label}</p>
                  <p className="mt-1 font-headline text-xl font-black text-on-surface">{value}</p>
                </div>
              ))}
            </div>

            <div className="mt-6 rounded-2xl border border-primary/20 bg-primary/5 p-5">
              <p className="font-bold text-on-surface">Assessment rules</p>
              <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-on-surface-variant md:grid-cols-2">
                <p>Timer continues during warnings, refreshes, offline periods, and idle periods.</p>
                <p>You may skip items and return using the navigator. Unanswered items submit as blank.</p>
                <p>Copy, paste, right-click, leaving the tab, and repeated refreshes are logged.</p>
                <p>Warning {integrityPolicy.warningLimit} automatically submits the assessment and flags the attempt for review.</p>
              </div>
            </div>

            <label className="mt-6 flex items-start gap-3 rounded-2xl border border-outline-variant/30 bg-surface-container p-4">
              <input
                type="checkbox"
                checked={agreementChecked}
                onChange={(event) => setAgreementChecked(event.target.checked)}
                className="mt-1 h-4 w-4 accent-primary"
              />
              <span className="text-sm font-medium text-on-surface-variant">
                I understand that this is a protected assessment. My answers, time, warnings, refreshes, flags, and submission result will be recorded.
              </span>
            </label>

            <button
              disabled={!agreementChecked}
              onClick={() => void startAttempt()}
              className="mt-6 w-full rounded-2xl bg-primary px-6 py-4 text-sm font-black uppercase tracking-widest text-on-primary shadow-lg shadow-primary/20 disabled:opacity-50"
            >
              Start assessment
            </button>
          </section>
        </div>
      </div>
    );
  }

  if (phase === 'submitted' && result) {
    const missedAnswers = result.answers.filter((answer) => !answer.isCorrect);
    const recoveryPlan = buildRecoveryPlan(result);
    return (
      <div className="min-h-screen bg-surface px-5 py-8 text-on-surface">
        <div className="mx-auto max-w-5xl space-y-6">
          <section className="rounded-3xl border border-outline-variant/40 bg-surface-container-lowest p-6 shadow-sm md:p-8">
            <p className="text-xs font-black uppercase tracking-widest text-primary">Post-exam review</p>
            <div className="mt-3 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <h1 className="font-headline text-4xl font-black text-on-surface">{result.scorePercent}%</h1>
                <p className="mt-2 text-on-surface-variant">
                  {result.correctCount} correct, {result.wrongCount} wrong, {result.unansweredCount} unanswered in {formatTime(result.timeUsedSeconds)}.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => navigate('/mistake-bank')} className="rounded-xl bg-surface-container px-4 py-3 text-sm font-bold text-on-surface">
                  Review mistake bank
                </button>
                <button onClick={() => navigate('/student/dashboard')} className="rounded-xl bg-primary px-4 py-3 text-sm font-bold text-on-primary">
                  Back to dashboard
                </button>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-primary/20 bg-primary/5 p-5">
            <p className="text-xs font-black uppercase tracking-widest text-primary">Recovery plan</p>
            <h2 className="mt-2 font-headline text-xl font-black text-on-surface">What to do before the next attempt</h2>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
              {recoveryPlan.tasks.map((task) => (
                <button
                  key={task.title}
                  onClick={() => navigate(task.targetLink)}
                  className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4 text-left transition-colors hover:border-primary/40"
                >
                  <span className={`text-[10px] font-black uppercase tracking-widest ${task.priority === 'high' ? 'text-error' : task.priority === 'medium' ? 'text-primary' : 'text-on-surface-variant/50'}`}>
                    {task.priority}
                  </span>
                  <h3 className="mt-2 font-bold text-on-surface">{task.title}</h3>
                  <p className="mt-2 text-xs leading-relaxed text-on-surface-variant">{task.body}</p>
                </button>
              ))}
            </div>
            {(recoveryPlan.weakTopics.length > 0 || recoveryPlan.weakCategories.length > 0) && (
              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="rounded-2xl bg-surface-container-lowest p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/50">Weak topics</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {recoveryPlan.weakTopics.slice(0, 6).map((topic) => (
                      <span key={topic.id} className="rounded-full bg-error/10 px-3 py-1 text-xs font-bold text-error">
                        {topic.id}: {topic.missed} missed
                      </span>
                    ))}
                  </div>
                </div>
                <div className="rounded-2xl bg-surface-container-lowest p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/50">Weak categories</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {recoveryPlan.weakCategories.slice(0, 6).map((category) => (
                      <span key={category.id} className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
                        {category.id}: {category.scorePercent}%
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </section>

          <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-5">
              <h2 className="font-headline text-lg font-black text-on-surface">Category breakdown</h2>
              <div className="mt-4 space-y-3">
                {categoryRows.map(([category, row]) => (
                  <div key={category}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="font-bold text-on-surface">{category}</span>
                      <span className="text-on-surface-variant">{row.correct}/{row.total} ({row.scorePercent}%)</span>
                    </div>
                    <div className="h-2 rounded-full bg-surface-container">
                      <div className="h-2 rounded-full bg-primary" style={{ width: `${row.scorePercent}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-5">
              <h2 className="font-headline text-lg font-black text-on-surface">Integrity log</h2>
              <div className="mt-4 space-y-2">
                {result.warningLogs.length === 0 ? (
                  <p className="text-sm text-on-surface-variant">No warnings were recorded for this attempt.</p>
                ) : result.warningLogs.map((log) => (
                  <div key={`${log.type}-${log.createdAtMillis}`} className="rounded-xl bg-surface-container p-3 text-sm">
                    <p className="font-bold text-on-surface">Warning {log.count}: {log.type.replace(/_/g, ' ')}</p>
                    <p className="mt-1 text-on-surface-variant">{log.message}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-5">
            <h2 className="font-headline text-lg font-black text-on-surface">Missed items and rationalizations</h2>
            <div className="mt-4 space-y-4">
              {missedAnswers.length === 0 ? (
                <p className="text-sm text-on-surface-variant">No missed items. Nice clean attempt.</p>
              ) : missedAnswers.map((answer) => (
                <article key={answer.questionId} className="rounded-2xl border border-outline-variant/30 bg-surface-container p-4">
                  <p className="text-xs font-black uppercase tracking-widest text-primary">Question {answer.questionNumber}</p>
                  <h3 className="mt-2 font-bold text-on-surface">{answer.stem}</h3>
                  <p className="mt-3 text-sm text-on-surface-variant">
                    Your answer: <span className="font-bold">{answer.selectedOptionId || 'Blank'}</span> · Correct answer: <span className="font-bold">{answer.correctOptionId}</span>
                  </p>
                  <p className="mt-3 rounded-xl bg-surface-container-lowest p-3 text-sm leading-relaxed text-on-surface-variant">
                    {answer.rationalization || answer.explanation || 'No rationalization has been approved for this item yet.'}
                  </p>
                </article>
              ))}
            </div>
          </section>
        </div>
      </div>
    );
  }

  const contentBlocked = phase === 'warning_blocked';

  return (
    <div className="relative flex min-h-[100dvh] flex-col bg-surface font-body text-on-surface antialiased">
      {!isOnline && (
        <div className="bg-warning/15 px-5 py-2 text-center text-xs font-bold text-on-surface">
          You are offline. Answers are cached locally and the timer is still running.
        </div>
      )}

      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-outline-variant bg-surface-container-lowest px-5 py-4">
        <div className="flex items-center gap-3">
          <button onClick={() => window.confirm('Exit this assessment? Your current attempt will remain active until submitted or expired.') && navigate('/student/dashboard')} className="text-on-surface-variant/50 transition-colors hover:text-on-surface">
            <span className="material-symbols-outlined">close</span>
          </button>
          <div className="flex items-center gap-2 rounded-xl border border-outline-variant/30 bg-surface-container px-3 py-1.5 font-mono text-xs font-bold text-on-surface-variant">
            <span className="h-2 w-2 rounded-full bg-error animate-pulse" />
            {formatTime(timeRemaining)}
          </div>
        </div>
        <div className="text-center">
          <p className="text-[10px] font-black uppercase tracking-widest text-primary">{integrityLabel}</p>
          <p className="text-xs font-bold text-on-surface-variant">Question {currentIndex + 1} / {questions.length}</p>
        </div>
        <button onClick={confirmManualSubmit} className="rounded-xl bg-primary px-4 py-2 text-xs font-black uppercase tracking-widest text-on-primary">
          Submit
        </button>
      </header>

      <div className={`mx-auto grid w-full max-w-6xl flex-1 gap-6 px-5 py-8 lg:grid-cols-[1fr_280px] ${contentBlocked ? 'pointer-events-none blur-sm' : ''}`}>
        <main className="rounded-3xl border border-outline-variant/30 bg-surface-container-lowest p-5 shadow-sm md:p-8">
          <div className="mb-6 flex flex-wrap items-center gap-2">
            <span className="rounded-lg border border-primary/10 bg-primary/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-primary">
              {currentQuestion?.categoryId || 'LET'}
            </span>
            <span className="rounded-lg bg-surface-container px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
              {currentQuestion?.difficulty || 'medium'}
            </span>
            {flaggedIds.includes(currentQuestion?.id || '') && (
              <span className="rounded-lg bg-warning/15 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-on-surface">
                Flagged
              </span>
            )}
          </div>

          <h1 className="mb-10 font-headline text-2xl font-extrabold leading-snug tracking-tight text-on-surface">
            {currentQuestion?.stem}
          </h1>

          <div className="space-y-4">
            {currentQuestion?.options.map((option) => {
              const isSelected = answers[currentQuestion.id] === option.id;
              return (
                <button
                  key={option.id}
                  onClick={() => saveAnswer(currentQuestion.id, option.id)}
                  className={`flex w-full items-start gap-4 rounded-2xl border-2 p-5 text-left transition-all ${
                    isSelected
                      ? 'border-primary bg-primary/10 shadow-sm'
                      : 'border-outline-variant/20 bg-surface-container/30 hover:border-primary/50'
                  }`}
                >
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-sm font-bold transition-colors ${
                    isSelected ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant/50'
                  }`}>
                    {option.id}
                  </div>
                  <span className={`pt-1 text-[15px] font-bold leading-snug ${isSelected ? 'text-primary' : 'text-on-surface-variant'}`}>
                    {option.text}
                  </span>
                </button>
              );
            })}
          </div>
        </main>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <section className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="font-headline text-xl font-black text-on-surface">{answeredCount}</p>
                <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/60">Answered</p>
              </div>
              <div>
                <p className="font-headline text-xl font-black text-on-surface">{unansweredCount}</p>
                <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/60">Blank</p>
              </div>
              <div>
                <p className="font-headline text-xl font-black text-on-surface">{flaggedIds.length}</p>
                <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/60">Flagged</p>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-headline text-sm font-black text-on-surface">Item navigator</h2>
              <span className="text-xs font-bold text-on-surface-variant">Warnings {warningCount}/{integrityPolicy.warningLimit}</span>
            </div>
            <div className="grid max-h-[380px] grid-cols-5 gap-2 overflow-y-auto pr-1">
              {questions.map((question, index) => {
                const isCurrent = index === currentIndex;
                const isAnswered = Boolean(answers[question.id]);
                const isFlagged = flaggedIds.includes(question.id);
                return (
                  <button
                    key={question.id}
                    onClick={() => setCurrentIndex(index)}
                    className={`h-10 rounded-xl text-xs font-black transition-colors ${
                      isCurrent
                        ? 'bg-primary text-on-primary'
                        : isFlagged
                          ? 'bg-warning/20 text-on-surface'
                          : isAnswered
                            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                            : 'bg-surface-container text-on-surface-variant'
                    }`}
                  >
                    {index + 1}
                  </button>
                );
              })}
            </div>
          </section>
        </aside>
      </div>

      <div className="sticky bottom-0 z-20 flex items-center justify-between border-t border-outline-variant bg-surface-container-lowest p-5">
        <button
          disabled={currentIndex === 0 || contentBlocked}
          onClick={() => setCurrentIndex((index) => Math.max(0, index - 1))}
          className="rounded-xl px-6 py-3 font-bold text-on-surface-variant transition-colors hover:bg-surface-container disabled:opacity-30"
        >
          Previous
        </button>
        <div className="flex items-center gap-2">
          <button
            disabled={contentBlocked}
            onClick={toggleFlag}
            className="rounded-xl border border-outline-variant/40 bg-surface-container px-4 py-3 text-sm font-bold text-on-surface"
          >
            {flaggedIds.includes(currentQuestion?.id || '') ? 'Unflag' : 'Flag'}
          </button>
          <button
            disabled={contentBlocked}
            onClick={() => setCurrentIndex((index) => Math.min(questions.length - 1, index + 1))}
            className="rounded-2xl bg-primary px-8 py-4 text-xs font-black uppercase tracking-widest text-on-primary shadow-lg shadow-primary/20"
          >
            Next
          </button>
        </div>
      </div>

      {warningModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/70 px-5">
          <div className="w-full max-w-md rounded-3xl border border-outline-variant/40 bg-surface-container-lowest p-6 shadow-2xl">
            <p className="text-xs font-black uppercase tracking-widest text-error">Warning {Math.min(warningModal.count, integrityPolicy.warningLimit)} of {integrityPolicy.warningLimit}</p>
            <h2 className="mt-2 font-headline text-2xl font-black text-on-surface">{warningModal.type.replace(/_/g, ' ')}</h2>
            <p className="mt-3 text-sm leading-relaxed text-on-surface-variant">{warningModal.message}</p>
            <p className="mt-3 text-sm font-bold text-on-surface">The timer is still running. On warning {integrityPolicy.warningLimit}, the attempt submits automatically and is flagged.</p>
            <button
              disabled={warningModal.count >= integrityPolicy.warningLimit || phase === 'auto_submitting'}
              onClick={resumeAfterWarning}
              className="mt-6 w-full rounded-2xl bg-primary px-5 py-4 text-sm font-black uppercase tracking-widest text-on-primary disabled:opacity-50"
            >
              {warningModal.count >= integrityPolicy.warningLimit ? 'Submitting attempt...' : 'I understand, resume'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
