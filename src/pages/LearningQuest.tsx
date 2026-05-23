import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, BookOpen, CheckCircle2, ChevronRight, FileQuestion, Library, Trophy } from 'lucide-react';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { findJourneyModule, JourneyModule, JourneyQuestion } from '../lib/learningJourney';

type QuestStep = 'hook' | 'lesson' | 'check' | 'challenge' | 'complete';

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
  };
}

const optionTone = {
  idle: 'border-outline-variant/30 bg-surface-container/30 text-on-surface hover:border-primary/40',
  right: 'border-emerald-500 bg-emerald-500/10 text-emerald-700',
  wrong: 'border-error bg-error/10 text-error',
};

export default function LearningQuest() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const moduleId = searchParams.get('moduleId');
  const { user } = useAuth();

  const [step, setStep] = useState<QuestStep>('hook');
  const [module, setModule] = useState<JourneyModule>(() => findJourneyModule(moduleId));
  const [questions, setQuestions] = useState<JourneyQuestion[]>(() => findJourneyModule(moduleId).questions);
  const [loading, setLoading] = useState(true);
  const [checkAnswer, setCheckAnswer] = useState<string | null>(null);
  const [challengeIndex, setChallengeIndex] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);

  useEffect(() => {
    async function loadModule() {
      setLoading(true);
      try {
        let activeModule = findJourneyModule(moduleId);
        let activeQuestions = activeModule.questions;

        if (moduleId) {
          const moduleSnap = await getDoc(doc(db, 'modules', moduleId));
          if (moduleSnap.exists()) {
            activeModule = normalizeFirestoreModule(moduleSnap.id, moduleSnap.data());
            const questionIds = [
              ...(moduleSnap.data().checkQuestionIds || []),
              ...(moduleSnap.data().challengeQuestionIds || []),
              ...(moduleSnap.data().questionIds || []),
            ];

            if (questionIds.length > 0) {
              const loadedQuestions: JourneyQuestion[] = [];
              for (const questionId of questionIds.slice(0, 6)) {
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
              if (loadedQuestions.length > 0) activeQuestions = loadedQuestions;
            }
          }
        }

        setModule(activeModule);
        setQuestions(activeQuestions.length > 0 ? activeQuestions : findJourneyModule(moduleId).questions);
      } catch (error) {
        console.error('Failed to load module, using journey fallback', error);
        const fallback = findJourneyModule(moduleId);
        setModule(fallback);
        setQuestions(fallback.questions);
      } finally {
        setLoading(false);
      }
    }

    loadModule();
  }, [moduleId]);

  const quickCheck = questions[0];
  const challengeQuestions = useMemo(() => questions.slice(1), [questions]);
  const currentChallenge = challengeQuestions[challengeIndex];

  const completeQuest = async (finalCorrectCount: number) => {
    if (user) {
      try {
        await setDoc(
          doc(db, 'moduleProgress', `${user.uid}_${module.id}`),
          {
            userId: user.uid,
            moduleId: module.id,
            status: 'completed',
            scorePercent: Math.round((finalCorrectCount / Math.max(questions.length, 1)) * 100),
            completedAt: serverTimestamp(),
            lastAccessedAt: serverTimestamp(),
          },
          { merge: true },
        );

        const profileRef = doc(db, 'learnerProfiles', user.uid);
        const profileSnap = await getDoc(profileRef);
        if (profileSnap.exists()) {
          const profile = profileSnap.data();
          const currentMastery = profile.masteryByTopic?.[module.topicId] || 0;
          await updateDoc(profileRef, {
            [`masteryByTopic.${module.topicId}`]: Math.min(100, currentMastery + 10),
            lastUpdatedAt: serverTimestamp(),
          });
        }
      } catch (error) {
        console.warn('Quest progress could not be saved', error);
      }
    }

    setStep('complete');
  };

  const handleQuickCheck = (optionId: string) => {
    setCheckAnswer(optionId);
    if (optionId === quickCheck.correctOptionId) setCorrectCount((count) => count + 1);
  };

  const continueAfterCheck = () => {
    if (challengeQuestions.length === 0) {
      completeQuest(correctCount);
    } else {
      setStep('challenge');
    }
  };

  const answerChallenge = async (optionId: string) => {
    const nextCorrectCount = optionId === currentChallenge.correctOptionId ? correctCount + 1 : correctCount;
    setCorrectCount(nextCorrectCount);

    if (challengeIndex >= challengeQuestions.length - 1) {
      await completeQuest(nextCorrectCount);
    } else {
      setChallengeIndex((index) => index + 1);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center text-on-surface">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="font-bold">Opening module...</p>
        </div>
      </div>
    );
  }

  const renderLessonBlock = (block: JourneyModule['lessonBlocks'][number], index: number) => {
    if (block.type === 'heading') {
      return (
        <h2 key={index} className="text-xl font-extrabold font-headline text-on-surface">
          {block.content}
        </h2>
      );
    }

    if (block.type === 'callout') {
      return (
        <div key={index} className="rounded-2xl border border-primary/20 bg-primary/10 p-4 text-sm font-semibold text-on-surface">
          {block.content}
        </div>
      );
    }

    return (
      <p key={index} className="text-on-surface-variant leading-relaxed">
        {block.content}
      </p>
    );
  };

  const renderContent = () => {
    switch (step) {
      case 'hook':
        return (
          <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} className="space-y-5">
            <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 shadow-sm">
              <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-5">
                <BookOpen size={24} />
              </div>
              <p className="text-xs font-black uppercase tracking-widest text-primary mb-2">Mini module</p>
              <h1 className="text-3xl font-extrabold font-headline text-on-surface tracking-tight">{module.title}</h1>
              <p className="text-on-surface-variant mt-3 leading-relaxed">{module.description}</p>

              <div className="grid grid-cols-3 gap-3 mt-6">
                <div className="rounded-xl bg-surface-container p-3 border border-outline-variant/40">
                  <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/50">Level</p>
                  <p className="text-xl font-black text-on-surface">{module.level}</p>
                </div>
                <div className="rounded-xl bg-surface-container p-3 border border-outline-variant/40">
                  <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/50">Time</p>
                  <p className="text-xl font-black text-on-surface">{module.duration}</p>
                </div>
                <div className="rounded-xl bg-surface-container p-3 border border-outline-variant/40">
                  <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/50">Items</p>
                  <p className="text-xl font-black text-on-surface">{questions.length}</p>
                </div>
              </div>
            </div>

            <button onClick={() => setStep('lesson')} className="w-full bg-primary text-on-primary px-6 py-4 rounded-2xl font-bold flex items-center justify-between shadow-sm">
              Start lesson
              <ChevronRight size={18} />
            </button>
          </motion.section>
        );

      case 'lesson':
        return (
          <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} className="space-y-5">
            <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 shadow-sm space-y-5">
              {module.lessonBlocks.map(renderLessonBlock)}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button onClick={() => navigate('/library')} className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4 text-left hover:border-primary/40 transition-colors">
                <Library className="text-primary mb-3" size={22} />
                <p className="font-extrabold text-on-surface">Open textbook</p>
                <p className="text-xs text-on-surface-variant/60 mt-1">Read the supporting chapter.</p>
              </button>
              <button onClick={() => setStep('check')} className="rounded-2xl bg-primary text-on-primary p-4 text-left shadow-sm">
                <FileQuestion className="mb-3" size={22} />
                <p className="font-extrabold">Take quick check</p>
                <p className="text-xs text-on-primary/70 mt-1">Answer before the challenge.</p>
              </button>
            </div>
          </motion.section>
        );

      case 'check':
        return (
          <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 shadow-sm">
            <p className="text-xs font-black uppercase tracking-widest text-primary mb-3">Quick check</p>
            <h2 className="text-xl font-extrabold text-on-surface leading-snug mb-6">{quickCheck.stem}</h2>
            <div className="space-y-3">
              {quickCheck.options.map((option) => {
                const isChosen = checkAnswer === option.id;
                const isCorrect = option.id === quickCheck.correctOptionId;
                const tone = !checkAnswer ? optionTone.idle : isCorrect ? optionTone.right : isChosen ? optionTone.wrong : optionTone.idle;
                return (
                  <button
                    key={option.id}
                    disabled={!!checkAnswer}
                    onClick={() => handleQuickCheck(option.id)}
                    className={`w-full rounded-xl border-2 p-4 text-left font-semibold transition-all ${tone}`}
                  >
                    {option.id}. {option.text}
                  </button>
                );
              })}
            </div>

            {checkAnswer && (
              <div className="mt-5 rounded-xl bg-surface-container p-4">
                <p className="text-sm font-bold text-on-surface">{quickCheck.explanation}</p>
                <button onClick={continueAfterCheck} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary text-on-primary px-5 py-3 text-sm font-bold">
                  Continue to challenge
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
          </motion.section>
        );

      case 'challenge':
        return (
          <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} className="bg-primary text-on-primary rounded-2xl p-6 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-widest text-on-primary/70 mb-3">
              Challenge {challengeIndex + 1} / {challengeQuestions.length}
            </p>
            <h2 className="text-xl font-extrabold leading-snug mb-6">{currentChallenge.stem}</h2>
            <div className="space-y-3">
              {currentChallenge.options.map((option) => (
                <button
                  key={option.id}
                  onClick={() => answerChallenge(option.id)}
                  className="w-full text-left p-4 rounded-xl border border-white/20 bg-white/10 hover:bg-white/20 font-semibold transition-all"
                >
                  {option.id}. {option.text}
                </button>
              ))}
            </div>
          </motion.section>
        );

      case 'complete':
        return (
          <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="text-center bg-surface-container-lowest border border-outline-variant rounded-2xl p-8 shadow-sm">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center mx-auto mb-5">
              <Trophy size={32} />
            </div>
            <p className="text-xs font-black uppercase tracking-widest text-primary mb-2">Module complete</p>
            <h2 className="text-2xl font-extrabold font-headline text-on-surface">You finished {module.title}</h2>
            <p className="text-on-surface-variant mt-3">
              Score: {correctCount} of {questions.length}. Your path is ready for the next lesson, quiz, or exam practice.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center mt-7">
              <button onClick={() => navigate('/student/courses')} className="rounded-xl bg-primary text-on-primary px-6 py-3 font-bold">
                Back to journey
              </button>
              <button onClick={() => navigate(`/exam?type=practice&category=${module.subjectId}`)} className="rounded-xl bg-surface-container text-on-surface px-6 py-3 font-bold border border-outline-variant">
                Practice quiz
              </button>
            </div>
          </motion.section>
        );
    }
  };

  return (
    <div className="bg-surface text-on-surface min-h-screen p-4 md:p-8 font-body">
      <header className="max-w-2xl mx-auto w-full flex items-center gap-4 mb-8">
        <button onClick={() => navigate('/student/courses')} className="p-2 bg-surface-container-lowest rounded-full text-on-surface-variant hover:text-on-surface border border-outline-variant shadow-sm">
          <ArrowLeft size={20} />
        </button>
        <div className="min-w-0">
          <h1 className="text-xl font-extrabold text-on-surface tracking-tight font-headline truncate">{module.title}</h1>
          <p className="text-xs text-on-surface-variant/60 font-bold uppercase tracking-widest">Learning quest</p>
        </div>
      </header>

      <main className="max-w-2xl mx-auto w-full">
        <AnimatePresence mode="wait">{renderContent()}</AnimatePresence>
      </main>
    </div>
  );
}
