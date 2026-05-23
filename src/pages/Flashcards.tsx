import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, limit, getDocs, doc, getDoc, updateDoc, arrayUnion, where, serverTimestamp, increment } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ChevronLeft, 
  RotateCcw, 
  CheckCircle2, 
  XCircle, 
  Brain,
  Info,
  ChevronRight,
  TrendingUp,
  Award
} from 'lucide-react';

interface Flashcard {
  id: string;
  stem: string;
  correctAnswer: string;
  explanation?: string;
  categoryName?: string;
}

export default function Flashcards() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sessionXP, setSessionXP] = useState(0);

  useEffect(() => {
    const fetchCards = async () => {
      try {
        if (!user) return;
        
        let focusCategoryId = '';
        let focusTopicId = '';
        
        // 1. Get focus from user profile
        if (user.selectedFocus) {
           const cats = await getDocs(collection(db, 'categories'));
           const matched = cats.docs.find(d => d.id === user.selectedFocus || d.data().title.toLowerCase().includes((user.selectedFocus as string).replace('_', ' ')));
           if (matched) focusCategoryId = matched.id;
        }

        // 2. Fetch questions - prioritize weak topics if available
        let q = query(
          collection(db, 'questions'), 
          where('isPublished', '==', true),
          where('approved', '==', true)
        );

        if (focusCategoryId) {
          q = query(q, where('categoryId', '==', focusCategoryId));
        }

        const snap = await getDocs(q);
        const fetchedCards: Flashcard[] = [];
        
        // Sort by weak topics if we have profile data
        const profileSnap = await getDoc(doc(db, 'learnerProfiles', user.uid));
        const profile = profileSnap.exists() ? profileSnap.data() : null;
        const topicMastery = profile?.masteryByTopic || {};

        for (const d of snap.docs) {
          const data = d.data();
          const correctOption = data.options?.find((o: any) => o.id === data.correctOptionId);
          fetchedCards.push({
            id: d.id,
            stem: data.stem,
            correctAnswer: correctOption?.text || 'N/A',
            explanation: data.explanation || 'Review this concept to master the topic.',
            categoryName: data.categoryName,
            topicId: data.topicId,
            mastery: topicMastery[data.topicId] || 0
          } as any);
        }
        
        // Sort: Weakest first (mastery ascending)
        fetchedCards.sort((a: any, b: any) => a.mastery - b.mastery);
        
        setCards(fetchedCards.slice(0, 20)); // Limit to 20 per session
        setLoading(false);
      } catch (e) {
        console.error('Failed to fetch flashcards', e);
        setLoading(false);
      }
    };
    fetchCards();
  }, [user]);

  const handleNext = async (mastered: boolean) => {
    const currentCard = cards[currentIndex] as any;
    
    if (mastered && user && currentCard.topicId) {
      setSessionXP(prev => prev + 15);
      // Update mastery in background
      try {
        const profileRef = doc(db, 'learnerProfiles', user.uid);
        const pSnap = await getDoc(profileRef);
        if (pSnap.exists()) {
           const pData = pSnap.data();
           const curr = pData.masteryByTopic?.[currentCard.topicId] || 0;
           const newM = Math.min(100, curr + 2); // Small bump for flashcard mastering
           await updateDoc(profileRef, {
             [`masteryByTopic.${currentCard.topicId}`]: newM,
             lastUpdatedAt: serverTimestamp()
           });
        }
      } catch (e) { console.error(e); }
    } else {
      setSessionXP(prev => prev + 5);
    }
    
    setIsFlipped(false);
    if (currentIndex < cards.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      await completeSession();
    }
  };

  const completeSession = async () => {
    if (!user) return;
    try {
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        xp: increment(sessionXP),
        updatedAt: serverTimestamp()
      });
      navigate('/student/dashboard');
    } catch (e) {
      navigate('/student/dashboard');
    }
  };

  if (loading) {
    return (
      <div className="h-screen bg-surface flex flex-col items-center justify-center p-6 text-on-surface">
        <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }} className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full mb-4" />
        <p className="text-[10px] font-bold uppercase tracking-widest opacity-50">Curating deck...</p>
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <div className="h-screen bg-surface flex flex-col items-center justify-center p-6 text-center">
        <Brain size={48} className="text-on-surface-variant/20 mb-4" />
        <h2 className="text-lg font-extrabold text-on-surface mb-2">Deck Empty</h2>
        <button onClick={() => navigate('/student/dashboard')} className="bg-primary text-on-primary px-6 py-2 rounded-xl text-sm font-bold shadow-lg shadow-primary/20">Return Home</button>
      </div>
    );
  }

  const currentCard = cards[currentIndex];
  const progress = ((currentIndex + 1) / cards.length) * 100;

  return (
    <div className="h-screen bg-surface flex flex-col overflow-hidden select-none transition-colors duration-300">
      <header className="px-5 py-3 bg-surface-container-lowest border-b border-outline-variant flex items-center justify-between shrink-0">
        <button onClick={() => navigate('/student/dashboard')} className="p-2 -ml-2 text-on-surface-variant"><ChevronLeft size={20} /></button>
        <div className="text-center">
          <h1 className="text-[10px] font-bold text-on-surface-variant/60 uppercase tracking-[0.2em] mb-0.5">Quick Review</h1>
          <div className="h-1 w-20 bg-surface-container rounded-full overflow-hidden mx-auto">
            <motion.div animate={{ width: `${progress}%` }} className="h-full bg-primary" />
          </div>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-tertiary-container/10 text-on-tertiary-container rounded-lg border border-outline-variant/30 italic">
           <TrendingUp size={12} />
           <span className="text-[10px] font-black">{sessionXP} XP</span>
        </div>
      </header>

      <main className="flex-1 relative flex items-center justify-center p-4 sm:p-8 overflow-hidden">
        {/* Subtle Side Hints */}
        <div 
          onClick={() => handleNext(false)}
          className="absolute left-2 sm:left-6 top-1/2 -translate-y-1/2 opacity-20 hover:opacity-100 flex flex-col items-center cursor-pointer transition-opacity z-20 group"
        >
           <motion.div 
             animate={{ x: [0, -5, 0] }}
             transition={{ repeat: Infinity, duration: 2 }}
             className="group-hover:scale-125 transition-transform"
           >
             <ChevronLeft size={32} className="text-on-surface-variant/30 group-hover:text-primary transition-colors" />
           </motion.div>
           <span className="text-[9px] font-bold uppercase vertical-text mt-2 whitespace-nowrap text-on-surface-variant/40 tracking-tighter group-hover:text-primary transition-colors">Needs Review</span>
        </div>
        
        <div 
          onClick={() => handleNext(true)}
          className="absolute right-2 sm:right-6 top-1/2 -translate-y-1/2 opacity-20 hover:opacity-100 flex flex-col items-center cursor-pointer transition-opacity z-20 group"
        >
           <motion.div 
             animate={{ x: [0, 5, 0] }}
             transition={{ repeat: Infinity, duration: 2 }}
             className="group-hover:scale-125 transition-transform"
           >
             <ChevronRight size={32} className="text-emerald-500/30 group-hover:text-emerald-500 transition-colors" />
           </motion.div>
           <span className="text-[9px] font-bold uppercase vertical-text mt-2 whitespace-nowrap text-emerald-600/40 tracking-tighter group-hover:text-emerald-500 transition-colors">Got It</span>
        </div>

        <div className="w-full max-w-sm h-full max-h-[480px] relative perspective-1000">
           <AnimatePresence mode="wait">
             <motion.div
               key={currentIndex}
               drag="x"
               dragConstraints={{ left: 0, right: 0 }}
               dragElastic={0.7}
               onDragEnd={(_, info) => {
                 if (info.offset.x > 100) handleNext(true);
                 else if (info.offset.x < -100) handleNext(false);
               }}
               initial={{ x: 100, opacity: 0, scale: 0.9, rotate: 5 }}
               animate={{ x: 0, opacity: 1, scale: 1, rotate: 0 }}
               exit={{ x: -100, opacity: 0, scale: 0.9, rotate: -5 }}
               className="w-full h-full relative cursor-grab active:cursor-grabbing"
               onClick={() => setIsFlipped(!isFlipped)}
             >
                <motion.div 
                  className="w-full h-full relative transition-all preserve-3d"
                  animate={{ rotateY: isFlipped ? 180 : 0 }}
                  transition={{ type: 'spring', damping: 20, stiffness: 100 }}
                >
                  {/* Front */}
                  <div className="absolute inset-0 bg-surface-container-lowest rounded-[2.5rem] shadow-2xl border border-outline-variant p-8 flex flex-col backface-hidden">
                     <div className="flex justify-between items-center mb-4">
                        <span className="px-2.5 py-0.5 bg-primary/5 text-primary rounded-lg text-[9px] font-bold tracking-widest border border-primary/10 uppercase">Quiz Item {currentIndex + 1}</span>
                        <Brain size={18} className="text-on-surface-variant/20" />
                     </div>
                     <div className="flex-1 flex items-center justify-center text-center overflow-y-auto px-2 scrollbar-none max-h-[280px]">
                        <h2 className="text-lg sm:text-xl font-bold text-on-surface leading-[1.5] tracking-tight py-4">
                           {currentCard.stem}
                        </h2>
                     </div>
                     <div className="mt-4 pt-4 border-t border-outline-variant text-center">
                        <p className="text-on-surface-variant/30 font-bold text-[9px] uppercase tracking-widest flex items-center justify-center gap-1.5">
                           Touch to reveal answer
                           <RotateCcw size={10} className="rotate-45" />
                        </p>
                     </div>
                  </div>

                  {/* Back */}
                  <div className="absolute inset-0 bg-primary rounded-[2.5rem] shadow-2xl border border-primary p-8 flex flex-col backface-hidden rotate-y-180">
                     <div className="flex justify-between items-center mb-4">
                        <span className="px-2.5 py-0.5 bg-white/10 text-on-primary rounded-lg text-[9px] font-bold tracking-widest border border-white/10">The Answer</span>
                        <Award size={18} className="text-on-primary/20" />
                     </div>
                     <div className="flex-1 flex flex-col justify-center text-center overflow-y-auto px-2 scrollbar-none max-h-[300px]">
                        <h2 className="text-xl sm:text-2xl font-black text-on-primary leading-tight mb-4 tracking-tight py-4">
                           {currentCard.correctAnswer}
                        </h2>
                        {currentCard.explanation && (
                          <div className="p-4 bg-white/5 rounded-2xl border border-white/10 text-left mb-4">
                             <p className="text-[11px] text-on-primary/70 leading-relaxed font-medium">
                                {currentCard.explanation}
                             </p>
                          </div>
                        )}
                     </div>
                     <div className="mt-4 pt-4 border-t border-on-primary/5 text-center">
                        <p className="text-on-primary/30 font-bold text-[9px] uppercase tracking-widest flex items-center justify-center gap-1.5">
                           Tap to show question
                           <RotateCcw size={10} />
                        </p>
                     </div>
                  </div>
                </motion.div>
             </motion.div>
           </AnimatePresence>
        </div>
      </main>

      <footer className="px-6 py-4 flex items-center justify-center gap-6 shrink-0 bg-surface border-t border-outline-variant">
         <button onClick={() => handleNext(false)} className="flex flex-col items-center gap-1.5 opacity-40 hover:opacity-100 transition-opacity">
            <div className="w-11 h-11 bg-surface-container border border-outline-variant rounded-full flex items-center justify-center text-on-surface-variant">
               <ChevronLeft size={20} />
            </div>
            <span className="text-[9px] font-bold uppercase tracking-widest text-on-surface-variant/60">Skip</span>
         </button>
         
         <button 
           onClick={() => setIsFlipped(!isFlipped)}
           className="px-8 py-3 bg-primary rounded-2xl text-on-primary text-[10px] font-black uppercase tracking-[0.2em] shadow-lg shadow-primary/20 active:scale-95 transition-transform"
         >
            Flip Card
         </button>

         <button onClick={() => handleNext(true)} className="flex flex-col items-center gap-1.5 text-emerald-500 hover:scale-105 transition-transform">
            <div className="w-11 h-11 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center">
               <ChevronRight size={20} />
            </div>
            <span className="text-[9px] font-bold uppercase tracking-widest">Mastered</span>
         </button>
      </footer>

      <style>{`
        .vertical-text {
          writing-mode: vertical-rl;
          text-orientation: mixed;
        }
        .perspective-1000 { perspective: 1000px; }
        .preserve-3d { transform-style: preserve-3d; }
        .backface-hidden { backface-visibility: hidden; }
        .rotate-y-180 { transform: rotateY(180deg); }
        .scrollbar-none::-webkit-scrollbar { display: none; }
        .scrollbar-none { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
}
