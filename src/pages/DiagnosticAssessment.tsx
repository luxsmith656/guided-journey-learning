import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getDocs, collection, query, where, doc, setDoc, serverTimestamp, increment } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { motion } from 'motion/react';

interface Question {
  id: string;
  stem: string;
  options: { id: string; text: string }[];
  correctOptionId: string;
  categoryId: string;
  categoryName: string;
  topicId: string;
  skillIds: string[];
  difficulty: string;
  explanation?: string;
  competencyId?: string;
  wrongChoiceExplanations?: Record<string, string>;
  relatedModuleId?: string;
}

export default function DiagnosticAssessment() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();

  const [hasStarted, setHasStarted] = useState(false);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastAttemptAt, setLastAttemptAt] = useState<Date | null>(null);
  const [attemptCount, setAttemptCount] = useState(0);
  
  useEffect(() => {
    const loadQuestions = async () => {
      try {
        if (user) {
          const attemptsSnap = await getDocs(query(collection(db, 'diagnosticAttempts'), where('userId', '==', user.uid)));
          const attempts = attemptsSnap.docs.map((attemptDoc) => attemptDoc.data());
          setAttemptCount(attempts.length);
          const latest = attempts
            .map((attempt: any) => attempt.completedAt?.toDate?.() || (attempt.completedAt ? new Date(attempt.completedAt) : null))
            .filter(Boolean)
            .sort((a: Date, b: Date) => b.getTime() - a.getTime())[0];
          if (latest) setLastAttemptAt(latest);
        }
        const q = query(
            collection(db, 'questions'), 
            where('type', '==', 'diagnostic'),
            where('isPublished', '==', true),
            where('approved', '==', true)
        );
        let qSnap = await getDocs(q);
        if (qSnap.empty) {
          const fallbackQuery = query(
            collection(db, 'questions'),
            where('isPublished', '==', true),
            where('approved', '==', true)
          );
          qSnap = await getDocs(fallbackQuery);
        }
        
        let allQuestions: Question[] = [];
        qSnap.forEach(snap => {
          const d = snap.data();
          allQuestions.push({
            id: snap.id,
            stem: d.stem,
            options: d.options,
            correctOptionId: d.correctOptionId,
            categoryId: d.categoryId,
            categoryName: d.categoryName || 'Unknown',
            topicId: d.topicId || 'Unknown',
            skillIds: d.skillIds || [],
            difficulty: d.difficulty || 'medium',
            explanation: d.explanation || '',
            competencyId: d.competencyId || '',
            wrongChoiceExplanations: d.wrongChoiceExplanations || {},
            relatedModuleId: d.relatedModuleId || d.moduleId || '',
          });
        });

        // Shuffle and pick 10
        allQuestions.sort(() => 0.5 - Math.random());
        setQuestions(allQuestions.slice(0, 15)); // Increased to 15 for better diagnostic coverage
      } catch (error) {
        console.error('Failed to load diagnostic questions', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadQuestions();
  }, [user]);

  // ... (no changes to mapFocusToCategories) ...

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

  const handleNext = async (optionId: string) => {
    const newAnswers = { ...answers, [questions[currentIndex].id]: optionId };
    setAnswers(newAnswers);

    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      setIsSubmitting(true);
      
      const analysis = analyzeResults(newAnswers, questions);
      const scorePercent = analysis.overallScore;

      try {
        const attemptId = doc(collection(db, 'diagnosticAttempts')).id;
        const attemptRef = doc(db, 'diagnosticAttempts', attemptId);
        
        const answerRecords = Object.entries(newAnswers).map(([qid, oid]) => {
          const question = questions.find(q => q.id === qid);
          return {
            questionId: qid,
            selectedOptionId: oid,
            correctOptionId: question?.correctOptionId || '',
            isCorrect: oid === question?.correctOptionId,
            categoryId: question?.categoryId || '',
            topicId: question?.topicId || '',
            skillIds: question?.skillIds || [],
            timeSpentSeconds: 0,
            stem: question?.stem || '',
            options: question?.options || [],
            explanation: question?.explanation || '',
            competencyId: question?.competencyId || '',
            difficulty: question?.difficulty || 'medium',
            wrongChoiceExplanations: question?.wrongChoiceExplanations || {},
            relatedModuleId: question?.relatedModuleId || '',
          };
        });

        await setDoc(attemptRef, {
          id: attemptId,
          userId: user!.uid,
          type: 'diagnostic',
          mode: user?.learningMode || 'self_review',
          scorePercent,
          totalQuestions: questions.length,
          correctCount: Math.round((scorePercent / 100) * questions.length),
          answers: answerRecords,
          completedAt: serverTimestamp()
        });

        await Promise.all(answerRecords.filter((answer) => !answer.isCorrect).map((answer) => setDoc(doc(db, 'mistakeBank', `${user!.uid}_${answer.questionId}`), {
          userId: user!.uid,
          questionId: answer.questionId,
          stem: answer.stem,
          options: answer.options,
          explanation: answer.explanation,
          rationalization: answer.explanation,
          wrongChoiceExplanations: answer.wrongChoiceExplanations,
          selectedOptionId: answer.selectedOptionId,
          correctOptionId: answer.correctOptionId,
          categoryId: answer.categoryId,
          topicId: answer.topicId,
          competencyId: answer.competencyId,
          difficulty: answer.difficulty,
          skillIds: answer.skillIds,
          relatedModuleId: answer.relatedModuleId,
          examType: 'diagnostic',
          sourceAttemptId: attemptId,
          timesMissed: increment(1),
          firstMissedAt: serverTimestamp(),
          lastMissedAt: serverTimestamp(),
        }, { merge: true })));

        // Clean standardized learner profile
        const learnerProfile = {
          userId: user!.uid,
          learningMode: user?.learningMode || 'self_review',
          activeClassId: user?.activeClassId || null,
          selectedFocus: user?.selectedFocus || null,
          currentLevel: scorePercent >= 75 ? 3 : scorePercent >= 50 ? 2 : 1,
          masteryBySkill: analysis.skillMastery,
          masteryByTopic: analysis.topicMastery,
          masteryByCategory: analysis.categoryMastery,
          weakSkills: analysis.weakSkills,
          strongSkills: analysis.strongSkills,
          weakTopics: analysis.weakTopics,
          strongTopics: analysis.strongTopics,
          recommendedModuleIds: scorePercent < 50 ? ['mod_intro_profed'] : [],
          diagnosticAttemptId: attemptId,
          diagnosticAttemptCount: attemptCount + 1,
          badges: user?.earnedBadges || [],
          lastUpdatedAt: serverTimestamp()
        };

        await setDoc(doc(db, 'learnerProfiles', user!.uid), learnerProfile);

        await setDoc(doc(db, 'users', user!.uid), {
           diagnosticCompleted: true,
           diagnosticSkipped: false,
           updatedAt: serverTimestamp(),
           onboardingStep: 3
        }, { merge: true });

        await refreshUser();
        navigate('/student/dashboard');
      } catch (err: any) {
        console.error('Failed to save profile', err);
        navigate('/student/dashboard');
      }
    }
  };

  const analyzeResults = (userAnswers: Record<string, string>, allQuestions: Question[]) => {
    let totalCorrect = 0;
    const categoryStats: Record<string, { correct: number, total: number, name: string }> = {};
    const topicStats: Record<string, { correct: number, total: number }> = {};
    const skillStats: Record<string, { correct: number, total: number }> = {};

    allQuestions.forEach(q => {
      const isCorrect = userAnswers[q.id] === q.correctOptionId;
      if (isCorrect) totalCorrect++;

      // Stats by category
      if (!categoryStats[q.categoryId]) categoryStats[q.categoryId] = { correct: 0, total: 0, name: q.categoryName };
      categoryStats[q.categoryId].total++;
      if (isCorrect) categoryStats[q.categoryId].correct++;

      // Stats by topic
      if (!topicStats[q.topicId]) topicStats[q.topicId] = { correct: 0, total: 0 };
      topicStats[q.topicId].total++;
      if (isCorrect) topicStats[q.topicId].correct++;

      // Stats by skill
      q.skillIds.forEach(sid => {
        if (!skillStats[sid]) skillStats[sid] = { correct: 0, total: 0 };
        skillStats[sid].total++;
        if (isCorrect) skillStats[sid].correct++;
      });
    });

    const categoryMastery: Record<string, number> = {};
    Object.entries(categoryStats).forEach(([id, stat]) => {
      categoryMastery[id] = Math.round((stat.correct / stat.total) * 100);
    });

    const topicMastery: Record<string, number> = {};
    Object.entries(topicStats).forEach(([id, stat]) => {
      topicMastery[id] = Math.round((stat.correct / stat.total) * 100);
    });

    const skillMastery: Record<string, number> = {};
    Object.entries(skillStats).forEach(([id, stat]) => {
      skillMastery[id] = Math.round((stat.correct / stat.total) * 100);
    });

    const strongTopics = Object.entries(topicMastery)
      .filter(([_, score]) => score >= 70)
      .map(([id, _]) => id);
    
    const weakTopics = Object.entries(topicMastery)
      .filter(([_, score]) => score < 70)
      .map(([id, _]) => id);

    const strongSkills = Object.entries(skillMastery)
      .filter(([_, score]) => score >= 70)
      .map(([id, _]) => id);

    const weakSkills = Object.entries(skillMastery)
      .filter(([_, score]) => score < 70)
      .map(([id, _]) => id);

    return {
      overallScore: Math.round((totalCorrect / allQuestions.length) * 100),
      categoryMastery,
      topicMastery,
      skillMastery,
      strongTopics,
      weakTopics,
      strongSkills,
      weakSkills
    };
  };

  const cooldownEndsAt = lastAttemptAt ? new Date(lastAttemptAt.getTime() + 3 * 24 * 60 * 60 * 1000) : null;
  const isCooldownActive = !!cooldownEndsAt && cooldownEndsAt.getTime() > Date.now();

  if (isLoading) return (
    <div className="min-h-screen bg-surface flex flex-col items-center justify-center p-6 text-center">
       <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mb-6"></div>
       <div className="font-headline text-xl font-bold text-on-surface">Assembling Assessment...</div>
       <div className="text-on-surface-variant mt-2">Checking real-time question bank</div>
    </div>
  );

  if (questions.length === 0) {
    return (
      <div className="p-12 text-center max-w-md mx-auto mt-20">
        <h2 className="text-xl font-bold mb-4">No content available</h2>
        <p className="text-slate-500 mb-6">We don't have enough data to generate a diagnostic test. Talk to your instructor.</p>
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
          <h1 className="text-3xl font-black font-headline text-on-surface mb-4">{attemptCount > 0 ? 'Reassessment' : 'Diagnostic Assessment'}</h1>
          <p className="text-on-surface-variant font-medium mb-8 leading-relaxed">
            {attemptCount > 0
              ? 'This reassessment updates your learning profile and tracks how your mastery changes over time.'
              : 'Welcome to the Let Mastery review process. This diagnostic helps the AI tailor your learning path.'}
          </p>
          {isCooldownActive && (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm font-bold text-amber-700 mb-6">
              You can reassess every 3 days. Next available: {cooldownEndsAt?.toLocaleString()}.
            </div>
          )}
          
          <div className="space-y-4 mb-10">
            <div className="bg-surface-container p-4 rounded-2xl border border-outline-variant/30 flex gap-4 items-start">
               <span className="material-symbols-outlined text-on-surface-variant/40 mt-1">target</span>
               <div>
                 <h3 className="font-bold text-on-surface">Based on your focus</h3>
                 <p className="text-sm text-on-surface-variant/60">
                   {user?.learningMode === 'class_based' 
                     ? "This assessment uses the curriculum assigned by your instructor." 
                     : "This assessment focuses on your selected study area."}
                 </p>
               </div>
            </div>
            <div className="bg-surface-container p-4 rounded-2xl border border-outline-variant/30 flex gap-4 items-start">
               <span className="material-symbols-outlined text-on-surface-variant/40 mt-1">analytics</span>
               <div>
                 <h3 className="font-bold text-on-surface">Personalized Learning Path</h3>
                 <p className="text-sm text-on-surface-variant/60">Your results will not be graded for a score, but will unlock modules based on what you need to study most.</p>
               </div>
            </div>
          </div>

          <button 
            onClick={() => setHasStarted(true)}
            disabled={isCooldownActive}
            className="w-full bg-primary text-on-primary font-bold py-4 px-6 rounded-2xl shadow-lg hover:-translate-y-0.5 transition-transform uppercase tracking-widest text-sm flex items-center justify-center gap-2 disabled:opacity-50"
          >
            Start Assessment <span className="material-symbols-outlined text-lg">arrow_forward</span>
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
          <div className="text-xs font-bold text-on-surface-variant/40">Question {currentIndex + 1} of {questions.length}</div>
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
           {currentQuestion.stem}
         </div>

         <div className="space-y-4">
           {currentQuestion.options.map(opt => (
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
