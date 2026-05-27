import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  ArrowLeft,
  Bookmark,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileQuestion,
  Gamepad2,
  Download,
  Eye,
  EyeOff,
  Highlighter,
  Library,
  MessageCircle,
  RotateCcw,
  Save,
  ShieldAlert,
  Trophy,
  X,
} from 'lucide-react';
import { addDoc, collection, doc, getDoc, getDocs, increment, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import Toast from '../components/Toast';
import { useAuth } from '../context/AuthContext';
import {
  findJourneyModule,
  getModuleFinalExam,
  getModuleParts,
  JourneyModule,
  JourneyModulePart,
  JourneyQuestion,
  ModuleLearningState,
} from '../lib/learningJourney';
import { createNotification } from '../lib/notifications';
import { getIntegrityPolicy } from '../lib/assessmentIntegrity';

type QuestPhase = 'intro' | 'read' | 'lesson' | 'miniQuiz' | 'activity' | 'finalExam' | 'complete';

interface QuestProgress {
  currentPartIndex: number;
  phase: QuestPhase;
  partScores: Record<string, number>;
  finalScore?: number;
  firstFinalScore?: number;
  latestFinalScore?: number;
  finalAttemptCount?: number;
  timeSpentSeconds?: number;
  failedAttempts?: number;
  mustReread?: boolean;
  weakPartIds?: string[];
  proctorWarnings?: number;
  proctorWarningReasons?: string[];
  examLockedUntil?: number;
  examStartedAt?: number;
  moduleState?: ModuleLearningState;
  status: 'in_progress' | 'completed';
}

interface GradeResult {
  score: number;
  isCorrect: boolean;
  feedback: string;
}

interface LessonHighlight {
  id: string;
  text: string;
  note?: string;
  hidden?: boolean;
}

const optionTone = {
  idle: 'border-outline-variant/30 bg-surface-container/30 text-on-surface hover:border-primary/40',
  right: 'border-emerald-500 bg-emerald-500/10 text-emerald-700',
  wrong: 'border-error bg-error/10 text-error',
};

const defaultProgress: QuestProgress = {
  currentPartIndex: 0,
  phase: 'intro',
  partScores: {},
  weakPartIds: [],
  proctorWarningReasons: [],
  moduleState: 'available',
  status: 'in_progress',
};

const FINAL_PASSING_SCORE = 85;
const EXAM_LOCK_MINUTES = 5;

function normalizeFirestoreModule(id: string, data: any): JourneyModule {
  return {
    id,
    title: data.title || 'Learning Module',
    description: data.description || 'Instructor-created module',
    subjectId: data.subjectId || data.categoryId || 'gened',
    topicId: data.topicId || 'gened_english',
    level: data.level || 1,
    duration: data.duration || '30 min',
    status: 'available',
    progress: 0,
    lessonBlocks: data.lessonBlocks?.length
      ? data.lessonBlocks
      : [{ type: 'text', content: data.description || 'Read the lesson prepared by your instructor.' }],
    resources: data.resources || [],
    questions: [],
    parts: data.parts || undefined,
    finalExam: data.finalExam || undefined,
    publishScope: data.publishScope || 'public',
    classIds: data.classIds || [],
    dueAt: data.dueAt || '',
    antiCheatEnabled: data.antiCheatEnabled ?? true,
    recordFirstAttemptOnly: data.recordFirstAttemptOnly ?? true,
    attemptPolicy: data.attemptPolicy || undefined,
  };
}

function progressStorageKey(userId: string | undefined, moduleId: string) {
  return `let-mastery-progress:${userId || 'guest'}:${moduleId}`;
}

function progressFromFirestore(data: any): QuestProgress {
  return {
    currentPartIndex: data.currentPartIndex || 0,
    phase: data.phase || 'intro',
    partScores: data.partScores || {},
    finalScore: data.finalScore ?? undefined,
    firstFinalScore: data.firstFinalScore ?? undefined,
    latestFinalScore: data.latestFinalScore ?? undefined,
    finalAttemptCount: data.finalAttemptCount || 0,
    timeSpentSeconds: data.timeSpentSeconds || 0,
    failedAttempts: data.failedAttempts || 0,
    mustReread: !!data.mustReread,
    weakPartIds: data.weakPartIds || [],
    proctorWarnings: data.proctorWarnings || 0,
    proctorWarningReasons: data.proctorWarningReasons || [],
    examLockedUntil: data.examLockedUntil || undefined,
    examStartedAt: data.examStartedAt || undefined,
    moduleState: data.moduleState || undefined,
    status: data.status === 'completed' ? 'completed' : 'in_progress',
  };
}

export default function LearningQuest() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const moduleId = searchParams.get('moduleId');
  const demoMode = searchParams.get('demo') === '1' || searchParams.get('demo') === 'true';
  const { user } = useAuth();

  const [module, setModule] = useState<JourneyModule>(() => findJourneyModule(moduleId));
  const [progress, setProgress] = useState<QuestProgress>(defaultProgress);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [writtenAnswer, setWrittenAnswer] = useState('');
  const [lastQuestionResult, setLastQuestionResult] = useState<'correct' | 'wrong' | null>(null);
  const [lastFeedback, setLastFeedback] = useState('');
  const [lastGradeScore, setLastGradeScore] = useState<number | null>(null);
  const [finalAnswers, setFinalAnswers] = useState<Record<string, string>>({});
  const [finalGrades, setFinalGrades] = useState<Record<string, GradeResult>>({});
  const [finalQuestionSet, setFinalQuestionSet] = useState<JourneyQuestion[]>([]);
  const [isGrading, setIsGrading] = useState(false);
  const [appealComment, setAppealComment] = useState('');
  const [appealSent, setAppealSent] = useState(false);
  const [proctorMessage, setProctorMessage] = useState('');
  const [toastMsg, setToastMsg] = useState('');
  const [showToast, setShowToast] = useState(false);
  const [lessonNote, setLessonNote] = useState('');
  const [lessonHighlights, setLessonHighlights] = useState<LessonHighlight[]>([]);
  const [activeHighlightId, setActiveHighlightId] = useState('');
  const [revealedHighlightIds, setRevealedHighlightIds] = useState<string[]>([]);
  const [selectedText, setSelectedText] = useState('');
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [lowBandwidth, setLowBandwidth] = useState(() => localStorage.getItem('let-mastery-low-bandwidth') === '1');
  const [answerDraftSavedAt, setAnswerDraftSavedAt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [accessError, setAccessError] = useState('');
  const noteLoadedRef = useRef(false);
  const [sessionStartedAt] = useState(Date.now());
  const [nowTick, setNowTick] = useState(Date.now());

  const parts = useMemo(() => getModuleParts(module), [module]);
  const baseFinalExam = useMemo(() => getModuleFinalExam(module), [module]);
  const finalExam = finalQuestionSet.length > 0 ? finalQuestionSet : baseFinalExam;
  const currentPart = parts[Math.min(progress.currentPartIndex, Math.max(parts.length - 1, 0))];
  const currentMiniQuestion = currentPart?.miniQuiz?.[0];
  const finalAnsweredCount = finalExam.filter((question) => !!finalAnswers[question.id]?.trim()).length;
  const finalScorePercent = progress.finalScore ?? 0;
  const examLocked = !!progress.examLockedUntil && nowTick < progress.examLockedUntil;
  const examLockSecondsLeft = examLocked ? Math.max(0, Math.ceil(((progress.examLockedUntil || 0) - nowTick) / 1000)) : 0;
  const allPartsCompleted = parts.every((part) => progress.partScores[part.id] !== undefined);
  const antiCheatEnabled = (module as any).antiCheatEnabled !== false;
  const recordFirstAttemptOnly = (module as any).recordFirstAttemptOnly !== false;
  const attemptPolicy = {
    maxAttempts: 1,
    scoreMode: recordFirstAttemptOnly ? 'first' : 'latest',
    showAnswersAfterSubmit: false,
    answerRevealMode: 'never',
    timeLimitMinutes: 0,
    randomizeQuestions: false,
    randomizeChoices: false,
    questionPoolSize: 0,
    attemptLogs: true,
    integrityLevel: 'basic',
    ...((module as any).attemptPolicy || {}),
  };
  const integrityPolicy = useMemo(() => getIntegrityPolicy(attemptPolicy.integrityLevel), [attemptPolicy.integrityLevel]);
  const attemptsUsed = progress.finalAttemptCount || 0;
  const finalAttemptsLocked = progress.status !== 'completed' && attemptsUsed >= Math.max(1, attemptPolicy.maxAttempts);
  const moduleDueAt = (module as any).dueAt ? new Date((module as any).dueAt) : null;
  const modulePastDue = !!moduleDueAt && moduleDueAt.getTime() < Date.now() && progress.status !== 'completed';
  const examTimeLimitSeconds = Math.max(0, Number(attemptPolicy.timeLimitMinutes || 0) * 60);
  const examElapsedSeconds = progress.phase === 'finalExam' && progress.examStartedAt ? Math.max(0, Math.floor((nowTick - progress.examStartedAt) / 1000)) : 0;
  const examTimeSecondsLeft = examTimeLimitSeconds ? Math.max(0, examTimeLimitSeconds - examElapsedSeconds) : 0;
  const canRevealFinalAnswers = !!attemptPolicy.showAnswersAfterSubmit && (
    attemptPolicy.answerRevealMode === 'immediate' ||
    (attemptPolicy.answerRevealMode === 'after_deadline' && !!moduleDueAt && moduleDueAt.getTime() < Date.now())
  );
  const learningState = getLearningState(progress, parts.length);
  const weakReviewParts = parts.filter((part) => progress.weakPartIds?.includes(part.id));
  const hiddenHighlightCount = lessonHighlights.filter((highlight) => highlight.hidden).length;

  const progressDocId = user ? `${user.uid}_${module.id}` : '';
  const localProgressKey = progressStorageKey(user?.uid, module.id);
  const answerDraftKey = user ? `let-mastery-answer-drafts:${user.uid}:${module.id}` : '';

  useEffect(() => {
    const syncLowBandwidth = () => setLowBandwidth(localStorage.getItem('let-mastery-low-bandwidth') === '1');
    window.addEventListener('storage', syncLowBandwidth);
    window.addEventListener('let-mastery-low-bandwidth', syncLowBandwidth);
    return () => {
      window.removeEventListener('storage', syncLowBandwidth);
      window.removeEventListener('let-mastery-low-bandwidth', syncLowBandwidth);
    };
  }, []);

  useEffect(() => {
    async function loadLessonNote() {
      noteLoadedRef.current = false;
      if (!user || !currentPart) return;
      const noteSnap = await getDoc(doc(db, 'learningNotes', `${user.uid}_${module.id}_${currentPart.id}`));
      if (noteSnap.exists()) {
        const data = noteSnap.data() as any;
        setLessonNote(data.note || '');
        setIsBookmarked(!!data.bookmarked);
        setLessonHighlights(data.highlights || []);
      } else {
        setLessonNote('');
        setIsBookmarked(false);
        setLessonHighlights([]);
      }
      setActiveHighlightId('');
      setRevealedHighlightIds([]);
      setSelectedText('');
      noteLoadedRef.current = true;
    }
    loadLessonNote();
  }, [user?.uid, module.id, currentPart?.id]);

  const persistProgress = async (nextProgress: QuestProgress) => {
    const moduleState = getModuleState(nextProgress, parts.length);
    const normalizedProgress = { ...nextProgress, moduleState };
    setProgress(normalizedProgress);
    setSelectedAnswer(null);
    setWrittenAnswer('');
    setLastQuestionResult(null);
    setLastFeedback('');
    setLastGradeScore(null);

    try {
      localStorage.setItem(localProgressKey, JSON.stringify(normalizedProgress));
    } catch (error) {
      console.warn('Unable to save local module progress', error);
    }

    if (!user) return;

    try {
      await setDoc(
        doc(db, 'moduleProgress', progressDocId),
        {
          userId: user.uid,
          moduleId: module.id,
          status: normalizedProgress.status,
          moduleState,
          currentPartIndex: normalizedProgress.currentPartIndex,
          phase: normalizedProgress.phase,
          partScores: normalizedProgress.partScores,
          finalScore: normalizedProgress.finalScore ?? null,
          firstFinalScore: normalizedProgress.firstFinalScore ?? null,
          latestFinalScore: normalizedProgress.latestFinalScore ?? normalizedProgress.finalScore ?? null,
          finalAttemptCount: normalizedProgress.finalAttemptCount || 0,
          timeSpentSeconds: normalizedProgress.timeSpentSeconds || 0,
          failedAttempts: normalizedProgress.failedAttempts || 0,
          mustReread: !!normalizedProgress.mustReread,
          weakPartIds: normalizedProgress.weakPartIds || [],
          proctorWarnings: normalizedProgress.proctorWarnings || 0,
          proctorWarningReasons: normalizedProgress.proctorWarningReasons || [],
          examLockedUntil: normalizedProgress.examLockedUntil || null,
          examStartedAt: normalizedProgress.examStartedAt || null,
          progressPercent: computeProgressPercent(normalizedProgress, parts.length),
          lastAccessedAt: serverTimestamp(),
          completedAt: normalizedProgress.status === 'completed' ? serverTimestamp() : null,
        },
        { merge: true },
      );
    } catch (error) {
      console.warn('Cloud progress could not be saved; local resume is still available', error);
    }
  };

  useEffect(() => {
    async function loadModuleAndProgress() {
      setLoading(true);
      setAccessError('');
      try {
        if (!user) {
          throw new Error('Sign in again to open this reviewer.');
        }

        if (!moduleId) {
          throw new Error('No reviewer module was selected.');
        }

        let activeModule: JourneyModule | null = null;
        let restoredProgress: QuestProgress | null = null;
        let loadedFromFirestore = false;
        const moduleSnap = await getDoc(doc(db, 'modules', moduleId));

        if (!moduleSnap.exists()) {
          if (!demoMode) {
            throw new Error('This reviewer does not exist in the database or has not been published.');
          }
          activeModule = findJourneyModule(moduleId);
        } else {
          loadedFromFirestore = true;
          const data = moduleSnap.data() as any;
          const publishScope = data.publishScope || (data.classIds?.length ? 'classes' : 'public');
          const instructorPreview = user.role === 'admin' || user.role === 'instructor';
          const progressSnap = await getDoc(doc(db, 'moduleProgress', `${user.uid}_${moduleSnap.id}`));
          const hasProgress = progressSnap.exists();

          let classAssigned = false;
          if (user.activeClassId) {
            const classSnap = await getDoc(doc(db, 'classes', user.activeClassId));
            const classData = classSnap.exists() ? classSnap.data() as any : null;
            classAssigned = (
              (data.classIds || []).includes(user.activeClassId) ||
              (classData?.assignedModuleIds || []).includes(moduleSnap.id)
            );
          }

          if (data.isPublished !== true && !instructorPreview) {
            throw new Error('This reviewer is still a draft and is not available to students.');
          }

          if (!instructorPreview) {
            if (publishScope === 'classes' && !classAssigned) {
              throw new Error('This reviewer belongs to a class you are not enrolled in.');
            }
            if ((publishScope === 'public' || !publishScope) && !hasProgress && !classAssigned) {
              throw new Error('Start this public reviewer from LET Reviewers first so a real progress record can be created.');
            }
          }

          activeModule = normalizeFirestoreModule(moduleSnap.id, data);

          const questionIds = [
            ...(data.checkQuestionIds || []),
            ...(data.challengeQuestionIds || []),
            ...(data.questionIds || []),
          ].filter(Boolean);

          if (questionIds.length > 0) {
            const loadedQuestions: JourneyQuestion[] = [];
            for (const questionId of questionIds.slice(0, 8)) {
              const questionSnap = await getDoc(doc(db, 'questions', questionId));
              if (questionSnap.exists()) {
                const question = questionSnap.data() as any;
                loadedQuestions.push({
                  id: questionSnap.id,
                  stem: question.stem,
                  options: question.options || [],
                  correctOptionId: question.correctOptionId,
                  explanation: question.explanation || '',
                });
              }
            }
            if (loadedQuestions.length > 0) {
              activeModule = { ...activeModule, questions: loadedQuestions };
            }
          }

          if (progressSnap.exists()) {
            restoredProgress = progressFromFirestore(progressSnap.data());
          }
        }

        if (!activeModule) {
          throw new Error('This reviewer could not be loaded.');
        }

        setModule(activeModule);

        if (!restoredProgress && !loadedFromFirestore) {
          try {
            const saved = localStorage.getItem(progressStorageKey(user?.uid, activeModule.id));
            restoredProgress = saved ? JSON.parse(saved) : null;
          } catch {
            restoredProgress = null;
          }
        }

        setProgress(restoredProgress || defaultProgress);
        setFinalQuestionSet(getModuleFinalExam(activeModule));
      } catch (error) {
        console.error('Failed to load reviewer module', error);
        if (demoMode) {
          const fallbackModule = findJourneyModule(moduleId);
          setModule(fallbackModule);
          try {
            const saved = localStorage.getItem(progressStorageKey(user?.uid, fallbackModule.id));
            setProgress(saved ? JSON.parse(saved) : defaultProgress);
          } catch {
            setProgress(defaultProgress);
          }
          setFinalQuestionSet(getModuleFinalExam(fallbackModule));
        } else {
          setAccessError(error instanceof Error ? error.message : 'This reviewer cannot be opened right now.');
          setProgress(defaultProgress);
          setFinalQuestionSet([]);
        }
      } finally {
        setLoading(false);
      }
    }

    loadModuleAndProgress();
  }, [moduleId, user, demoMode]);

  useEffect(() => {
    if (!answerDraftKey) return;
    try {
      const saved = localStorage.getItem(answerDraftKey);
      if (!saved) return;
      const parsed = JSON.parse(saved);
      setWrittenAnswer(parsed.writtenAnswer || '');
      setFinalAnswers(parsed.finalAnswers || {});
      setAnswerDraftSavedAt(parsed.savedAt || 0);
    } catch {
      setAnswerDraftSavedAt(0);
    }
  }, [answerDraftKey]);

  useEffect(() => {
    if (!answerDraftKey || !['miniQuiz', 'finalExam'].includes(progress.phase)) return;
    const hasDraft = writtenAnswer.trim() || Object.values(finalAnswers).some((answer) => String(answer || '').trim());
    const savedAt = Date.now();
    try {
      localStorage.setItem(answerDraftKey, JSON.stringify({ writtenAnswer, finalAnswers, savedAt }));
      if (hasDraft) setAnswerDraftSavedAt(savedAt);
    } catch (error) {
      console.warn('Unable to autosave answer draft', error);
    }
  }, [writtenAnswer, finalAnswers, answerDraftKey, progress.phase]);

  const moveToPhase = async (phase: QuestPhase) => {
    if (phase === 'finalExam') {
      if (finalAttemptsLocked) {
        setProctorMessage(`Final exam attempts are used up. Your instructor allowed ${attemptPolicy.maxAttempts} attempt${attemptPolicy.maxAttempts === 1 ? '' : 's'}.`);
        return;
      }
      if (!allPartsCompleted && progress.status !== 'completed') {
        setProctorMessage('Finish every textbook part and mini check before opening the final exam.');
        return;
      }
      if (examLocked) {
        setProctorMessage(`Final exam is locked for ${formatDuration(examLockSecondsLeft)} after repeated warnings.`);
        return;
      }
      if (antiCheatEnabled && integrityPolicy.requiresFullscreen) await requestExamFullscreen();
      await prepareFinalExam(!!progress.mustReread || (progress.failedAttempts || 0) > 0);
    }
    persistProgress({
      ...progress,
      phase,
      status: phase === 'complete' ? 'completed' : 'in_progress',
      examStartedAt: phase === 'finalExam' ? (progress.examStartedAt || Date.now()) : undefined,
    });
  };

  const gradeQuestion = async (question: JourneyQuestion, answer: string, strict = false): Promise<GradeResult> => {
    if (isChoiceQuestion(question)) {
      const correct = answer === question.correctOptionId;
      return {
        score: correct ? 100 : 0,
        isCorrect: correct,
        feedback: question.explanation,
      };
    }

    const expectedAnswer = question.expectedAnswer || question.acceptedAnswers?.[0] || question.explanation;
    try {
      const response = await fetch('/api/grade-answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          studentAnswer: answer,
          expectedAnswer,
          acceptedAnswers: question.acceptedAnswers || [],
          textbookContext: parts.map((part) => `${part.textbookSection.title}\n${part.textbookSection.body}`).join('\n\n'),
          strict,
        }),
      });
      const data = await response.json();
      return {
        score: Math.max(0, Math.min(100, Number(data.score || 0))),
        isCorrect: !!data.isCorrect || Number(data.score || 0) >= 70,
        feedback: data.feedback || 'Answer checked.',
      };
    } catch {
      const normalized = answer.trim().toLowerCase();
      const accepted = (question.acceptedAnswers || [expectedAnswer]).map((item) => item.toLowerCase());
      const correct = accepted.some((item) => normalized.includes(item) || item.includes(normalized));
      return { score: correct ? 80 : 0, isCorrect: correct, feedback: correct ? 'Accepted.' : 'Review the textbook section and try again.' };
    }
  };

  const requestExamFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      }
    } catch (error) {
      console.warn('Fullscreen request was blocked by the browser', error);
      setProctorMessage('Fullscreen could not start automatically. Keep this exam tab active.');
    }
  };

  const registerProctorWarning = async (reason: string) => {
    const nextCount = (progress.proctorWarnings || 0) + 1;
    const nextReasons = [...(progress.proctorWarningReasons || []), reason];
    if (nextCount >= integrityPolicy.warningLimit && integrityPolicy.autoSubmitOnWarningLimit) {
      const lockedUntil = Date.now() + EXAM_LOCK_MINUTES * 60 * 1000;
      setProctorMessage(`Exam paused after ${integrityPolicy.warningLimit} warnings. You can retry in ${EXAM_LOCK_MINUTES} minutes.`);
      setFinalAnswers({});
      setFinalGrades({});
      await persistProgress({
        ...progress,
        phase: 'read',
        currentPartIndex: 0,
        status: 'in_progress',
        mustReread: true,
        proctorWarnings: nextCount,
        proctorWarningReasons: nextReasons,
        examLockedUntil: lockedUntil,
        examStartedAt: undefined,
      });
      return;
    }

    setProctorMessage(`${reason} Warning ${nextCount}/${integrityPolicy.warningLimit}. ${integrityPolicy.label} is active for this exam.`);
    await persistProgress({ ...progress, proctorWarnings: nextCount, proctorWarningReasons: nextReasons });
  };

  const submitGradeAppeal = async (scope: 'mini_quiz' | 'final_exam') => {
    if (!user || !appealComment.trim()) return;
    try {
      await addDoc(collection(db, 'submissions'), {
        type: 'grade_review',
        status: 'pending',
        userId: user.uid,
        studentEmail: user.email,
        moduleId: module.id,
        moduleTitle: module.title,
        partId: currentPart?.id || null,
        scope,
        comment: appealComment.trim(),
        finalScore: progress.finalScore ?? null,
        lastFeedback: lastFeedback || null,
        createdAt: serverTimestamp(),
      });
      await createNotification({
        title: `Grade review requested: ${module.title}`,
        body: `${user.fullName || user.email} asked for an instructor review on ${scope === 'final_exam' ? 'the final exam' : 'a mini quiz'}.`,
        type: 'grade_appeal',
        targetLink: '/instructor/grades',
        roleRecipients: ['instructor', 'admin'],
        createdBy: user.uid,
        createdByEmail: user.email,
      });
      setAppealComment('');
      setAppealSent(true);
      setToastMsg('Instructor review request sent.');
      setShowToast(true);
    } catch (error) {
      console.warn('Unable to submit grade review request', error);
      setProctorMessage('Could not send the review request. Please try again.');
      setToastMsg('Unable to send review request.');
      setShowToast(true);
    }
  };

  const saveLessonNote = async () => {
    if (!user || !currentPart) return;
    await setDoc(doc(db, 'learningNotes', `${user.uid}_${module.id}_${currentPart.id}`), {
      userId: user.uid,
      moduleId: module.id,
      moduleTitle: module.title,
      partId: currentPart.id,
      partTitle: currentPart.title,
      note: lessonNote,
      bookmarked: isBookmarked,
      highlights: lessonHighlights,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    setProctorMessage('Lesson note saved.');
    setToastMsg('Lesson note saved.');
    setShowToast(true);
  };

  useEffect(() => {
    if (!user || !currentPart || !noteLoadedRef.current) return;
    const timer = window.setTimeout(() => {
      void setDoc(doc(db, 'learningNotes', `${user.uid}_${module.id}_${currentPart.id}`), {
        userId: user.uid,
        moduleId: module.id,
        moduleTitle: module.title,
        partId: currentPart.id,
        partTitle: currentPart.title,
        note: lessonNote,
        bookmarked: isBookmarked,
        highlights: lessonHighlights,
        updatedAt: serverTimestamp(),
      }, { merge: true }).catch((error) => console.warn('Lesson note autosave failed', error));
    }, 900);
    return () => window.clearTimeout(timer);
  }, [currentPart?.id, currentPart?.title, isBookmarked, lessonHighlights, lessonNote, module.id, module.title, user]);

  const captureSelectedText = () => {
    const text = window.getSelection()?.toString().trim() || '';
    if (text.length >= 2) setSelectedText(text.slice(0, 240));
  };

  const addHighlight = (hidden = false) => {
    if (!selectedText) return;
    const existing = lessonHighlights.find((item) => item.text === selectedText);
    if (existing) {
      setActiveHighlightId(existing.id);
      setSelectedText('');
      window.getSelection()?.removeAllRanges();
      return;
    }
    const id = `hl-${Date.now()}`;
    setLessonHighlights((items) => [...items, { id, text: selectedText, hidden }]);
    setActiveHighlightId(id);
    setSelectedText('');
    window.getSelection()?.removeAllRanges();
  };

  const updateHighlight = (id: string, patch: Partial<LessonHighlight>) => {
    setLessonHighlights((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item));
    if (patch.hidden === false) {
      setRevealedHighlightIds((ids) => ids.filter((itemId) => itemId !== id));
    }
  };

  const removeHighlight = (id: string) => {
    setLessonHighlights((items) => items.filter((item) => item.id !== id));
    setRevealedHighlightIds((ids) => ids.filter((itemId) => itemId !== id));
    setActiveHighlightId('');
  };

  const toggleRevealHighlight = (id: string) => {
    setRevealedHighlightIds((ids) => (
      ids.includes(id) ? ids.filter((itemId) => itemId !== id) : [...ids, id]
    ));
  };

  const revealAllHiddenHighlights = () => {
    setRevealedHighlightIds(lessonHighlights.filter((item) => item.hidden).map((item) => item.id));
  };

  const hideRevealedHighlights = () => {
    setRevealedHighlightIds([]);
  };

  const clearLessonHighlights = () => {
    if (!lessonHighlights.length || !window.confirm('Remove all highlights and hidden recall marks in this lesson?')) return;
    setLessonHighlights([]);
    setRevealedHighlightIds([]);
    setActiveHighlightId('');
  };

  const recordMistake = async (question: JourneyQuestion, answer: string, sourceType: string, sourceAttemptId = '') => {
    if (!user || !question) return;
    const options = normalizeOptions(question);
    const selectedOption = options.find((option) => option.id === answer);
    const correctOption = options.find((option) => option.id === question.correctOptionId);
    try {
      await setDoc(doc(db, 'mistakeBank', `${user.uid}_${question.id}`), {
        userId: user.uid,
        questionId: question.id,
        stem: question.stem,
        options,
        selectedOptionId: answer,
        selectedOptionText: selectedOption?.text || answer,
        correctOptionId: question.correctOptionId || '',
        correctOptionText: correctOption?.text || question.expectedAnswer || '',
        explanation: question.explanation || '',
        rationalization: question.explanation || '',
        wrongChoiceExplanations: (question as any).wrongChoiceExplanations || {},
        categoryId: module.subjectId || '',
        topicId: question.topicId || module.topicId || '',
        competencyId: question.competencyId || '',
        difficulty: question.difficulty || 'medium',
        relatedModuleId: module.id,
        relatedModuleTitle: module.title,
        examType: sourceType,
        sourceAttemptId,
        timesMissed: increment(1),
        firstMissedAt: serverTimestamp(),
        lastMissedAt: serverTimestamp(),
      }, { merge: true });
    } catch (error) {
      console.warn('Unable to record mistake bank item', error);
    }
  };

  const downloadStudyGuide = async () => {
    if (!user) return;
    const notesSnap = await getDocs(query(collection(db, 'learningNotes'), where('userId', '==', user.uid), where('moduleId', '==', module.id)));
    const notes = notesSnap.docs.map((noteDoc) => noteDoc.data() as any);
    const guide = [
      `Study Guide: ${module.title}`,
      '',
      module.description,
      '',
      'Learning Objectives',
      ...parts.map((part, index) => `${index + 1}. ${part.objective}`),
      '',
      'Key Textbook Sections',
      ...parts.map((part, index) => `${index + 1}. ${part.textbookSection.title}\n${part.textbookSection.body}`),
      '',
      'My Notes',
      ...notes.flatMap((note) => [
        `- ${note.partTitle || 'Lesson'}: ${note.note || ''}`,
        ...(note.highlights || []).map((highlight: LessonHighlight) => `  Highlight: ${highlight.text}${highlight.note ? ` / Note: ${highlight.note}` : ''}`),
      ]),
      '',
      'Review Questions',
      ...finalExam.map((question, index) => `${index + 1}. ${question.stem}`),
    ].join('\n');
    const blob = new Blob([guide], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${module.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-study-guide.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const completeMiniQuiz = async () => {
    const answer = isChoiceQuestion(currentMiniQuestion) ? selectedAnswer || '' : writtenAnswer;
    const grade = lastGradeScore != null
      ? { score: lastGradeScore, isCorrect: lastGradeScore >= 70, feedback: lastFeedback }
      : currentMiniQuestion
        ? await gradeQuestion(currentMiniQuestion, answer)
        : { score: 100, isCorrect: true, feedback: '' };
    const nextScores = {
      ...progress.partScores,
      [currentPart.id]: grade.score,
    };

    if (currentMiniQuestion && !grade.isCorrect) {
      await recordMistake(currentMiniQuestion, answer, 'module_mini_quiz');
    }

    if (currentPart.activity) {
      persistProgress({ ...progress, phase: 'activity', partScores: nextScores });
      return;
    }

    goToNextPart(nextScores);
  };

  const goToNextPart = async (partScores = progress.partScores) => {
    const nextIndex = progress.currentPartIndex + 1;
    if (nextIndex >= parts.length) {
      await prepareFinalExam(!!progress.mustReread || (progress.failedAttempts || 0) > 0);
      persistProgress({ ...progress, currentPartIndex: progress.currentPartIndex, phase: 'finalExam', partScores, examStartedAt: Date.now() });
      return;
    }

    persistProgress({ ...progress, currentPartIndex: nextIndex, phase: 'read', partScores });
  };

  const unlockNextModules = async () => {
    if (!user) return;
    try {
      const modulesSnap = await getDocs(query(collection(db, 'modules'), where('isPublished', '==', true)));
      const availableModules = modulesSnap.docs.map((moduleDoc) => normalizeFirestoreModule(moduleDoc.id, moduleDoc.data()))
        .filter((item: any) => {
          if (!item.publishScope || item.publishScope === 'public') return true;
          return !!user.activeClassId && (item.classIds || []).includes(user.activeClassId);
        })
        .sort((a, b) => (a.subjectId.localeCompare(b.subjectId)) || (a.topicId.localeCompare(b.topicId)) || (a.level - b.level) || a.title.localeCompare(b.title));

      const dependentModules = availableModules.filter((item: any) => item.prerequisiteModuleIds?.includes(module.id));
      const sameTrack = availableModules.filter((item) => item.subjectId === module.subjectId && item.topicId === module.topicId);
      const currentIndex = sameTrack.findIndex((item) => item.id === module.id);
      const nextByOrder = currentIndex >= 0 ? sameTrack[currentIndex + 1] : null;
      const targets = [...new Map([...dependentModules, nextByOrder].filter(Boolean).map((item: any) => [item.id, item])).values()].slice(0, 2);

      for (const nextModule of targets) {
        const progressRef = doc(db, 'moduleProgress', `${user.uid}_${nextModule.id}`);
        const existing = await getDoc(progressRef);
        const existingData = existing.exists() ? existing.data() : null;
        if (existingData?.status === 'completed' || ['in_progress', 'ready_for_final_exam', 'review_required', 'mastered'].includes(existingData?.moduleState)) continue;
        await setDoc(progressRef, {
          userId: user.uid,
          moduleId: nextModule.id,
          status: 'in_progress',
          moduleState: 'available',
          currentPartIndex: 0,
          phase: 'intro',
          partScores: {},
          progressPercent: 0,
          unlockedByModuleId: module.id,
          unlockedAt: serverTimestamp(),
          lastAccessedAt: serverTimestamp(),
        }, { merge: true });
      }

      if (targets.length) {
        await createNotification({
          title: `Next module unlocked: ${targets[0].title}`,
          body: `You passed ${module.title}. Continue with the next module in your journey.`,
          type: 'module_unlocked',
          targetLink: `/quest?moduleId=${targets[0].id}`,
          recipientIds: [user.uid],
          createdBy: 'system',
        });
        try {
          const profileRef = doc(db, 'learnerProfiles', user.uid);
          await updateDoc(profileRef, {
            nextRecommendedModuleId: targets[0].id,
            lastUnlockedModuleId: targets[0].id,
            lastUpdatedAt: serverTimestamp(),
          });
        } catch (profileError) {
          console.warn('Unable to set next recommended module', profileError);
        }
      }
    } catch (error) {
      console.warn('Unable to unlock next module', error);
    }
  };

  const submitFinalExam = async () => {
    setIsGrading(true);
    const grades: Record<string, GradeResult> = {};
    for (const question of finalExam) {
      const answer = finalAnswers[question.id] || '';
      grades[question.id] = await gradeQuestion(question, answer, true);
    }
    setFinalGrades(grades);
    const score = Math.round(Object.values(grades).reduce((sum, grade) => sum + grade.score, 0) / Math.max(finalExam.length, 1));
    const weakPartIds = getWeakPartIds(finalExam, grades, parts);
    const officialFirstScore = progress.firstFinalScore ?? score;
    const previousOfficialScore = progress.finalScore ?? officialFirstScore;
    const officialScore = attemptPolicy.scoreMode === 'highest'
      ? Math.max(previousOfficialScore, score)
      : attemptPolicy.scoreMode === 'latest'
        ? score
        : officialFirstScore;
    const status = score >= FINAL_PASSING_SCORE ? 'completed' : 'in_progress';
    const phase: QuestPhase = score >= FINAL_PASSING_SCORE ? 'complete' : 'read';
    const attemptNumber = (progress.finalAttemptCount || 0) + 1;
    const attemptTimeSeconds = progress.examStartedAt ? Math.max(0, Math.round((Date.now() - progress.examStartedAt) / 1000)) : Math.round((Date.now() - sessionStartedAt) / 1000);

    let attemptLogId = '';
    if (user && attemptPolicy.attemptLogs !== false) {
      try {
        const attemptRef = await addDoc(collection(db, 'examAttemptLogs'), {
          userId: user.uid,
          studentEmail: user.email,
          studentName: user.fullName || user.email,
          moduleId: module.id,
          moduleTitle: module.title,
          topicId: module.topicId,
          attemptNumber,
          rawScore: score,
          officialScore,
          passed: score >= FINAL_PASSING_SCORE,
          questionCount: finalExam.length,
          answeredCount: finalAnsweredCount,
          weakPartIds,
          proctorWarnings: progress.proctorWarnings || 0,
          proctorWarningReasons: progress.proctorWarningReasons || [],
          timeSpentSeconds: attemptTimeSeconds,
          startedAtMillis: progress.examStartedAt || sessionStartedAt,
          policySnapshot: attemptPolicy,
          questionIds: finalExam.map((question) => question.id),
          createdAt: serverTimestamp(),
        });
        attemptLogId = attemptRef.id;
      } catch (error) {
        console.warn('Unable to write exam attempt log', error);
      }
    }

    await Promise.all(finalExam.map((question) => {
      const answer = finalAnswers[question.id] || '';
      const grade = grades[question.id];
      if ((grade?.score || 0) >= 70) return Promise.resolve();
      return recordMistake(question, answer, 'module_final_exam', attemptLogId);
    }));

    await persistProgress({
      ...progress,
      phase,
      currentPartIndex: score >= FINAL_PASSING_SCORE ? progress.currentPartIndex : 0,
      finalScore: officialScore,
      firstFinalScore: officialFirstScore,
      latestFinalScore: score,
      finalAttemptCount: attemptNumber,
      timeSpentSeconds: (progress.timeSpentSeconds || 0) + Math.round((Date.now() - sessionStartedAt) / 1000),
      status,
      mustReread: score < FINAL_PASSING_SCORE,
      weakPartIds: score < FINAL_PASSING_SCORE ? weakPartIds : [],
      failedAttempts: score >= FINAL_PASSING_SCORE ? progress.failedAttempts || 0 : (progress.failedAttempts || 0) + 1,
      proctorWarnings: 0,
      proctorWarningReasons: [],
      examLockedUntil: undefined,
      examStartedAt: undefined,
    });
    if (answerDraftKey) {
      localStorage.removeItem(answerDraftKey);
      setAnswerDraftSavedAt(0);
    }
    setIsGrading(false);
    if (score < FINAL_PASSING_SCORE) {
      setFinalAnswers({});
      setFinalGrades({});
      setToastMsg('Final exam submitted. Guided review opened.');
      setShowToast(true);
    } else {
      setToastMsg('Final exam submitted and module completed.');
      setShowToast(true);
    }

    if (score >= FINAL_PASSING_SCORE && user) {
      try {
        const profileRef = doc(db, 'learnerProfiles', user.uid);
        const profileSnap = await getDoc(profileRef);
        if (profileSnap.exists()) {
          const profile = profileSnap.data();
          const currentMastery = profile.masteryByTopic?.[module.topicId] || 0;
          await updateDoc(profileRef, {
            [`masteryByTopic.${module.topicId}`]: Math.min(100, currentMastery + 12),
            [`masteryFreshnessByTopic.${module.topicId}.lastReviewedAt`]: serverTimestamp(),
            [`masteryFreshnessByTopic.${module.topicId}.lastMasteredAt`]: serverTimestamp(),
            [`masteryFreshnessByTopic.${module.topicId}.decayedMastery`]: Math.min(100, currentMastery + 12),
            [`masteryFreshnessByTopic.${module.topicId}.recallDueAt`]: new Date(Date.now() + 14 * 86_400_000).toISOString(),
            nextRecommendedModuleId: null,
            lastUpdatedAt: serverTimestamp(),
          });
        }
      } catch (error) {
        console.warn('Unable to update learner profile mastery', error);
      }
      await unlockNextModules();
    }
  };

  const resetFinalExam = () => {
    setFinalAnswers({});
    setFinalGrades({});
    if (answerDraftKey) localStorage.removeItem(answerDraftKey);
    persistProgress({ ...progress, finalScore: undefined, phase: 'read', currentPartIndex: 0, status: 'in_progress', mustReread: true, proctorWarnings: 0, proctorWarningReasons: [], examLockedUntil: undefined, examStartedAt: undefined });
  };

  const jumpToPart = (index: number) => {
    persistProgress({
      ...progress,
      currentPartIndex: index,
      phase: 'read',
      status: progress.status === 'completed' ? 'completed' : 'in_progress',
    });
  };

  const answerMiniQuiz = (optionId: string) => {
    setSelectedAnswer(optionId);
    setLastQuestionResult(optionId === currentMiniQuestion?.correctOptionId ? 'correct' : 'wrong');
  };

  const checkWrittenMiniQuiz = async () => {
    if (!currentMiniQuestion || !writtenAnswer.trim()) return;
    setIsGrading(true);
    const grade = await gradeQuestion(currentMiniQuestion, writtenAnswer);
    setLastGradeScore(grade.score);
    setLastQuestionResult(grade.isCorrect ? 'correct' : 'wrong');
    setLastFeedback(grade.feedback);
    setIsGrading(false);
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping = target?.tagName === 'TEXTAREA' || target?.tagName === 'INPUT';
      const key = event.key.toUpperCase();

      if (progress.phase === 'miniQuiz' && currentMiniQuestion && !isTyping) {
        if (isChoiceQuestion(currentMiniQuestion) && ['A', 'B', 'C', 'D', 'T', 'F'].includes(key)) {
          const optionId = key === 'T' ? 'A' : key === 'F' ? 'B' : key;
          const hasOption = normalizeOptions(currentMiniQuestion).some((option) => option.id === optionId);
          if (hasOption && !selectedAnswer) answerMiniQuiz(optionId);
        }
        if (event.key === 'Enter' && (selectedAnswer || (!isChoiceQuestion(currentMiniQuestion) && writtenAnswer.trim()))) {
          event.preventDefault();
          if (!isChoiceQuestion(currentMiniQuestion) && !lastFeedback) {
            checkWrittenMiniQuiz();
          } else {
            completeMiniQuiz();
          }
        }
      }

      if (progress.phase === 'finalExam' && !isTyping) {
        if (event.key.length === 1 && !['A', 'B', 'C', 'D', 'T', 'F'].includes(key)) {
          event.preventDefault();
          setProctorMessage('Written answers must be typed inside the answer box.');
        }
        if (['A', 'B', 'C', 'D', 'T', 'F'].includes(key)) {
          const nextQuestion = finalExam.find((question) => isChoiceQuestion(question) && !finalAnswers[question.id]);
          if (nextQuestion) {
            const optionId = key === 'T' ? 'A' : key === 'F' ? 'B' : key;
            if (normalizeOptions(nextQuestion).some((option) => option.id === optionId)) {
              setFinalAnswers((answers) => ({ ...answers, [nextQuestion.id]: optionId }));
            }
          }
        }
        if (event.key === 'Enter' && finalExam.every((question) => !!finalAnswers[question.id]?.trim())) {
          event.preventDefault();
          submitFinalExam();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [progress.phase, currentMiniQuestion, selectedAnswer, writtenAnswer, finalAnswers, finalExam, lastFeedback, examLockSecondsLeft, antiCheatEnabled]);

  useEffect(() => {
    if (progress.phase !== 'finalExam' || !antiCheatEnabled) return;

    const warn = (reason: string) => {
      registerProctorWarning(reason);
    };
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) warn('Fullscreen was exited.');
    };
    const handleVisibilityChange = () => {
      if (document.hidden) warn('The exam tab lost focus.');
    };
    const handleBlur = () => warn('The exam window lost focus.');
    const blockClipboard = (event: Event) => {
      event.preventDefault();
      warn('Copy and paste are disabled during written exams.');
    };
    const blockContextMenu = (event: Event) => {
      event.preventDefault();
      warn('Right-click menu is disabled during the exam.');
    };

    if (integrityPolicy.requiresFullscreen) document.addEventListener('fullscreenchange', handleFullscreenChange);
    if (integrityPolicy.blocksTabSwitch) {
      document.addEventListener('visibilitychange', handleVisibilityChange);
      window.addEventListener('blur', handleBlur);
    }
    if (integrityPolicy.blocksClipboard) {
      document.addEventListener('copy', blockClipboard);
      document.addEventListener('paste', blockClipboard);
    }
    if (integrityPolicy.blocksContextMenu) document.addEventListener('contextmenu', blockContextMenu);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('copy', blockClipboard);
      document.removeEventListener('paste', blockClipboard);
      document.removeEventListener('contextmenu', blockContextMenu);
    };
  }, [progress.phase, progress.proctorWarnings, finalAnswers, antiCheatEnabled, integrityPolicy]);

  useEffect(() => {
    if (!examLocked && !(progress.phase === 'finalExam' && examTimeLimitSeconds > 0)) return;
    const timer = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [examLocked, progress.phase, examTimeLimitSeconds]);

  useEffect(() => {
    if (progress.phase !== 'finalExam' || !examTimeLimitSeconds || examTimeSecondsLeft > 0 || isGrading) return;
    setProctorMessage('Time is up. The exam is being submitted with the answers currently saved.');
    submitFinalExam();
  }, [progress.phase, examTimeLimitSeconds, examTimeSecondsLeft, isGrading]);

  const prepareFinalExam = async (fresh: boolean) => {
    if (!fresh) {
      setFinalQuestionSet(applyExamPolicy(baseFinalExam, attemptPolicy));
      return;
    }

    try {
      const response = await fetch('/api/generate-module-exam', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          moduleTitle: module.title,
          textbookContext: parts.map((part) => `${part.textbookSection.title}\n${part.textbookSection.body}`).join('\n\n'),
          count: Math.max(3, Number(attemptPolicy.questionPoolSize || 0) || baseFinalExam.length),
        }),
      });
      const data = await response.json();
      const freshQuestions = (data.questions || []).filter((question: JourneyQuestion) => question.stem);
      const nextQuestions = freshQuestions.length ? freshQuestions : rotateQuestions(baseFinalExam);
      setFinalQuestionSet(applyExamPolicy(nextQuestions, attemptPolicy));
    } catch {
      const nextQuestions = rotateQuestions(baseFinalExam);
      setFinalQuestionSet(applyExamPolicy(nextQuestions, attemptPolicy));
    }
    setFinalAnswers({});
    setFinalGrades({});
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center text-on-surface">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="font-bold">Opening saved module...</p>
        </div>
      </div>
    );
  }

  if (accessError) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center px-5 text-on-surface">
        <div className="max-w-md rounded-3xl border border-outline-variant bg-surface-container-lowest p-8 text-center shadow-sm">
          <ShieldAlert className="mx-auto mb-4 text-error" size={42} />
          <p className="text-xs font-black uppercase tracking-widest text-error">Reviewer unavailable</p>
          <h1 className="mt-2 font-headline text-2xl font-black text-on-surface">This module cannot be opened</h1>
          <p className="mt-3 text-sm leading-relaxed text-on-surface-variant">{accessError}</p>
          <button
            onClick={() => navigate('/student/courses')}
            className="mt-6 rounded-xl bg-primary px-6 py-3 text-sm font-bold text-on-primary"
          >
            Back to LET Reviewers
          </button>
        </div>
      </div>
    );
  }

  const renderPartStepper = () => (
    <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-black uppercase tracking-widest text-on-surface-variant/50">Module path</p>
        <p className="text-xs font-black text-primary">{computeProgressPercent(progress, parts.length)}%</p>
      </div>
      <div className="flex gap-2">
        {parts.map((part, index) => {
          const isDone = progress.partScores[part.id] !== undefined;
          const isActive = index === progress.currentPartIndex && progress.phase !== 'finalExam' && progress.phase !== 'complete';
          return (
            <div
              key={part.id}
              className={`h-2 flex-1 rounded-full ${isDone ? 'bg-emerald-500' : isActive ? 'bg-primary' : 'bg-surface-container'}`}
              title={part.title}
            />
          );
        })}
        <div className={`h-2 flex-1 rounded-full ${progress.status === 'completed' ? 'bg-emerald-500' : progress.phase === 'finalExam' ? 'bg-primary' : 'bg-surface-container'}`} />
      </div>
    </div>
  );

  const renderPartNavigator = () => (
    <aside className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-4 shadow-sm h-fit lg:sticky lg:top-6">
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-black uppercase tracking-widest text-on-surface-variant/50">Topic book</p>
        <span className="text-xs font-black text-primary">{computeProgressPercent(progress, parts.length)}%</span>
      </div>
      <div className="space-y-2">
        {parts.map((part, index) => {
          const isDone = progress.partScores[part.id] !== undefined;
          const isActive = index === progress.currentPartIndex && progress.phase !== 'finalExam' && progress.phase !== 'complete';
          return (
            <button
              key={part.id}
              onClick={() => jumpToPart(index)}
              className={`w-full text-left rounded-xl border px-3 py-3 transition-colors ${
                isActive ? 'border-primary bg-primary/10' : 'border-outline-variant/30 bg-surface-container/30 hover:border-primary/40'
              }`}
            >
              <div className="flex items-start gap-3">
                <span className={`mt-0.5 w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${
                  isDone ? 'bg-emerald-500 border-emerald-500 text-white' : isActive ? 'border-primary text-primary' : 'border-outline text-on-surface-variant/40'
                }`}>
                  {isDone ? <CheckCircle2 size={13} /> : <span className="text-[10px] font-black">{index + 1}</span>}
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-black uppercase tracking-widest text-on-surface-variant/50">Lesson {index + 1}</span>
                  <span className="block text-sm font-extrabold text-on-surface leading-tight line-clamp-2">{part.title}</span>
                  <span className="block text-[11px] text-on-surface-variant/60 mt-1 line-clamp-1">{part.textbookSection.title}</span>
                </span>
              </div>
            </button>
          );
        })}
        <button
          onClick={() => moveToPhase('finalExam')}
          disabled={examLocked || finalAttemptsLocked || (!allPartsCompleted && progress.status !== 'completed')}
          className={`w-full text-left rounded-xl border px-3 py-3 transition-colors ${
            progress.phase === 'finalExam' ? 'border-primary bg-primary/10' : 'border-outline-variant/30 bg-surface-container/30 hover:border-primary/40'
          } disabled:opacity-50`}
        >
          <div className="flex items-start gap-3">
            <span className={`mt-0.5 w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${
              progress.status === 'completed' ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-primary text-primary'
            }`}>
              <Trophy size={13} />
            </span>
            <span>
              <span className="block text-xs font-black uppercase tracking-widest text-on-surface-variant/50">Gate</span>
              <span className="block text-sm font-extrabold text-on-surface">Final module exam</span>
              <span className="block text-[11px] text-on-surface-variant/60 mt-1">
                {finalAttemptsLocked ? 'Attempt limit reached' : `Pass at ${FINAL_PASSING_SCORE}% to unlock next module`}
              </span>
            </span>
          </div>
        </button>
      </div>
    </aside>
  );

  const renderContent = () => {
    if (!currentPart && progress.phase !== 'finalExam' && progress.phase !== 'complete') {
      return <EmptyState onBack={() => navigate('/student/courses')} />;
    }

    if (modulePastDue) {
      return (
        <Card>
          <HeaderKicker icon={Clock} label="Module closed" />
          <h2 className="text-2xl font-extrabold font-headline text-on-surface">This module is past its due date.</h2>
          <p className="text-on-surface-variant mt-3">Due date was {moduleDueAt?.toLocaleString()}. Ask your instructor if you need the module reopened.</p>
          <button onClick={() => navigate('/student/todo')} className="mt-6 rounded-xl bg-primary text-on-primary px-6 py-3 font-bold">Back to To Do</button>
        </Card>
      );
    }

    switch (progress.phase) {
      case 'intro':
        return (
          <Card>
            <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-5">
              <BookOpen size={24} />
            </div>
            <p className="text-xs font-black uppercase tracking-widest text-primary mb-2">Guided module</p>
            <h1 className="text-3xl font-extrabold font-headline text-on-surface tracking-tight">{module.title}</h1>
            <p className="text-on-surface-variant mt-3 leading-relaxed">{module.description}</p>
            <div className="grid grid-cols-3 gap-3 mt-6">
              <Metric label="Parts" value={parts.length.toString()} />
              <Metric label="Final" value={`${finalExam.length || 1} items`} />
              <Metric label="Pass" value={`${FINAL_PASSING_SCORE}%`} />
            </div>
            <button onClick={() => moveToPhase('read')} className="w-full bg-primary text-on-primary px-6 py-4 rounded-2xl font-bold flex items-center justify-between shadow-sm mt-6">
              {progress.currentPartIndex > 0 || Object.keys(progress.partScores).length > 0 ? 'Resume module' : 'Start part 1'}
              <ChevronRight size={18} />
            </button>
          </Card>
        );

      case 'read':
        return (
          <Card>
            <HeaderKicker icon={Library} label={`Part ${progress.currentPartIndex + 1} textbook`} />
            <h2 className="text-2xl font-extrabold font-headline text-on-surface">{currentPart.textbookSection.title}</h2>
            <p className="text-xs font-bold text-on-surface-variant/50 mt-2">{currentPart.textbookSection.estimatedReadMinutes} min read</p>
            {progress.mustReread && (
              <div className="rounded-2xl border border-error/20 bg-error/10 p-4 mt-5">
                <p className="font-bold text-error">Final exam not passed yet. Reread this section first; your next exam attempt will use fresh questions from this textbook.</p>
                {weakReviewParts.length > 0 && (
                  <div className="mt-3 rounded-xl bg-surface-container-lowest/70 border border-error/10 p-3">
                    <p className="text-xs font-black uppercase tracking-widest text-error mb-2">Review route</p>
                    <ul className="space-y-1 text-sm font-semibold text-on-surface">
                      {weakReviewParts.map((part) => <li key={part.id}>- {part.title}</li>)}
                    </ul>
                  </div>
                )}
                {progress.finalScore !== undefined && (
                  <GradeAppealBox
                    comment={appealComment}
                    sent={appealSent}
                    onComment={(value) => { setAppealComment(value); setAppealSent(false); }}
                    onSubmit={() => submitGradeAppeal('final_exam')}
                  />
                )}
              </div>
            )}
            <div className="mt-5">
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <button onClick={() => setIsBookmarked(!isBookmarked)} className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-bold ${isBookmarked ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface'}`}>
                  <Bookmark size={14} />
                  {isBookmarked ? 'Bookmarked' : 'Bookmark'}
                </button>
                {selectedText && (
                  <>
                    <button onClick={() => addHighlight(false)} className="inline-flex items-center gap-2 rounded-full bg-amber-500/10 text-amber-700 px-3 py-2 text-xs font-bold">
                      <Highlighter size={14} />
                      Highlight selection
                    </button>
                    <button onClick={() => addHighlight(true)} className="inline-flex items-center gap-2 rounded-full bg-surface-container text-on-surface px-3 py-2 text-xs font-bold">
                      <EyeOff size={14} />
                      Hide for recall
                    </button>
                  </>
                )}
                <button onClick={saveLessonNote} className="inline-flex items-center gap-2 rounded-full bg-primary text-on-primary px-3 py-2 text-xs font-bold">
                  <Save size={14} />
                  Save notes
                </button>
                {lessonHighlights.length > 0 && (
                  <>
                    {hiddenHighlightCount > 0 && (
                      <button onClick={revealedHighlightIds.length ? hideRevealedHighlights : revealAllHiddenHighlights} className="inline-flex items-center gap-2 rounded-full bg-surface-container text-on-surface px-3 py-2 text-xs font-bold">
                        {revealedHighlightIds.length ? <EyeOff size={14} /> : <Eye size={14} />}
                        {revealedHighlightIds.length ? 'Hide revealed' : `Reveal hidden (${hiddenHighlightCount})`}
                      </button>
                    )}
                    <button onClick={clearLessonHighlights} className="inline-flex items-center gap-2 rounded-full bg-error/10 text-error px-3 py-2 text-xs font-bold">
                      <X size={14} />
                      Clear marks
                    </button>
                  </>
                )}
              </div>
              <div className="fixed bottom-24 left-1/2 z-40 flex -translate-x-1/2 gap-2 rounded-full border border-outline-variant/40 bg-surface-container-lowest/95 p-2 shadow-lg backdrop-blur md:hidden">
                <button onClick={() => setIsBookmarked(!isBookmarked)} className={`rounded-full p-2 ${isBookmarked ? 'bg-primary text-on-primary' : 'text-on-surface'}`} aria-label="Bookmark lesson">
                  <Bookmark size={17} />
                </button>
                <button onClick={saveLessonNote} className="rounded-full p-2 text-on-surface" aria-label="Save notes">
                  <Save size={17} />
                </button>
                {hiddenHighlightCount > 0 && (
                  <button onClick={revealedHighlightIds.length ? hideRevealedHighlights : revealAllHiddenHighlights} className="rounded-full p-2 text-on-surface" aria-label="Reveal or hide recall marks">
                    {revealedHighlightIds.length ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                )}
              </div>
              <div className="hidden lg:flex fixed right-5 top-1/3 z-30 flex-col gap-2 rounded-2xl border border-outline-variant/40 bg-surface-container-lowest/95 p-2 shadow-lg backdrop-blur">
                <button onClick={() => setIsBookmarked(!isBookmarked)} className={`rounded-xl p-3 ${isBookmarked ? 'bg-primary text-on-primary' : 'text-on-surface hover:bg-surface-container'}`} title="Bookmark lesson" aria-label="Bookmark lesson">
                  <Bookmark size={18} />
                </button>
                <button onClick={saveLessonNote} className="rounded-xl p-3 text-on-surface hover:bg-surface-container" title="Save notes" aria-label="Save notes">
                  <Save size={18} />
                </button>
                <button onClick={downloadStudyGuide} className="rounded-xl p-3 text-on-surface hover:bg-surface-container" title="Download study guide" aria-label="Download study guide">
                  <Download size={18} />
                </button>
                {hiddenHighlightCount > 0 && (
                  <button onClick={revealedHighlightIds.length ? hideRevealedHighlights : revealAllHiddenHighlights} className="rounded-xl p-3 text-on-surface hover:bg-surface-container" title="Reveal or hide recall marks" aria-label="Reveal or hide recall marks">
                    {revealedHighlightIds.length ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                )}
              </div>
              <div onMouseUp={captureSelectedText} className="text-on-surface-variant leading-relaxed whitespace-pre-line select-text">
                {renderHighlightedText(
                  currentPart.textbookSection.body,
                  lessonHighlights,
                  activeHighlightId,
                  setActiveHighlightId,
                  revealedHighlightIds,
                  toggleRevealHighlight,
                )}
              </div>
              {activeHighlightId && (
                <div className="mt-3 rounded-2xl border border-primary/20 bg-primary/5 p-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-primary">
                        <MessageCircle size={14} />
                        Study mark
                      </div>
                      <p className="mt-2 max-w-2xl text-sm font-semibold text-on-surface">
                        "{lessonHighlights.find((item) => item.id === activeHighlightId)?.text}"
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {lessonHighlights.find((item) => item.id === activeHighlightId)?.hidden ? (
                        <>
                          <button
                            onClick={() => toggleRevealHighlight(activeHighlightId)}
                            className="inline-flex items-center gap-2 rounded-full bg-surface-container px-3 py-2 text-xs font-bold text-on-surface"
                          >
                            <Eye size={14} />
                            {revealedHighlightIds.includes(activeHighlightId) ? 'Hide again' : 'Reveal once'}
                          </button>
                          <button
                            onClick={() => updateHighlight(activeHighlightId, { hidden: false })}
                            className="inline-flex items-center gap-2 rounded-full bg-primary text-on-primary px-3 py-2 text-xs font-bold"
                          >
                            <Eye size={14} />
                            Unhide
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => updateHighlight(activeHighlightId, { hidden: true })}
                          className="inline-flex items-center gap-2 rounded-full bg-surface-container px-3 py-2 text-xs font-bold text-on-surface"
                        >
                          <EyeOff size={14} />
                          Hide for recall
                        </button>
                      )}
                      <button
                        onClick={() => removeHighlight(activeHighlightId)}
                        className="inline-flex items-center gap-2 rounded-full bg-error/10 px-3 py-2 text-xs font-bold text-error"
                      >
                        <X size={14} />
                        Remove
                      </button>
                    </div>
                  </div>
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs font-black uppercase tracking-widest text-on-surface-variant/60">Note on this mark</summary>
                    <textarea
                      value={lessonHighlights.find((item) => item.id === activeHighlightId)?.note || ''}
                      onChange={(event) => updateHighlight(activeHighlightId, { note: event.target.value })}
                      rows={2}
                      placeholder="Add a short note for this exact highlighted idea."
                      className="mt-3 w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl p-3 text-sm outline-none focus:border-primary/40 resize-none"
                    />
                  </details>
                </div>
              )}
              <details className="mt-4 rounded-2xl border border-outline-variant/40 bg-surface-container/30 p-3">
                <summary className="cursor-pointer text-xs font-black uppercase tracking-widest text-primary">Whole-section note</summary>
                <textarea
                  value={lessonNote}
                  onChange={(event) => setLessonNote(event.target.value)}
                  rows={3}
                  placeholder="Write a note for this lesson chunk."
                  className="mt-3 w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl p-3 text-sm outline-none focus:border-primary/40 resize-none"
                />
              </details>
            </div>
            {currentPart.textbookSection.mediaUrl && (
              <div className="mt-6 rounded-2xl border border-outline-variant/40 overflow-hidden bg-surface-container">
                {lowBandwidth ? (
                  <div className="p-4">
                    <p className="text-xs font-black uppercase tracking-widest text-primary">Low-bandwidth mode</p>
                    <p className="text-sm text-on-surface-variant mt-1">Video and slide embeds are paused. Open the media only when your connection is ready.</p>
                    <a href={currentPart.textbookSection.mediaUrl} target="_blank" rel="noreferrer" className="inline-flex mt-3 rounded-xl bg-primary text-on-primary px-4 py-2 text-sm font-bold">Open media link</a>
                  </div>
                ) : (
                  <iframe
                    src={toEmbeddableUrl(currentPart.textbookSection.mediaUrl)}
                    title={currentPart.textbookSection.title}
                    className="w-full aspect-video"
                    allow="fullscreen; autoplay; encrypted-media; picture-in-picture"
                  />
                )}
              </div>
            )}
            <button onClick={() => moveToPhase('lesson')} className="w-full bg-primary text-on-primary px-6 py-4 rounded-2xl font-bold flex items-center justify-between shadow-sm mt-6">
              Continue to lesson
              <ChevronRight size={18} />
            </button>
          </Card>
        );

      case 'lesson':
        return (
          <Card>
            <HeaderKicker icon={BookOpen} label={currentPart.title} />
            <h2 className="text-2xl font-extrabold font-headline text-on-surface">{currentPart.objective}</h2>
            <div className="space-y-4 mt-6">
              {currentPart.lessonBlocks.map((block, index) => {
                if (block.type === 'heading') return <h3 key={index} className="text-xl font-extrabold text-on-surface">{block.content}</h3>;
                if (block.type === 'callout') return <div key={index} className="rounded-2xl border border-primary/20 bg-primary/10 p-4 text-sm font-semibold text-on-surface">{block.content}</div>;
                return <p key={index} className="text-on-surface-variant leading-relaxed">{block.content}</p>;
              })}
            </div>
            <button onClick={() => moveToPhase(currentMiniQuestion ? 'miniQuiz' : currentPart.activity ? 'activity' : 'read')} className="w-full bg-primary text-on-primary px-6 py-4 rounded-2xl font-bold flex items-center justify-between shadow-sm mt-6">
              {currentMiniQuestion ? 'Take mini quiz' : currentPart.activity ? 'Try activity' : 'Continue'}
              <ChevronRight size={18} />
            </button>
          </Card>
        );

      case 'miniQuiz':
        if (!currentMiniQuestion) {
          return (
            <Card>
              <HeaderKicker icon={FileQuestion} label="Mini quiz" />
              <h2 className="text-xl font-extrabold text-on-surface">No mini quiz attached to this part yet.</h2>
              <p className="text-on-surface-variant mt-2">You can continue, but the instructor should add a mini check for this section.</p>
              <button onClick={() => goToNextPart({ ...progress.partScores, [currentPart.id]: 100 })} className="mt-6 rounded-xl bg-primary text-on-primary px-6 py-3 font-bold">Continue</button>
            </Card>
          );
        }

        return (
          <Card>
            <HeaderKicker icon={FileQuestion} label="Mini quiz" />
            <h2 className="text-xl font-extrabold text-on-surface leading-snug mb-6">{currentMiniQuestion.stem}</h2>
            {isChoiceQuestion(currentMiniQuestion) ? (
              <div className="space-y-3">
                {normalizeOptions(currentMiniQuestion).map((option) => {
                  const isChosen = selectedAnswer === option.id;
                  const isCorrect = option.id === currentMiniQuestion.correctOptionId;
                  const tone = !selectedAnswer ? optionTone.idle : isCorrect ? optionTone.right : isChosen ? optionTone.wrong : optionTone.idle;
                  return (
                    <button
                      key={option.id}
                      disabled={!!selectedAnswer}
                      onClick={() => answerMiniQuiz(option.id)}
                      className={`w-full rounded-xl border-2 p-4 text-left font-semibold transition-all ${tone}`}
                    >
                      {option.id}. {option.text}
                    </button>
                  );
                })}
                <p className="text-[11px] text-on-surface-variant/50 font-bold">Keyboard: press A/B/C/D, or T/F for true or false, then Enter.</p>
              </div>
            ) : (
              <div className="space-y-3">
                <textarea
                  value={writtenAnswer}
                  onChange={(event) => setWrittenAnswer(event.target.value)}
                  rows={currentMiniQuestion.type === 'essay' ? 6 : 3}
                  placeholder={currentMiniQuestion.type === 'enumeration' ? 'List answers separated by commas or new lines.' : 'Type your answer here.'}
                  className="w-full bg-surface-container border border-outline-variant/30 rounded-xl p-4 text-sm font-medium outline-none focus:border-primary/40"
                />
                {writtenAnswer.trim() && (
                  <p className="text-[11px] font-bold text-on-surface-variant/60">Draft autosaved{answerDraftSavedAt ? ` ${new Date(answerDraftSavedAt).toLocaleTimeString()}` : ''}.</p>
                )}
                <button
                  disabled={!writtenAnswer.trim() || isGrading}
                  onClick={checkWrittenMiniQuiz}
                  className="rounded-xl bg-primary text-on-primary px-5 py-3 text-sm font-bold disabled:opacity-50"
                >
                  {isGrading ? 'Checking...' : 'Check answer'}
                </button>
              </div>
            )}
            {(selectedAnswer || lastFeedback) && (
              <div className="mt-5 rounded-xl bg-surface-container p-4">
                <p className={`text-sm font-black mb-2 ${lastQuestionResult === 'correct' ? 'text-emerald-600' : 'text-error'}`}>
                  {lastQuestionResult === 'correct' ? 'Correct' : 'Review this idea'}
                </p>
                <p className="text-sm font-bold text-on-surface">{lastFeedback || currentMiniQuestion.explanation}</p>
                {!isChoiceQuestion(currentMiniQuestion) && (
                  <GradeAppealBox
                    comment={appealComment}
                    sent={appealSent}
                    onComment={(value) => { setAppealComment(value); setAppealSent(false); }}
                    onSubmit={() => submitGradeAppeal('mini_quiz')}
                  />
                )}
                <button onClick={completeMiniQuiz} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary text-on-primary px-5 py-3 text-sm font-bold">
                  {currentPart.activity ? 'Continue to activity' : 'Continue'}
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
          </Card>
        );

      case 'activity':
        return (
          <Card>
            <HeaderKicker icon={Gamepad2} label="Mini activity" />
            <h2 className="text-2xl font-extrabold font-headline text-on-surface">{currentPart.activity?.title || 'Practice activity'}</h2>
            <p className="text-on-surface-variant leading-relaxed mt-4">{currentPart.activity?.prompt || 'Complete the activity prepared by your instructor.'}</p>
            <div className="rounded-2xl bg-surface-container p-5 mt-6 border border-outline-variant/40">
              <p className="text-sm font-bold text-on-surface">Reflection checkpoint</p>
              <p className="text-xs text-on-surface-variant/60 mt-1">This keeps the module from becoming a passive reading page. Later this can become a drag-sort, matching game, or flashcard challenge.</p>
            </div>
            <button onClick={() => goToNextPart()} className="w-full bg-primary text-on-primary px-6 py-4 rounded-2xl font-bold flex items-center justify-between shadow-sm mt-6">
              Finish part
              <ChevronRight size={18} />
            </button>
          </Card>
        );

      case 'finalExam':
        return (
          <Card>
            <HeaderKicker icon={Trophy} label="Final module exam" />
            <h2 className="text-2xl font-extrabold font-headline text-on-surface">Pass this module exam to unlock completion.</h2>
            <p className="text-sm text-on-surface-variant mt-2">Required score: {FINAL_PASSING_SCORE}%. Choices support A/B/C/D and Enter. Written answers are AI-checked with spelling tolerance.</p>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-4 gap-3">
              <Metric label="Attempts" value={`${attemptsUsed}/${attemptPolicy.maxAttempts}`} />
              <Metric label="Score kept" value={attemptPolicy.scoreMode} />
              <Metric label="Timer" value={examTimeLimitSeconds ? formatDuration(examTimeSecondsLeft) : 'None'} />
              <Metric label="Integrity" value={antiCheatEnabled ? integrityPolicy.label : 'Open'} />
            </div>
            {Object.values(finalAnswers).some((answer) => String(answer || '').trim()) && (
              <p className="mt-3 text-[11px] font-bold text-on-surface-variant/60">Answers autosaved{answerDraftSavedAt ? ` ${new Date(answerDraftSavedAt).toLocaleTimeString()}` : ''}.</p>
            )}

            {examLocked && (
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 mt-5 flex gap-3">
                <Clock size={18} className="text-amber-700 shrink-0" />
                <p className="font-bold text-amber-700">This exam is paused after repeated proctor warnings. Retry in {formatDuration(examLockSecondsLeft)}.</p>
              </div>
            )}

            {recordFirstAttemptOnly && progress.firstFinalScore !== undefined && progress.status !== 'completed' && (
              <div className="rounded-2xl border border-outline-variant/40 bg-surface-container p-4 mt-5">
                <p className="text-sm font-bold text-on-surface">Official first attempt: {progress.firstFinalScore}%. Retakes are practice unless your instructor changes the class setting.</p>
              </div>
            )}

            {finalAttemptsLocked && (
              <div className="rounded-2xl border border-error/20 bg-error/10 p-4 mt-5">
                <p className="font-bold text-error">Attempts used: {attemptsUsed}/{attemptPolicy.maxAttempts}. Ask your instructor if another attempt should be opened.</p>
              </div>
            )}

            {progress.finalScore !== undefined && progress.finalScore < FINAL_PASSING_SCORE && (
              <div className="rounded-2xl border border-error/20 bg-error/10 p-4 mt-5">
                <p className="font-bold text-error">Last score: {progress.finalScore}%. You must reread the textbook before retrying. The next attempt uses fresh questions from the same reading.</p>
                {weakReviewParts.length > 0 && (
                  <p className="text-sm text-error/80 mt-2">Focus review: {weakReviewParts.map((part) => part.title).join(', ')}.</p>
                )}
              </div>
            )}

            <div className="space-y-6 mt-6">
              {finalExam.map((question, index) => (
                <div key={question.id} className="rounded-2xl border border-outline-variant/40 bg-surface-container/20 p-4">
                  <p className="text-xs font-black uppercase tracking-widest text-primary mb-2">Question {index + 1} / {questionTypeLabel(question)}</p>
                  <h3 className="font-extrabold text-on-surface leading-snug mb-4">{question.stem}</h3>
                  {isChoiceQuestion(question) ? (
                    <div className="grid grid-cols-1 gap-2">
                      {normalizeOptions(question).map((option) => {
                        const selected = finalAnswers[question.id] === option.id;
                        return (
                          <button
                            key={option.id}
                            disabled={examLocked}
                            onClick={() => setFinalAnswers((answers) => ({ ...answers, [question.id]: option.id }))}
                            className={`rounded-xl border p-3 text-left text-sm font-semibold transition-colors ${
                              selected ? 'border-primary bg-primary/10 text-primary' : 'border-outline-variant/30 bg-surface-container/30 text-on-surface'
                            }`}
                          >
                            {option.id}. {option.text}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <textarea
                      value={finalAnswers[question.id] || ''}
                      onChange={(event) => setFinalAnswers((answers) => ({ ...answers, [question.id]: event.target.value }))}
                      onPaste={(event) => event.preventDefault()}
                      disabled={examLocked}
                      rows={question.type === 'essay' ? 6 : 3}
                      placeholder={question.type === 'enumeration' ? 'List answers separated by commas or new lines.' : 'Type your answer here.'}
                      className="w-full bg-surface-container border border-outline-variant/30 rounded-xl p-4 text-sm font-medium outline-none focus:border-primary/40"
                    />
                  )}
                </div>
              ))}
            </div>

            <button
              disabled={finalAttemptsLocked || examLocked || finalAnsweredCount < finalExam.length || isGrading}
              onClick={submitFinalExam}
              className="w-full bg-primary text-on-primary px-6 py-4 rounded-2xl font-bold flex items-center justify-between shadow-sm mt-6 disabled:opacity-50"
            >
              {isGrading ? 'Checking final exam...' : 'Submit final exam'}
              <ChevronRight size={18} />
            </button>
          </Card>
        );

      case 'complete':
        return (
          <Card className="text-center">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center mx-auto mb-5">
              <Trophy size={32} />
            </div>
            <p className="text-xs font-black uppercase tracking-widest text-primary mb-2">Module complete</p>
            <h2 className="text-2xl font-extrabold font-headline text-on-surface">You passed {module.title}</h2>
            <p className="text-on-surface-variant mt-3">Final exam score: {finalScorePercent}%. The next module can now be unlocked by the learning path.</p>
            <GradeAppealBox
              comment={appealComment}
              sent={appealSent}
              onComment={(value) => { setAppealComment(value); setAppealSent(false); }}
              onSubmit={() => submitGradeAppeal('final_exam')}
            />
            {canRevealFinalAnswers && (
              <div className="mt-6 rounded-2xl border border-outline-variant/40 bg-surface-container/30 p-4 text-left">
                <p className="text-xs font-black uppercase tracking-widest text-primary mb-3">Answer review</p>
                <div className="space-y-3">
                  {finalExam.map((question, index) => (
                    <div key={question.id} className="rounded-xl bg-surface-container-lowest border border-outline-variant/30 p-3">
                      <p className="text-xs font-black text-on-surface-variant/50">Question {index + 1}</p>
                      <p className="text-sm font-extrabold text-on-surface mt-1">{question.stem}</p>
                      <p className="text-xs text-on-surface-variant mt-2">{question.explanation || finalGrades[question.id]?.feedback || 'Reviewed.'}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="flex flex-col sm:flex-row gap-3 justify-center mt-7">
              <button onClick={() => navigate('/student/courses')} className="rounded-xl bg-primary text-on-primary px-6 py-3 font-bold">
                Back to journey
              </button>
              <button onClick={downloadStudyGuide} className="rounded-xl bg-surface-container text-on-surface px-6 py-3 font-bold border border-outline-variant inline-flex items-center justify-center gap-2">
                <Download size={16} />
                Download study guide
              </button>
              <button onClick={resetFinalExam} className="rounded-xl bg-surface-container text-on-surface px-6 py-3 font-bold border border-outline-variant inline-flex items-center justify-center gap-2">
                <RotateCcw size={16} />
                Retake with new questions
              </button>
            </div>
          </Card>
        );
    }
  };

  return (
    <div className="bg-surface text-on-surface min-h-screen p-4 md:p-8 font-body">
      <header className="max-w-6xl mx-auto w-full flex items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-4 min-w-0">
          <button onClick={() => navigate('/student/courses')} className="p-2 bg-surface-container-lowest rounded-full text-on-surface-variant hover:text-on-surface border border-outline-variant shadow-sm">
            <ArrowLeft size={20} />
          </button>
          <div className="min-w-0">
            <h1 className="text-xl font-extrabold text-on-surface tracking-tight font-headline truncate">{module.title}</h1>
            <p className="text-xs text-on-surface-variant/60 font-bold uppercase tracking-widest">
              {progress.phase === 'finalExam' ? 'Final exam gate' : progress.phase === 'complete' ? 'Completed' : currentPart?.title || 'Learning module'}
            </p>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-2 rounded-full bg-surface-container px-3 py-2 text-xs font-bold text-on-surface-variant">
          <Save size={14} />
          {learningState}
        </div>
      </header>

      <main className="max-w-6xl mx-auto w-full grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-5">
        {renderPartNavigator()}
        <div className="space-y-5 min-w-0">
          {renderPartStepper()}
          {proctorMessage && (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm font-bold text-amber-700 flex gap-3">
              <ShieldAlert size={18} className="shrink-0" />
              <span>{proctorMessage}</span>
            </div>
          )}
          <motion.div key={`${progress.phase}-${progress.currentPartIndex}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            {renderContent()}
          </motion.div>
        </div>
      </main>
      <Toast
        isVisible={showToast}
        message={toastMsg}
        onClose={() => setShowToast(false)}
        type={toastMsg.includes('Unable') ? 'error' : 'success'}
      />
    </div>
  );
}

function computeProgressPercent(progress: QuestProgress, partCount: number) {
  if (progress.status === 'completed') return 100;
  const completedParts = Object.keys(progress.partScores || {}).length;
  const base = Math.round((completedParts / Math.max(partCount + 1, 1)) * 100);
  if (progress.phase === 'finalExam') return Math.max(base, 85);
  return Math.min(95, base);
}

function getModuleState(progress: QuestProgress, partCount: number): ModuleLearningState {
  if (progress.status === 'completed' && (progress.finalScore || 0) >= 95) return 'mastered';
  if (progress.status === 'completed') return 'completed';
  if (progress.mustReread || (progress.failedAttempts || 0) > 0) return 'review_required';
  if (progress.phase === 'finalExam') return 'ready_for_final_exam';
  if (partCount > 0 && Object.keys(progress.partScores || {}).length >= partCount) return 'ready_for_final_exam';
  if (Object.keys(progress.partScores || {}).length === 0 && progress.phase === 'intro') return 'available';
  if (progress.phase === 'read' && Object.keys(progress.partScores || {}).length > 0) return 'paused';
  return 'in_progress';
}

function getLearningState(progress: QuestProgress, partCount: number) {
  if (progress.status === 'completed' && (progress.finalScore || 0) >= 95) return 'MASTERED';
  if (progress.status === 'completed') return 'COMPLETED';
  if (progress.phase === 'finalExam') return 'READY_FOR_ASSESSMENT';
  if (progress.mustReread || (progress.failedAttempts || 0) > 0) return 'REVIEWING';
  if (progress.phase === 'miniQuiz' || progress.phase === 'activity') return 'PRACTICING';
  if (Object.keys(progress.partScores || {}).length === 0 && progress.phase === 'intro') return 'NOT_STARTED';
  if (partCount > 0 && Object.keys(progress.partScores || {}).length < partCount) return 'IN_PROGRESS';
  return 'PAUSED';
}

function isChoiceQuestion(question?: JourneyQuestion) {
  if (!question) return false;
  return !question.type || question.type === 'multiple_choice' || question.type === 'true_false';
}

function normalizeOptions(question: JourneyQuestion) {
  if (question.type === 'true_false' && (!question.options || question.options.length === 0)) {
    return [
      { id: 'A', text: 'True' },
      { id: 'B', text: 'False' },
    ];
  }
  return question.options || [];
}

function questionTypeLabel(question: JourneyQuestion) {
  const type = question.type || 'multiple_choice';
  return type.replace('_', ' ');
}

function getWeakPartIds(finalExam: JourneyQuestion[], grades: Record<string, GradeResult>, parts: JourneyModulePart[]) {
  const weak = new Set<string>();
  finalExam.forEach((question, index) => {
    if ((grades[question.id]?.score || 0) >= 70) return;
    const partId = question.partId || parts[index % Math.max(parts.length, 1)]?.id;
    if (partId) weak.add(partId);
  });
  return [...weak];
}

function renderHighlightedText(
  body: string,
  highlights: LessonHighlight[],
  activeHighlightId: string,
  setActiveHighlightId: (id: string) => void,
  revealedHighlightIds: string[],
  toggleRevealHighlight: (id: string) => void,
) {
  if (!highlights.length) return body;
  const usable = highlights.filter((item) => item.text && body.includes(item.text));
  if (!usable.length) return body;
  const parts: React.ReactNode[] = [];
  let remaining = body;
  let key = 0;

  while (remaining.length) {
    const next = usable
      .map((highlight) => ({ highlight, index: remaining.indexOf(highlight.text) }))
      .filter((item) => item.index >= 0)
      .sort((a, b) => a.index - b.index)[0];
    if (!next) {
      parts.push(remaining);
      break;
    }
    if (next.index > 0) parts.push(remaining.slice(0, next.index));
    const isHidden = !!next.highlight.hidden;
    const isRevealed = revealedHighlightIds.includes(next.highlight.id);
    parts.push(
      <button
        key={`${next.highlight.id}-${key++}`}
        type="button"
        onClick={() => {
          setActiveHighlightId(activeHighlightId === next.highlight.id ? '' : next.highlight.id);
          if (isHidden && !isRevealed) toggleRevealHighlight(next.highlight.id);
        }}
        className={`inline rounded px-1 font-semibold transition-colors ${
          isHidden
            ? isRevealed
              ? 'bg-primary/15 text-primary ring-1 ring-primary/30'
              : 'bg-on-surface text-surface hover:bg-on-surface/90'
            : 'bg-amber-200/70 text-on-surface hover:bg-amber-300/80'
        }`}
        title={isHidden && !isRevealed ? 'Hidden for recall - tap to reveal' : next.highlight.note || 'Click to add or view note'}
      >
        {isHidden && !isRevealed ? 'Hidden for recall - tap to reveal' : next.highlight.text}
        {next.highlight.note && <sup className="ml-1 text-primary">note</sup>}
      </button>,
    );
    remaining = remaining.slice(next.index + next.highlight.text.length);
  }
  return parts;
}

function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) return `${seconds}s`;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function toEmbeddableUrl(url: string) {
  if (url.includes('youtube.com/watch?v=')) {
    return url.replace('watch?v=', 'embed/');
  }
  if (url.includes('youtu.be/')) {
    return url.replace('youtu.be/', 'www.youtube.com/embed/');
  }
  return url;
}

function GradeAppealBox({
  comment,
  sent,
  onComment,
  onSubmit,
}: {
  comment: string;
  sent: boolean;
  onComment: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="mt-4 rounded-xl bg-surface-container-lowest/70 border border-outline-variant/40 p-4 text-left">
      <p className="text-xs font-black uppercase tracking-widest text-on-surface-variant/50">Instructor review</p>
      <p className="text-xs text-on-surface-variant/70 mt-1">If the AI score missed an acceptable answer, add a note and ask your instructor to double-check it.</p>
      <textarea
        value={comment}
        onChange={(event) => onComment(event.target.value)}
        rows={2}
        placeholder="Explain why your answer should be accepted."
        className="mt-3 w-full bg-surface-container border border-outline-variant/30 rounded-xl p-3 text-sm font-medium outline-none focus:border-primary/40"
      />
      <button
        onClick={onSubmit}
        disabled={!comment.trim() || sent}
        className="mt-3 rounded-xl bg-primary text-on-primary px-4 py-2 text-xs font-bold disabled:opacity-50"
      >
        {sent ? 'Review request sent' : 'Ask instructor to review'}
      </button>
    </div>
  );
}

function rotateQuestions(questions: JourneyQuestion[]) {
  return questions.map((question, index) => {
    if (!isChoiceQuestion(question)) {
      return { ...question, id: `${question.id}-retry-${Date.now()}-${index}` };
    }
    const options = normalizeOptions(question);
    const rotatedOptions = [...options.slice(1), options[0]].map((option, optionIndex) => ({
      ...option,
      id: String.fromCharCode(65 + optionIndex),
    }));
    const oldCorrectIndex = options.findIndex((option) => option.id === question.correctOptionId);
    const newCorrectIndex = oldCorrectIndex <= 0 ? options.length - 1 : oldCorrectIndex - 1;
    return {
      ...question,
      id: `${question.id}-retry-${Date.now()}-${index}`,
      stem: `${question.stem} (new attempt)`,
      options: rotatedOptions,
      correctOptionId: String.fromCharCode(65 + Math.max(0, newCorrectIndex)),
    };
  });
}

function applyExamPolicy(questions: JourneyQuestion[], policy: {
  randomizeQuestions?: boolean;
  randomizeChoices?: boolean;
  questionPoolSize?: number;
}) {
  const ordered = policy.randomizeQuestions ? shuffleList(questions) : [...questions];
  const poolSize = Math.max(0, Number(policy.questionPoolSize || 0));
  const pooled = poolSize > 0 ? ordered.slice(0, Math.min(poolSize, ordered.length)) : ordered;
  return policy.randomizeChoices ? pooled.map(shuffleChoicesForQuestion) : pooled;
}

function shuffleList<T>(items: T[]) {
  return items
    .map((item) => ({ item, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ item }) => item);
}

function shuffleChoicesForQuestion(question: JourneyQuestion) {
  if (!isChoiceQuestion(question)) return question;
  const options = normalizeOptions(question);
  const shuffled = options
    .map((question) => ({ question, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ question: option }, index) => ({ id: String.fromCharCode(65 + index), text: option.text, was: option.id }));
  const correct = shuffled.find((option) => option.was === question.correctOptionId)?.id || question.correctOptionId;
  return {
    ...question,
    options: shuffled.map(({ id, text }) => ({ id, text })),
    correctOptionId: correct,
  };
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={`bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 shadow-sm ${className}`}>
      {children}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface-container p-3 border border-outline-variant/40">
      <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/50">{label}</p>
      <p className="text-xl font-black text-on-surface">{value}</p>
    </div>
  );
}

function HeaderKicker({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-2 text-primary text-xs font-black uppercase tracking-widest mb-3">
      <Icon size={16} />
      {label}
    </div>
  );
}

function EmptyState({ onBack }: { onBack: () => void }) {
  return (
    <Card className="text-center">
      <CheckCircle2 size={40} className="mx-auto text-on-surface-variant/30 mb-4" />
      <h2 className="font-extrabold text-on-surface">No learning parts yet.</h2>
      <p className="text-sm text-on-surface-variant mt-2">Ask the instructor to add parts to this module.</p>
      <button onClick={onBack} className="mt-5 rounded-xl bg-primary text-on-primary px-6 py-3 font-bold">Back to journey</button>
    </Card>
  );
}
