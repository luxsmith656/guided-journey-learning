import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { OfflineData } from '../lib/offline/offlineData';
import { ChevronRight, ArrowLeft } from 'lucide-react';

import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';

import { useSearchParams } from 'react-router-dom';
import { updateDoc, serverTimestamp } from 'firebase/firestore';

export default function LearningQuest() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const moduleId = searchParams.get('moduleId');
  
  const { user } = useAuth();
  const [step, setStep] = useState<'hook' | 'lesson' | 'check' | 'challenge' | 'complete'>('hook');
  const [module, setModule] = useState<any>(null);
  const [topicName, setTopicName] = useState('Learning Quest');
  const [questions, setQuestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [challengeScore, setChallengeScore] = useState(0);
  // Quick check state
  const [checkAnswer, setCheckAnswer] = useState<string | null>(null);
  
  // Challenge state
  const [challengeIndex, setChallengeIndex] = useState(0);
  const [challengeAnswers, setChallengeAnswers] = useState<Record<string, string>>({});

  useEffect(() => {
    async function loadContent() {
      try {
        let activeModule = null;
        let mid = moduleId;

        if (!mid && user) {
          const profileSnap = await getDoc(doc(db, 'learnerProfiles', user.uid));
          if (profileSnap.exists()) {
             const p = profileSnap.data();
             mid = p.nextRecommendedModuleId || (p.recommendedModuleIds && p.recommendedModuleIds[0]);
          }
        }

        if (mid) {
          const modSnap = await getDoc(doc(db, 'modules', mid));
          if (modSnap.exists()) {
            activeModule = { id: modSnap.id, ...modSnap.data() } as any;
            setModule(activeModule);
            setTopicName(activeModule.title);
            
            // Load questions for challenge
            if (activeModule.questionIds && activeModule.questionIds.length > 0) {
              const qs: any[] = [];
              for (const qid of activeModule.questionIds as string[]) {
                const qSnap = await getDoc(doc(db, 'questions', qid));
                if (qSnap.exists()) qs.push({ id: qSnap.id, ...qSnap.data() });
              }
              setQuestions(qs);
            }
          }
        }

        if (!activeModule) {
           // Fallback to offline categories if no module found
           const qs = await OfflineData.getRandomQuestions('general_education', 5);
           setQuestions(qs);
        }
      } catch (err) {
        console.error(err);
      } finally {
         setLoading(false);
      }
    }
    loadContent();
  }, [user, moduleId]);

  const handleQuestComplete = async () => {
    if (!user || !module) {
      navigate('/student/dashboard');
      return;
    }

    try {
      // Save Progress
      const progressRef = doc(db, 'moduleProgress', `${user.uid}_${module.id}`);
      await setDoc(progressRef, {
        userId: user.uid,
        moduleId: module.id,
        status: 'completed',
        completedAt: serverTimestamp(),
        lastAccessedAt: serverTimestamp()
      }, { merge: true });

      // Update Learner Profile - award mastery for this module's topic
      const profileRef = doc(db, 'learnerProfiles', user.uid);
      const profileSnap = await getDoc(profileRef);
      if (profileSnap.exists()) {
         const p = profileSnap.data();
         const topicId = module.topicId;
         const currentMastery = p.masteryByTopic?.[topicId] || 0;
         const newMastery = Math.min(100, currentMastery + 10); // Simple gain
         
         await updateDoc(profileRef, {
            [`masteryByTopic.${topicId}`]: newMastery,
            lastUpdatedAt: serverTimestamp()
         });
      }

      setStep('complete');
    } catch (e) {
      console.error('Failed to complete quest', e);
      setStep('complete');
    }
  };

  const handleQuickCheck = (id: string, isCorrect: boolean) => {
    setCheckAnswer(id);
    setTimeout(() => {
       setStep('challenge');
    }, 1500);
  };

  const handleChallengeAction = async (optId: string) => {
    if (challengeIndex >= questions.length - 1) { 
       await handleQuestComplete();
    } else {
       setChallengeAnswers(p => ({ ...p, [questions[challengeIndex + 1].id]: optId }));
       setChallengeIndex(c => c + 1);
    }
  };

  if (loading) return <div className="p-12 text-center text-[#1b366a] font-bold">Loading Quest...</div>;
  if (questions.length < 2) return <div className="p-12 text-center">Not enough data to start a quest. Sync first.</div>;

  const renderContent = () => {
    switch (step) {
      case 'hook':
        return (
          <motion.div initial={{opacity:0, y:20}} animate={{opacity:1, y:0}} exit={{opacity:0, y:-20}} className="space-y-6">
            <div className="bg-indigo-50 border-l-4 border-indigo-500 p-6 rounded-r-2xl">
              <h2 className="text-xl font-bold text-indigo-900 mb-2">Did you know?</h2>
              <p className="text-indigo-800">Effective teachers don't just know their subjects; they know how to translate that knowledge into engaging learning experiences. This quest will sharpen your {topicName} mastery.</p>
            </div>
            <button onClick={() => setStep('lesson')} className="bg-[#1b366a] text-white px-6 py-3 rounded-xl font-bold flex items-center justify-between w-full shadow-md">
               <span>Start Mini-Lesson</span>
               <ChevronRight size={18} />
            </button>
          </motion.div>
        );
      case 'lesson':
        return (
          <motion.div initial={{opacity:0, y:20}} animate={{opacity:1, y:0}} exit={{opacity:0, y:-20}} className="space-y-6">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <h2 className="text-2xl font-extrabold text-[#1b366a] mb-4">{module?.title || topicName}</h2>
              {module?.lessonBlocks && module.lessonBlocks.length > 0 ? (
                <div className="space-y-4">
                  {module.lessonBlocks.map((block: any, idx: number) => (
                    <div key={idx} className="text-slate-600 leading-relaxed">
                      {block.type === 'text' && <p>{block.content}</p>}
                      {block.type === 'heading' && <h4 className="font-bold text-slate-800 text-lg mt-4">{block.content}</h4>}
                      {block.type === 'quote' && <blockquote className="border-l-4 border-primary/20 pl-4 py-1 italic bg-primary/5 rounded-r-lg">{block.content}</blockquote>}
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  <p className="text-slate-600 mb-4 leading-relaxed">
                    The primary purpose of assessment is not accountability but rather to improve student learning. Constructive alignment is the key: ensuring your objectives, instructional activities, and assessments all align.
                  </p>
                  <p className="text-slate-600 leading-relaxed font-medium">
                    Keep an eye out for "distractors" in the board exam that sound highly technical but don't align with the core philosophy of learner-centered education.
                  </p>
                </>
              )}
            </div>
            <button onClick={() => setStep('check')} className="bg-[#1b366a] text-white px-6 py-3 rounded-xl font-bold flex items-center justify-between w-full shadow-md">
               <span>Take Quick Check</span>
               <ChevronRight size={18} />
            </button>
          </motion.div>
        );
      case 'check':
        const qCheck = questions[0];
        return (
          <motion.div initial={{opacity:0, y:20}} animate={{opacity:1, y:0}} exit={{opacity:0, y:-20}} className="space-y-6">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
               <span className="text-xs font-bold uppercase tracking-widest text-emerald-500 mb-2 block">Quick Check</span>
               <h2 className="text-xl font-bold text-slate-800 mb-6">{qCheck.stem}</h2>
               <div className="space-y-3">
                 {qCheck.options?.map((opt: any) => {
                   let style = "border-slate-200 text-slate-700 bg-white hover:border-blue-300 hover:bg-blue-50";
                   if (checkAnswer === opt.id) {
                     style = opt.id === qCheck.correctOptionId ? "border-emerald-500 bg-emerald-50 text-emerald-800" : "border-red-500 bg-red-50 text-red-800";
                   } else if (checkAnswer && opt.id === qCheck.correctOptionId) {
                     style = "border-emerald-500 bg-emerald-50 text-emerald-800";
                   }
                   return (
                     <button 
                       key={opt.id} 
                       disabled={!!checkAnswer}
                       onClick={() => handleQuickCheck(opt.id, opt.id === qCheck.correctOptionId)}
                       className={`w-full text-left p-4 rounded-xl border-2 font-semibold transition-all ${style}`}
                     >
                       {opt.text}
                     </button>
                   );
                 })}
               </div>
               {checkAnswer && (
                 <motion.p initial={{opacity:0}} animate={{opacity:1}} className={`mt-4 text-sm font-bold ${checkAnswer === qCheck.correctOptionId ? 'text-emerald-600' : 'text-red-600'}`}>
                   {checkAnswer === qCheck.correctOptionId ? 'Great job! Moving to challenge...' : 'Review the concept. Moving to challenge...'}
                 </motion.p>
               )}
            </div>
          </motion.div>
        );
      case 'challenge':
        const qChallenge = questions[challengeIndex + 1];
        if (!qChallenge) return null;
        return (
          <motion.div initial={{opacity:0, y:20}} animate={{opacity:1, y:0}} exit={{opacity:0, y:-20}} className="space-y-6">
            <div className="bg-[#1b366a] p-6 rounded-2xl shadow-lg shadow-blue-900/20 text-white relative overflow-hidden">
               <div className="absolute top-0 right-0 p-4 opacity-10 font-black text-6xl italic">?</div>
               <span className="text-[10px] font-bold uppercase tracking-widest text-amber-300 mb-2 block relative z-10">Quest Challenge {challengeIndex + 1}/{questions.length - 1}</span>
               <h2 className="text-xl font-bold mb-6 relative z-10 leading-relaxed">{qChallenge.stem}</h2>
               <div className="space-y-3 relative z-10">
                 {qChallenge.options?.map((opt: any) => (
                    <button 
                      key={opt.id} 
                      onClick={() => handleChallengeAction(opt.id)}
                      className="w-full text-left p-4 rounded-xl border border-white/20 bg-white/10 hover:bg-white/20 text-white font-semibold transition-all"
                    >
                      {opt.text}
                    </button>
                 ))}
               </div>
            </div>
          </motion.div>
        );
      case 'complete':
        return (
          <motion.div initial={{opacity:0, y:20}} animate={{opacity:1, y:0}} className="text-center bg-white p-10 rounded-3xl border border-slate-200 shadow-sm mt-8">
             <div className="w-20 h-20 bg-emerald-100 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-6">
               <span className="material-symbols-outlined text-[40px]">workspace_premium</span>
             </div>
             <h2 className="text-2xl font-black font-headline text-slate-800 mb-2">Quest Completed!</h2>
             <p className="text-slate-500 mb-8 max-w-sm mx-auto">You've gained valuable points in Professional Education. Keep up the momentum!</p>
             <button onClick={() => navigate('/student/dashboard')} className="bg-[#1b366a] text-white px-8 py-3 rounded-xl font-bold shadow-lg shadow-blue-900/20">
               Return to Dashboard
             </button>
          </motion.div>
        )
    }
  }

  return (
    <div className="bg-[#f0f2f5] min-h-screen p-4 md:p-8 flex flex-col font-body">
      <header className="max-w-2xl mx-auto w-full flex items-center gap-4 mb-8">
        <button onClick={() => navigate('/student/dashboard')} className="p-2 bg-white rounded-full text-slate-400 hover:text-slate-800 border border-slate-200 shadow-sm">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-xl font-extrabold text-slate-800 tracking-tight font-headline">Daily Learning Quest</h1>
          <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Mini-Module</p>
        </div>
      </header>
      
      <main className="max-w-xl mx-auto w-full flex-1">
        <AnimatePresence mode="wait">
           {renderContent()}
        </AnimatePresence>
      </main>
    </div>
  );
}
