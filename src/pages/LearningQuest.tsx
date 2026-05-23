import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  FileQuestion,
  Gamepad2,
  Library,
  RotateCcw,
  Save,
  Trophy,
} from 'lucide-react';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import {
  findJourneyModule,
  getModuleFinalExam,
  getModuleParts,
  JourneyModule,
  JourneyModulePart,
  JourneyQuestion,
} from '../lib/learningJourney';

type QuestPhase = 'intro' | 'read' | 'lesson' | 'miniQuiz' | 'activity' | 'finalExam' | 'complete';

interface QuestProgress {
  currentPartIndex: number;
  phase: QuestPhase;
  partScores: Record<string, number>;
  finalScore?: number;
  status: 'in_progress' | 'completed';
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
  status: 'in_progress',
};

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
  };
}

export default function LearningQuest() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const moduleId = searchParams.get('moduleId');
  const { user } = useAuth();

  const [module, setModule] = useState<JourneyModule>(() => findJourneyModule(moduleId));
  const [progress, setProgress] = useState<QuestProgress>(defaultProgress);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [lastQuestionResult, setLastQuestionResult] = useState<'correct' | 'wrong' | null>(null);
  const [finalAnswers, setFinalAnswers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const parts = useMemo(() => getModuleParts(module), [module]);
  const finalExam = useMemo(() => getModuleFinalExam(module), [module]);
  const currentPart = parts[Math.min(progress.currentPartIndex, Math.max(parts.length - 1, 0))];
  const currentMiniQuestion = currentPart?.miniQuiz?.[0];
  const finalAnsweredCount = Object.keys(finalAnswers).length;
  const finalScorePercent = progress.finalScore ?? 0;

  const progressDocId = user ? `${user.uid}_${module.id}` : '';
  const localProgressKey = `let-mastery-progress:${module.id}`;

  const persistProgress = async (nextProgress: QuestProgress) => {
    setProgress(nextProgress);
    setSelectedAnswer(null);
    setLastQuestionResult(null);

    try {
      localStorage.setItem(localProgressKey, JSON.stringify(nextProgress));
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
          status: nextProgress.status,
          currentPartIndex: nextProgress.currentPartIndex,
          phase: nextProgress.phase,
          partScores: nextProgress.partScores,
          finalScore: nextProgress.finalScore ?? null,
          progressPercent: computeProgressPercent(nextProgress, parts.length),
          lastAccessedAt: serverTimestamp(),
          completedAt: nextProgress.status === 'completed' ? serverTimestamp() : null,
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
      try {
        let activeModule = findJourneyModule(moduleId);

        if (moduleId) {
          const moduleSnap = await getDoc(doc(db, 'modules', moduleId));
          if (moduleSnap.exists()) {
            activeModule = normalizeFirestoreModule(moduleSnap.id, moduleSnap.data());
            const data = moduleSnap.data() as any;
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
          }
        }

        setModule(activeModule);

        let restoredProgress: QuestProgress | null = null;
        if (user) {
          const progressSnap = await getDoc(doc(db, 'moduleProgress', `${user.uid}_${activeModule.id}`));
          if (progressSnap.exists()) {
            const data = progressSnap.data() as any;
            restoredProgress = {
              currentPartIndex: data.currentPartIndex || 0,
              phase: data.phase || 'intro',
              partScores: data.partScores || {},
              finalScore: data.finalScore ?? undefined,
              status: data.status === 'completed' ? 'completed' : 'in_progress',
            };
          }
        }

        if (!restoredProgress) {
          try {
            const saved = localStorage.getItem(`let-mastery-progress:${activeModule.id}`);
            restoredProgress = saved ? JSON.parse(saved) : null;
          } catch {
            restoredProgress = null;
          }
        }

        setProgress(restoredProgress || defaultProgress);
      } catch (error) {
        console.error('Failed to load module, using journey fallback', error);
        setModule(findJourneyModule(moduleId));
      } finally {
        setLoading(false);
      }
    }

    loadModuleAndProgress();
  }, [moduleId, user]);

  const moveToPhase = (phase: QuestPhase) => {
    persistProgress({ ...progress, phase, status: phase === 'complete' ? 'completed' : 'in_progress' });
  };

  const completeMiniQuiz = () => {
    const isCorrect = selectedAnswer === currentMiniQuestion?.correctOptionId;
    const nextScores = {
      ...progress.partScores,
      [currentPart.id]: isCorrect ? 100 : 0,
    };

    if (currentPart.activity) {
      persistProgress({ ...progress, phase: 'activity', partScores: nextScores });
      return;
    }

    goToNextPart(nextScores);
  };

  const goToNextPart = (partScores = progress.partScores) => {
    const nextIndex = progress.currentPartIndex + 1;
    if (nextIndex >= parts.length) {
      persistProgress({ ...progress, currentPartIndex: progress.currentPartIndex, phase: 'finalExam', partScores });
      return;
    }

    persistProgress({ ...progress, currentPartIndex: nextIndex, phase: 'read', partScores });
  };

  const submitFinalExam = async () => {
    const correctCount = finalExam.reduce((sum, question) => {
      return sum + (finalAnswers[question.id] === question.correctOptionId ? 1 : 0);
    }, 0);
    const score = Math.round((correctCount / Math.max(finalExam.length, 1)) * 100);
    const status = score >= 70 ? 'completed' : 'in_progress';
    const phase: QuestPhase = score >= 70 ? 'complete' : 'finalExam';

    await persistProgress({
      ...progress,
      phase,
      finalScore: score,
      status,
    });

    if (score >= 70 && user) {
      try {
        const profileRef = doc(db, 'learnerProfiles', user.uid);
        const profileSnap = await getDoc(profileRef);
        if (profileSnap.exists()) {
          const profile = profileSnap.data();
          const currentMastery = profile.masteryByTopic?.[module.topicId] || 0;
          await updateDoc(profileRef, {
            [`masteryByTopic.${module.topicId}`]: Math.min(100, currentMastery + 12),
            nextRecommendedModuleId: null,
            lastUpdatedAt: serverTimestamp(),
          });
        }
      } catch (error) {
        console.warn('Unable to update learner profile mastery', error);
      }
    }
  };

  const resetFinalExam = () => {
    setFinalAnswers({});
    persistProgress({ ...progress, finalScore: undefined, phase: 'finalExam', status: 'in_progress' });
  };

  const answerMiniQuiz = (optionId: string) => {
    setSelectedAnswer(optionId);
    setLastQuestionResult(optionId === currentMiniQuestion?.correctOptionId ? 'correct' : 'wrong');
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

  const renderContent = () => {
    if (!currentPart && progress.phase !== 'finalExam' && progress.phase !== 'complete') {
      return <EmptyState onBack={() => navigate('/student/courses')} />;
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
              <Metric label="Pass" value="70%" />
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
            <p className="text-on-surface-variant leading-relaxed mt-5 whitespace-pre-line">{currentPart.textbookSection.body}</p>
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
            <div className="space-y-3">
              {currentMiniQuestion.options.map((option) => {
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
            </div>
            {selectedAnswer && (
              <div className="mt-5 rounded-xl bg-surface-container p-4">
                <p className={`text-sm font-black mb-2 ${lastQuestionResult === 'correct' ? 'text-emerald-600' : 'text-error'}`}>
                  {lastQuestionResult === 'correct' ? 'Correct' : 'Review this idea'}
                </p>
                <p className="text-sm font-bold text-on-surface">{currentMiniQuestion.explanation}</p>
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
            <p className="text-sm text-on-surface-variant mt-2">Required score: 70%. You can retry if needed.</p>

            {progress.finalScore !== undefined && progress.finalScore < 70 && (
              <div className="rounded-2xl border border-error/20 bg-error/10 p-4 mt-5">
                <p className="font-bold text-error">Score {progress.finalScore}%. Review the parts and retry the final exam.</p>
              </div>
            )}

            <div className="space-y-6 mt-6">
              {finalExam.map((question, index) => (
                <div key={question.id} className="rounded-2xl border border-outline-variant/40 bg-surface-container/20 p-4">
                  <p className="text-xs font-black uppercase tracking-widest text-primary mb-2">Question {index + 1}</p>
                  <h3 className="font-extrabold text-on-surface leading-snug mb-4">{question.stem}</h3>
                  <div className="grid grid-cols-1 gap-2">
                    {question.options.map((option) => {
                      const selected = finalAnswers[question.id] === option.id;
                      return (
                        <button
                          key={option.id}
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
                </div>
              ))}
            </div>

            <button
              disabled={finalAnsweredCount < finalExam.length}
              onClick={submitFinalExam}
              className="w-full bg-primary text-on-primary px-6 py-4 rounded-2xl font-bold flex items-center justify-between shadow-sm mt-6 disabled:opacity-50"
            >
              Submit final exam
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
            <div className="flex flex-col sm:flex-row gap-3 justify-center mt-7">
              <button onClick={() => navigate('/student/courses')} className="rounded-xl bg-primary text-on-primary px-6 py-3 font-bold">
                Back to journey
              </button>
              <button onClick={resetFinalExam} className="rounded-xl bg-surface-container text-on-surface px-6 py-3 font-bold border border-outline-variant inline-flex items-center justify-center gap-2">
                <RotateCcw size={16} />
                Retake exam
              </button>
            </div>
          </Card>
        );
    }
  };

  return (
    <div className="bg-surface text-on-surface min-h-screen p-4 md:p-8 font-body">
      <header className="max-w-3xl mx-auto w-full flex items-center justify-between gap-4 mb-6">
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
          Auto-saved
        </div>
      </header>

      <main className="max-w-3xl mx-auto w-full space-y-5">
        {renderPartStepper()}
        <motion.div key={`${progress.phase}-${progress.currentPartIndex}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          {renderContent()}
        </motion.div>
      </main>
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
