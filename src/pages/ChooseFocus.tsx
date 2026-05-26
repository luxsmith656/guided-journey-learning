import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { ArrowLeft, BookOpenCheck, CalendarDays, GraduationCap, School, UserRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/firebase';

type ReviewMode = 'self_review' | 'class_based';
type ReviewTrack = 'elementary' | 'secondary' | 'specialization';

const trackOptions: { id: ReviewTrack; title: string; body: string }[] = [
  {
    id: 'elementary',
    title: 'Elementary LET',
    body: 'General Education and Professional Education review without a secondary major.',
  },
  {
    id: 'secondary',
    title: 'Secondary LET',
    body: 'General Education, Professional Education, and your selected major.',
  },
  {
    id: 'specialization',
    title: 'Specialization Focus',
    body: 'Concentrate first on one major area while keeping the LET simulator structure.',
  },
];

export default function ChooseFocus() {
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();
  const [reviewMode, setReviewMode] = useState<ReviewMode>((user?.learningMode as ReviewMode) || 'self_review');
  const [classCode, setClassCode] = useState('');
  const [reviewTrack, setReviewTrack] = useState<ReviewTrack>((user?.reviewTrack as ReviewTrack) || 'elementary');
  const [specialization, setSpecialization] = useState(user?.specialization || '');
  const [targetExamDate, setTargetExamDate] = useState(user?.targetExamDate || '');
  const [diagnosticChoice, setDiagnosticChoice] = useState<'now' | 'later'>('now');
  const [isSaving, setIsSaving] = useState(false);

  const needsSpecialization = reviewTrack === 'secondary' || reviewTrack === 'specialization';
  const canSave = !needsSpecialization || specialization.trim().length > 1;

  const saveSetup = async () => {
    if (!user || !canSave) return;
    setIsSaving(true);
    try {
      const normalizedClassCode = classCode.trim().toUpperCase();
      await updateDoc(doc(db, 'users', user.uid), {
        learningMode: reviewMode,
        reviewTrack,
        selectedFocus: needsSpecialization ? 'major' : 'full_let_review',
        specialization: specialization.trim(),
        targetExamDate: targetExamDate || null,
        diagnosticSkipped: diagnosticChoice === 'later',
        onboardingStep: 4,
        reviewSetupUpdatedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await refreshUser();

      if (reviewMode === 'class_based') {
        navigate(normalizedClassCode ? `/join/${encodeURIComponent(normalizedClassCode)}` : '/join-class', { replace: true });
        return;
      }

      navigate(diagnosticChoice === 'now' ? '/diagnostic' : '/student/dashboard', { replace: true });
    } catch (error) {
      console.error('Failed to save review setup', error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f0f2f5] px-5 py-8 text-slate-900">
      <main className="mx-auto max-w-4xl">
        <button onClick={() => navigate('/student/dashboard')} className="mb-6 inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-400 hover:text-slate-900">
          <ArrowLeft size={16} />
          Back
        </button>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-900/5 md:p-8">
          <div className="mb-8 flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#1b366a] text-white">
              <BookOpenCheck size={28} />
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-blue-700">LET Review Setup</p>
              <h1 className="mt-1 font-headline text-3xl font-black">Configure your review path</h1>
              <p className="mt-2 max-w-2xl text-sm font-medium text-slate-500">
                This replaces the old focus picker. Your dashboard, reviewers, mock exam blueprint, and recommendations should follow this setup.
              </p>
            </div>
          </div>

          <div className="space-y-8">
            <div>
              <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-slate-400">1. Review mode</p>
              <div className="grid gap-3 md:grid-cols-2">
                <button
                  onClick={() => setReviewMode('self_review')}
                  className={`rounded-2xl border p-5 text-left transition-all ${reviewMode === 'self_review' ? 'border-emerald-600 bg-emerald-50' : 'border-slate-200 bg-slate-50 hover:border-emerald-200'}`}
                >
                  <UserRound className="mb-4 text-emerald-700" size={26} />
                  <h3 className="font-black">Review independently</h3>
                  <p className="mt-1 text-sm font-medium text-slate-500">Use public reviewers, diagnostics, mock exams, mistake bank, and AI guidance.</p>
                </button>
                <button
                  onClick={() => setReviewMode('class_based')}
                  className={`rounded-2xl border p-5 text-left transition-all ${reviewMode === 'class_based' ? 'border-blue-600 bg-blue-50' : 'border-slate-200 bg-slate-50 hover:border-blue-200'}`}
                >
                  <School className="mb-4 text-blue-700" size={26} />
                  <h3 className="font-black">Join a professor class</h3>
                  <p className="mt-1 text-sm font-medium text-slate-500">Add class materials, deadlines, feedback, and instructor monitoring on top.</p>
                </button>
              </div>
              {reviewMode === 'class_based' && (
                <input
                  value={classCode}
                  onChange={(event) => setClassCode(event.target.value.toUpperCase())}
                  placeholder="Optional class code"
                  className="mt-3 w-full rounded-2xl border border-blue-100 bg-blue-50/60 px-5 py-4 font-mono text-sm font-black uppercase outline-none focus:border-blue-400"
                />
              )}
            </div>

            <div>
              <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-slate-400">2. LET track</p>
              <div className="grid gap-3">
                {trackOptions.map((track) => (
                  <button
                    key={track.id}
                    onClick={() => setReviewTrack(track.id)}
                    className={`flex gap-4 rounded-2xl border p-5 text-left transition-all ${reviewTrack === track.id ? 'border-blue-600 bg-blue-50' : 'border-slate-200 bg-slate-50 hover:border-blue-200'}`}
                  >
                    <GraduationCap className="mt-1 shrink-0 text-blue-700" size={24} />
                    <div>
                      <h3 className="font-black">{track.title}</h3>
                      <p className="mt-1 text-sm font-medium text-slate-500">{track.body}</p>
                    </div>
                  </button>
                ))}
              </div>
              {needsSpecialization && (
                <input
                  value={specialization}
                  onChange={(event) => setSpecialization(event.target.value)}
                  placeholder="Specialization, e.g. Mathematics, English, Filipino, Science"
                  className="mt-3 w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm font-bold outline-none focus:border-blue-300 focus:bg-white"
                />
              )}
            </div>

            <div>
              <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-slate-400">3. Exam plan</p>
              <div className="grid gap-3 md:grid-cols-[1fr_1.2fr]">
                <label className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                  <span className="mb-3 flex items-center gap-2 text-sm font-black text-slate-700">
                    <CalendarDays size={18} />
                    Target exam date
                  </span>
                  <input
                    type="date"
                    value={targetExamDate}
                    onChange={(event) => setTargetExamDate(event.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-blue-300"
                  />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    onClick={() => setDiagnosticChoice('now')}
                    className={`rounded-2xl border p-5 text-left transition-all ${diagnosticChoice === 'now' ? 'border-blue-600 bg-blue-50' : 'border-slate-200 bg-slate-50 hover:border-blue-200'}`}
                  >
                    <h3 className="font-black">Take diagnostic now</h3>
                    <p className="mt-1 text-sm font-medium text-slate-500">Start recommendations from real baseline data.</p>
                  </button>
                  <button
                    onClick={() => setDiagnosticChoice('later')}
                    className={`rounded-2xl border p-5 text-left transition-all ${diagnosticChoice === 'later' ? 'border-amber-500 bg-amber-50' : 'border-slate-200 bg-slate-50 hover:border-amber-200'}`}
                  >
                    <h3 className="font-black">Skip for later</h3>
                    <p className="mt-1 text-sm font-medium text-slate-500">Enter dashboard with no fake diagnostic score.</p>
                  </button>
                </div>
              </div>
            </div>

            <button
              disabled={!canSave || isSaving}
              onClick={saveSetup}
              className="w-full rounded-2xl bg-[#1b366a] px-6 py-4 text-sm font-black uppercase tracking-widest text-white shadow-lg shadow-blue-900/10 disabled:opacity-50"
            >
              {isSaving ? 'Saving setup...' : 'Save review setup'}
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
