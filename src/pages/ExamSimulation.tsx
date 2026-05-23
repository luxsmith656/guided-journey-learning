import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { OfflineData } from '../lib/offline/offlineData';
import { useAuth } from '../context/AuthContext';

interface Question {
  id: string;
  stem: string;
  options: { id: string; text: string }[];
  correctOptionId: string;
  categoryId?: string;
  topicId?: string;
  skillIds?: string[];
  explanation?: string;
}

export default function ExamSimulation() {
  const [searchParams] = useSearchParams();
  const categoryId = searchParams.get('category');
  const navigate = useNavigate();
  const { user, signOut } = useAuth();

  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [userAnswers, setUserAnswers] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [timeRemaining, setTimeRemaining] = useState(3600); // 1 hour

  useEffect(() => {
    const fetchQuestions = async () => {
      try {
        let fetched: any[] = [];
        const isMock = searchParams.get('type') === 'mock';
        
        const { collection, getDocs, query, where, limit } = await import('firebase/firestore');
        const { db } = await import('../lib/firebase');

        let qQuery;
        const studentFocus = user?.selectedFocus;
        const classFocus = user?.activeClassId ? 'major' : null; // Simplified logic, real focus might be better
        const effectiveFocus = studentFocus || classFocus;

        if (categoryId) {
          qQuery = query(
            collection(db, 'questions'),
            where('categoryId', '==', categoryId),
            where('isPublished', '==', true),
            where('approved', '==', true)
          );
        } else if (isMock) {
          // If mock, first try to get mock_exam questions
          qQuery = query(
            collection(db, 'questions'),
            where('type', '==', 'mock_exam'),
            where('isPublished', '==', true),
            where('approved', '==', true)
          );
        } else {
          // Regular practice exam
          qQuery = query(
            collection(db, 'questions'),
            where('isPublished', '==', true),
            where('approved', '==', true),
            limit(100)
          );
        }

        const qSnap = await getDocs(qQuery);
        let allPool: Question[] = [];
        qSnap.forEach(snap => {
          const d = snap.data() as any;
          // Filter by focus if applicable
          if (effectiveFocus && d.categoryId !== effectiveFocus && d.categoryId !== 'gened' && d.categoryId !== 'profed') {
             // Skip if not in focus unless it's gened/profed (common domains)
             return;
          }
          allPool.push({ id: snap.id, ...d } as Question);
        });

        // Backup plan for Mock Exam: pull from practice if needed
        if (isMock && allPool.length < 50) {
           const backupQ = query(
             collection(db, 'questions'),
             where('type', '==', 'practice'),
             where('isPublished', '==', true),
             where('approved', '==', true),
             limit(100)
           );
           const bSnap = await getDocs(backupQ);
           bSnap.forEach(snap => {
             const data = snap.data() as any;
             if (!allPool.find(f => f.id === snap.id)) {
                allPool.push({ id: snap.id, ...data } as Question);
             }
           });
        }
        
        // Shuffle
        allPool.sort(() => 0.5 - Math.random());
        const finalFetched = isMock ? allPool.slice(0, 50) : allPool.slice(0, 20);
        setQuestions(finalFetched);
      } catch (error) {
        console.error('Failed to load questions', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchQuestions();
  }, [categoryId, searchParams]);

  useEffect(() => {
    if (questions.length > 0) {
      const timer = setInterval(() => {
        setTimeRemaining(prev => (prev > 0 ? prev - 1 : 0));
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [questions]);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const currentQuestion = questions[currentIndex];

  const handleNext = async () => {
    if (!selectedOption || !currentQuestion) return;

    const newAnswers = { ...userAnswers, [currentQuestion.id]: selectedOption };
    setUserAnswers(newAnswers);

    const compileResults = async (finalAnswers: Record<string, string>) => {
      setIsLoading(true);
      const correctCount = Object.entries(finalAnswers).reduce((acc, [qid, ans]) => {
        const q = questions.find(qu => qu.id === qid);
        return q && ans === q.correctOptionId ? acc + 1 : acc;
      }, 0);
      
      const scorePercent = Math.round((correctCount / questions.length) * 100);
      const isMock = searchParams.get('type') === 'mock';

      try {
        const { collection, doc, setDoc, serverTimestamp, getDoc, updateDoc } = await import('firebase/firestore');
        const { db } = await import('../lib/firebase');

        const attemptId = doc(collection(db, 'mockExamAttempts')).id;
        const attemptRef = doc(db, 'mockExamAttempts', attemptId);
        
        const answerRecords = Object.entries(finalAnswers).map(([qid, oid]) => {
           const q = questions.find(qu => qu.id === qid);
           return {
             questionId: qid,
             selectedOptionId: oid,
             correctOptionId: q?.correctOptionId || '',
             isCorrect: oid === q?.correctOptionId,
             categoryId: q?.categoryId || '',
             topicId: q?.topicId || '',
             skillIds: q?.skillIds || [],
             timeSpentSeconds: 0 // Simplification
           };
        });

        await setDoc(attemptRef, {
          id: attemptId,
          userId: user?.uid,
          type: isMock ? 'mock_exam' : 'practice_exam',
          mode: user?.learningMode || 'self_review',
          scorePercent,
          totalQuestions: questions.length,
          correctCount,
          answers: answerRecords,
          completedAt: serverTimestamp()
        });

        // Update Mastery in Learner Profile
        const profileRef = doc(db, 'learnerProfiles', user!.uid);
        const profileSnap = await getDoc(profileRef);
        if (profileSnap.exists()) {
           const p = profileSnap.data();
           // Simplified mastery update: weighted integration of this score
           const newOverall = Math.round((p.overallScore * 0.7) + (scorePercent * 0.3));
           await updateDoc(profileRef, {
              overallScore: newOverall,
              lastUpdatedAt: serverTimestamp()
           });
        }

        // Recompute per-topic mastery & adaptive recommendations (best-effort, non-blocking)
        try {
          const { updateMasteryAndRecommend } = await import('../lib/adaptiveEngine');
          await updateMasteryAndRecommend({
            userId: user!.uid,
            answers: answerRecords.map((r: any) => ({
              questionId: r.questionId,
              selectedOptionId: r.selectedOptionId,
              correctOptionId: r.correctOptionId,
              isCorrect: r.isCorrect,
              categoryId: r.categoryId,
              topicId: r.topicId,
              skillIds: r.skillIds,
            })),
          });
        } catch (e) {
          console.warn('adaptive update failed', e);
        }
        
        navigate('/quiz-results', { 
           state: { 
             attemptId, 
             scorePercent, 
             total: questions.length, 
             correct: correctCount,
             questions, 
             answers: finalAnswers 
           } 
        });
      } catch (e) {
        console.error('Failed to save exam results', e);
        // Fallback with route state only
        navigate('/quiz-results', { 
           state: { 
             scorePercent, 
             total: questions.length, 
             correct: correctCount,
             questions, 
             answers: finalAnswers 
           } 
        });
      }
    };

    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setSelectedOption(newAnswers[questions[currentIndex + 1]?.id] || null);
    } else {
      await compileResults(newAnswers);
    }
  };

  useEffect(() => {
    if (questions.length > 0 && timeRemaining === 0) {
       // Auto-submit
       const handleAutoSubmit = async () => {
         await handleNext(); // This will trigger compileResults with whatever is in userAnswers
       };
       handleAutoSubmit();
    }
  }, [timeRemaining, questions.length]);

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      setSelectedOption(userAnswers[questions[currentIndex - 1].id] || null);
    }
  };

  if (isLoading) return (
    <div className="p-12 text-center bg-surface min-h-screen flex flex-col items-center justify-center">
       <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4"></div>
       <p className="text-on-surface-variant font-bold">Synchronizing exam content...</p>
    </div>
  );

  if (questions.length === 0) return (
    <div className="p-12 text-center max-w-md mx-auto min-h-screen flex flex-col items-center justify-center">
      <div className="w-16 h-16 bg-surface-container rounded-2xl flex items-center justify-center mb-6 text-on-surface-variant/20">
         <span className="material-symbols-outlined text-4xl">extension_off</span>
      </div>
      <h2 className="text-xl font-bold mb-4">No questions found</h2>
      <p className="text-slate-500 mb-6">There are no published questions in this category. Content is synced periodically from the main server.</p>
      <button onClick={() => navigate('/focus')} className="bg-[#1b366a] text-white px-6 py-2 rounded-xl font-bold">Go Back</button>
    </div>
  );

  return (
    <div className="bg-surface text-on-surface font-body min-h-[100dvh] flex flex-col antialiased relative">
       <header className="px-5 py-4 flex items-center justify-between bg-surface-container-lowest border-b border-outline-variant sticky top-0 z-20">
          <div className="flex items-center gap-3">
             <button onClick={() => navigate('/focus')} className="text-on-surface-variant/40 hover:text-on-surface transition-colors hover:scale-110 active:scale-95">
                <span className="material-symbols-outlined">close</span>
             </button>
             <div className="bg-surface-container px-3 py-1.5 rounded-xl text-xs font-bold font-mono text-on-surface-variant flex items-center gap-1.5 border border-outline-variant/30">
                <span className="w-2 h-2 rounded-full bg-error animate-pulse"></span>
                {formatTime(timeRemaining)}
             </div>
          </div>
          <div className="font-bold text-[11px] tracking-widest text-primary uppercase">
             Question <span className="text-lg tabular-nums">{currentIndex + 1}</span> / {questions.length}
          </div>
          <button 
            onClick={() => {
              signOut();
              navigate('/sign-in');
            }}
            className="w-10 h-10 flex items-center justify-center rounded-full text-on-surface-variant/40 hover:bg-surface-container transition-colors"
            title="Sign Out"
          >
             <span className="material-symbols-outlined">logout</span>
          </button>
       </header>

       <div className="flex-1 flex flex-col max-w-2xl mx-auto w-full px-5 py-8">
          <div className="flex items-center gap-2 mb-6">
             <span className="bg-primary/10 text-primary px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border border-primary/10">Simulation Mode</span>
          </div>

          <div className="text-on-surface font-headline text-xl mb-10 leading-snug font-extrabold tracking-tight">
             {currentQuestion.stem}
          </div>

          <div className="flex-1 space-y-4">
             {currentQuestion.options.map((opt) => {
               const isSelected = selectedOption === opt.id;
               return (
                 <button
                   key={opt.id}
                   onClick={() => setSelectedOption(opt.id)}
                   className={`w-full p-5 rounded-2xl border-2 flex items-start gap-4 transition-all text-left ${
                     isSelected 
                       ? 'border-primary bg-primary/10 shadow-sm' 
                       : 'border-outline-variant/10 bg-surface-container/30 hover:border-primary/50'
                   }`}
                 >
                   <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 font-bold text-sm transition-colors ${
                     isSelected ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant/40'
                   }`}>
                      {opt.id}
                   </div>
                   <span className={`font-bold text-[15px] pt-1 leading-snug ${isSelected ? 'text-primary' : 'text-on-surface-variant'}`}>
                     {opt.text}
                   </span>
                 </button>
               );
             })}
          </div>
       </div>

       <div className="bg-surface-container-lowest border-t border-outline-variant p-5 flex justify-between items-center sticky bottom-0 z-20">
          <button 
            disabled={currentIndex === 0}
            onClick={handlePrevious}
            className="px-6 py-3 rounded-xl font-bold text-on-surface-variant/40 hover:text-on-surface hover:bg-surface-container transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
          >
             Previous
          </button>
          <button 
            disabled={!selectedOption}
            onClick={handleNext}
            className="px-10 py-4 rounded-2xl bg-primary text-on-primary font-bold shadow-lg shadow-primary/20 disabled:opacity-50 disabled:shadow-none transition-all text-xs uppercase tracking-widest flex items-center gap-2"
          >
             {currentIndex === questions.length - 1 ? 'Finish Exam' : 'Next Question'}
             <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
          </button>
       </div>
    </div>
  );
}
