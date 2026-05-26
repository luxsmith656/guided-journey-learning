import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { AlertTriangle, BookOpen, CheckCircle2, Filter, RefreshCcw, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import StudentLayout from '../components/StudentLayout';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/firebase';

function toDate(value: any): Date | null {
  if (!value) return null;
  const date = value?.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export default function MistakeBank() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [mistakes, setMistakes] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  useEffect(() => {
    const fetchMistakes = async () => {
      if (!user) return;
      setIsLoading(true);
      try {
        const mistakeSnap = await getDocs(query(collection(db, 'mistakeBank'), where('userId', '==', user.uid)));
        setMistakes(mistakeSnap.docs.map((mistakeDoc) => ({ id: mistakeDoc.id, ...mistakeDoc.data() }))
          .sort((a: any, b: any) => (toDate(b.lastMissedAt)?.getTime() || 0) - (toDate(a.lastMissedAt)?.getTime() || 0)));
      } catch (error) {
        console.error('Unable to load mistake bank', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchMistakes();
  }, [user]);

  const categories = useMemo(() => {
    const values = new Set(mistakes.map((mistake) => mistake.categoryId || 'uncategorized'));
    return ['all', ...Array.from(values)];
  }, [mistakes]);

  const filteredMistakes = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return mistakes.filter((mistake) => {
      const matchesCategory = categoryFilter === 'all' || (mistake.categoryId || 'uncategorized') === categoryFilter;
      const text = `${mistake.stem || ''} ${mistake.topicId || ''} ${mistake.categoryId || ''}`.toLowerCase();
      return matchesCategory && (!term || text.includes(term));
    });
  }, [mistakes, searchTerm, categoryFilter]);

  const repeatedMistakes = mistakes.filter((mistake) => Number(mistake.timesMissed || 0) > 1).length;

  return (
    <StudentLayout title="Mistake Bank">
      <div className="space-y-6 pb-20 md:pb-0">
        <section className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-5 md:p-6 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
            <div className="max-w-2xl">
              <div className="flex items-center gap-2 text-primary text-xs font-black uppercase tracking-widest mb-2">
                <AlertTriangle size={16} />
                Personal review path
              </div>
              <h1 className="text-2xl md:text-3xl font-extrabold font-headline">Mistake Bank</h1>
              <p className="text-sm text-on-surface-variant mt-2">
                Wrong answers from diagnostics, drills, and mock exams are saved here with rationalizations so mistakes become your next study plan.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3 min-w-full lg:min-w-[360px]">
              <Stat label="Saved" value={mistakes.length} />
              <Stat label="Repeated" value={repeatedMistakes} />
              <Stat label="Categories" value={Math.max(0, categories.length - 1)} />
            </div>
          </div>
        </section>

        <section className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-4 shadow-sm">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/40" size={16} />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search question, topic, or category"
                className="w-full rounded-xl border border-outline-variant/30 bg-surface-container py-3 pl-10 pr-3 text-sm font-medium outline-none focus:border-primary/40"
              />
            </div>
            <div className="relative md:w-64">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/40" size={16} />
              <select
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
                className="w-full appearance-none rounded-xl border border-outline-variant/30 bg-surface-container py-3 pl-10 pr-3 text-sm font-black outline-none focus:border-primary/40"
              >
                {categories.map((category) => (
                  <option key={category} value={category}>{category === 'all' ? 'All categories' : category}</option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {isLoading && (
          <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-10 text-center text-sm font-bold text-on-surface-variant">
            Loading saved mistakes...
          </div>
        )}

        {!isLoading && filteredMistakes.length === 0 && (
          <div className="bg-surface-container-lowest border border-dashed border-outline-variant rounded-2xl p-10 text-center shadow-sm">
            <CheckCircle2 className="mx-auto text-emerald-500 mb-3" size={42} />
            <h2 className="font-extrabold text-on-surface">{mistakes.length ? 'No mistakes match this filter.' : 'No mistakes saved yet.'}</h2>
            <p className="text-sm text-on-surface-variant mt-2">
              Take a diagnostic, practice drill, or mock exam. Incorrect answers will appear here automatically.
            </p>
            <button onClick={() => navigate('/exam?type=mock')} className="mt-5 rounded-xl bg-primary text-on-primary px-5 py-3 text-sm font-bold">
              Start mock exam
            </button>
          </div>
        )}

        <section className="space-y-4">
          {filteredMistakes.map((mistake) => {
            const selectedText = mistake.options?.find((option: any) => option.id === mistake.selectedOptionId)?.text || mistake.selectedOptionText || mistake.selectedOptionId;
            const correctText = mistake.options?.find((option: any) => option.id === mistake.correctOptionId)?.text || mistake.correctOptionText || mistake.correctOptionId;
            return (
              <article key={mistake.id} className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-5 shadow-sm">
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap gap-2 mb-3">
                      <span className="rounded-full bg-primary/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-primary">{mistake.categoryId || 'uncategorized'}</span>
                      {mistake.topicId && <span className="rounded-full bg-surface-container px-3 py-1 text-[10px] font-black uppercase tracking-widest text-on-surface-variant">{mistake.topicId}</span>}
                      <span className="rounded-full bg-error/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-error">Missed {mistake.timesMissed || 1}x</span>
                    </div>
                    <h2 className="font-extrabold text-on-surface leading-snug">{mistake.stem || 'Question text unavailable'}</h2>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <div className="rounded-xl border border-error/20 bg-error/10 p-3">
                        <p className="text-[10px] font-black uppercase tracking-widest text-error">Your answer</p>
                        <p className="mt-1 text-sm font-bold text-on-surface">{selectedText || 'No answer saved'}</p>
                      </div>
                      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3">
                        <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700">Correct answer</p>
                        <p className="mt-1 text-sm font-bold text-on-surface">{correctText || 'Not available'}</p>
                      </div>
                    </div>
                    {mistake.explanation && (
                      <div className="mt-4 rounded-xl border border-outline-variant/30 bg-surface-container/30 p-3">
                        <p className="text-[10px] font-black uppercase tracking-widest text-primary">Rationalization</p>
                        <p className="mt-1 text-sm text-on-surface-variant leading-relaxed">{mistake.explanation}</p>
                      </div>
                    )}
                  </div>

                  <div className="flex lg:flex-col gap-2 shrink-0">
                    <button
                      onClick={() => navigate(`/exam?type=practice&category=${mistake.categoryId || ''}`)}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary text-on-primary px-4 py-3 text-sm font-bold"
                    >
                      <RefreshCcw size={15} />
                      Retry topic
                    </button>
                    {mistake.relatedModuleId && (
                      <button
                        onClick={() => navigate(`/quest?moduleId=${mistake.relatedModuleId}`)}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-surface-container text-on-surface px-4 py-3 text-sm font-bold border border-outline-variant"
                      >
                        <BookOpen size={15} />
                        Review module
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      </div>
    </StudentLayout>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-outline-variant/40 bg-surface-container p-4">
      <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/50">{label}</p>
      <p className="mt-1 text-2xl font-black text-on-surface">{value}</p>
    </div>
  );
}
