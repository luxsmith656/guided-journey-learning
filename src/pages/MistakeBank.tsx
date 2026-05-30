import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { AlertTriangle, BookOpen, CheckCircle2, Filter, Lightbulb, RefreshCcw, Search, Target } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import StudentLayout from '../components/StudentLayout';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/firebase';

function toDate(value: any): Date | null {
  if (!value) return null;
  const date = value?.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

const categoryLabels: Record<string, string> = {
  gened: 'General Education',
  profed: 'Professional Education',
  major: 'Field of Specialization',
};

function humanizeId(value = '') {
  return value
    .replace(/^gened_/, '')
    .replace(/^profed_/, '')
    .replace(/^major_/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getRepairGroups(mistakes: any[]) {
  const groups = new Map<string, any>();
  mistakes.forEach((mistake) => {
    const key = `${mistake.categoryId || 'uncategorized'}:${mistake.topicId || 'general'}:${mistake.competencyId || 'core'}`;
    const current = groups.get(key) || {
      key,
      categoryId: mistake.categoryId || 'uncategorized',
      topicId: mistake.topicId || '',
      competencyId: mistake.competencyId || '',
      relatedModuleId: mistake.relatedModuleId || '',
      missedCount: 0,
      repeatedCount: 0,
      misconceptionTags: new Set<string>(),
      sampleStem: mistake.stem || '',
      latestMissedAt: toDate(mistake.lastMissedAt)?.getTime() || 0,
    };
    current.missedCount += 1;
    current.repeatedCount += Math.max(0, Number(mistake.timesMissed || 1) - 1);
    current.relatedModuleId ||= mistake.relatedModuleId || '';
    current.sampleStem ||= mistake.stem || '';
    current.latestMissedAt = Math.max(current.latestMissedAt, toDate(mistake.lastMissedAt)?.getTime() || 0);
    (mistake.misconceptionTags || []).forEach((tag: string) => current.misconceptionTags.add(tag));
    groups.set(key, current);
  });

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      misconceptionTags: Array.from(group.misconceptionTags),
      priorityScore: group.missedCount * 2 + group.repeatedCount,
    }))
    .sort((a, b) => b.priorityScore - a.priorityScore || b.latestMissedAt - a.latestMissedAt)
    .slice(0, 4);
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
  const repairGroups = useMemo(() => getRepairGroups(mistakes), [mistakes]);

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

        {!isLoading && repairGroups.length > 0 && (
          <section className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-5 md:p-6 shadow-sm">
            <div className="flex items-start gap-3 mb-5">
              <div className="rounded-xl bg-primary/10 p-3 text-primary">
                <Target size={22} />
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-primary">Repair plan</p>
                <h2 className="mt-1 text-xl font-extrabold font-headline text-on-surface">Fix the weak areas before another full mock.</h2>
                <p className="mt-1 text-sm text-on-surface-variant">These are built from your saved wrong answers, repeated misses, competencies, and misconception tags.</p>
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              {repairGroups.map((group) => {
                const categoryLabel = categoryLabels[group.categoryId] || humanizeId(group.categoryId);
                const topicLabel = group.topicId ? humanizeId(group.topicId) : 'General review';
                const competencyLabel = group.competencyId ? humanizeId(group.competencyId) : topicLabel;
                const misconceptionLabel = group.misconceptionTags[0] ? humanizeId(group.misconceptionTags[0]) : 'Core misconception';
                return (
                  <article key={group.key} className="rounded-2xl border border-outline-variant/40 bg-surface-container/30 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-primary">{categoryLabel}</p>
                        <h3 className="mt-1 font-extrabold text-on-surface">{topicLabel}</h3>
                      </div>
                      <span className="rounded-full bg-error/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-error">
                        {group.missedCount} item{group.missedCount === 1 ? '' : 's'}
                      </span>
                    </div>
                    <p className="mt-3 text-sm leading-relaxed text-on-surface-variant">
                      You are weak in {categoryLabel}: {topicLabel}, especially {competencyLabel}. Likely misconception: {misconceptionLabel}. Review the module, then answer a targeted repair drill.
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {group.relatedModuleId && (
                        <button onClick={() => navigate(`/quest?moduleId=${group.relatedModuleId}`)} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-on-primary">
                          <BookOpen size={14} />
                          Review module
                        </button>
                      )}
                      <button onClick={() => navigate(`/exam?type=practice&category=${group.categoryId || ''}&topic=${group.topicId || ''}`)} className="inline-flex items-center gap-2 rounded-xl border border-outline-variant bg-surface-container px-4 py-2.5 text-xs font-bold text-on-surface">
                        <RefreshCcw size={14} />
                        Repair drill
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
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
            const selectedExplanation = mistake.wrongChoiceExplanations?.[mistake.selectedOptionId] || '';
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
                    {(mistake.competencyId || mistake.difficulty || mistake.misconceptionTags?.length) && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {mistake.competencyId && <span className="rounded-full bg-primary/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-primary">Competency: {humanizeId(mistake.competencyId)}</span>}
                        {mistake.difficulty && <span className="rounded-full bg-surface-container px-3 py-1 text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Difficulty: {mistake.difficulty}</span>}
                        {(mistake.misconceptionTags || []).slice(0, 3).map((tag: string) => (
                          <span key={tag} className="rounded-full bg-warning/20 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-on-surface">Misconception: {humanizeId(tag)}</span>
                        ))}
                      </div>
                    )}
                    {selectedExplanation && (
                      <div className="mt-4 rounded-xl border border-warning/30 bg-warning/10 p-3">
                        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-on-surface">
                          <Lightbulb size={14} />
                          Why your answer missed
                        </div>
                        <p className="mt-1 text-sm text-on-surface-variant leading-relaxed">{selectedExplanation}</p>
                      </div>
                    )}
                    {mistake.explanation && (
                      <div className="mt-4 rounded-xl border border-outline-variant/30 bg-surface-container/30 p-3">
                        <p className="text-[10px] font-black uppercase tracking-widest text-primary">Rationalization</p>
                        <p className="mt-1 text-sm text-on-surface-variant leading-relaxed">{mistake.explanation}</p>
                      </div>
                    )}
                  </div>

                  <div className="flex lg:flex-col gap-2 shrink-0">
                    <button
                      onClick={() => navigate(`/exam?type=practice&category=${mistake.categoryId || ''}&topic=${mistake.topicId || ''}`)}
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
