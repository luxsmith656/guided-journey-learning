import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { ArrowLeft, ArrowRight, BookOpenCheck, GraduationCap, School, ShieldCheck, UserRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/firebase';

type ReviewMode = 'class_based' | 'self_review';
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
    body: 'General Education, Professional Education, and your selected major or specialization.',
  },
  {
    id: 'specialization',
    title: 'Specialization Focus',
    body: 'Use this when your review is centered on one major area first.',
  },
];

export default function Onboarding() {
  const { user, refreshUser, signOut } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [fullName, setFullName] = useState(user?.fullName || '');
  const [reviewMode, setReviewMode] = useState<ReviewMode>((user?.learningMode as ReviewMode) || 'self_review');
  const [classCode, setClassCode] = useState('');
  const [reviewTrack, setReviewTrack] = useState<ReviewTrack>((user?.reviewTrack as ReviewTrack) || 'elementary');
  const [specialization, setSpecialization] = useState(user?.specialization || '');
  const [targetExamDate, setTargetExamDate] = useState(user?.targetExamDate || '');
  const [diagnosticChoice, setDiagnosticChoice] = useState<'now' | 'later'>('now');
  const [agreed, setAgreed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!user) return null;

  const canContinueStep1 = fullName.trim().length > 1;
  const canContinueStep2 = reviewTrack !== 'secondary' && reviewTrack !== 'specialization'
    ? true
    : specialization.trim().length > 1;

  const completeSetup = async () => {
    if (!agreed || !canContinueStep1 || !canContinueStep2) return;
    setIsSubmitting(true);
    try {
      const normalizedClassCode = classCode.trim().toUpperCase();
      await updateDoc(doc(db, 'users', user.uid), {
        fullName: fullName.trim(),
        onboarded: true,
        agreementAccepted: true,
        learningMode: reviewMode,
        reviewTrack,
        selectedFocus: reviewTrack === 'secondary' || reviewTrack === 'specialization' ? 'major' : 'full_let_review',
        specialization: specialization.trim(),
        targetExamDate: targetExamDate || null,
        diagnosticCompleted: false,
        diagnosticSkipped: diagnosticChoice === 'later',
        onboardingStep: 4,
        reviewSetupCompletedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await refreshUser();

      if (reviewMode === 'class_based') {
        navigate(normalizedClassCode ? `/join/${encodeURIComponent(normalizedClassCode)}` : '/join-class', { replace: true });
        return;
      }

      navigate(diagnosticChoice === 'now' ? '/diagnostic' : '/student/dashboard', { replace: true });
    } catch (error) {
      console.error('Onboarding failed:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const steps = [
    { id: 1, label: 'Mode' },
    { id: 2, label: 'Track' },
    { id: 3, label: 'Diagnostic' },
  ];

  return (
    <div className="min-h-screen bg-[#f0f2f5] text-slate-900 font-body flex items-center justify-center px-4 py-8">
      <button
        onClick={async () => {
          await signOut();
          navigate('/sign-in');
        }}
        className="fixed top-5 right-5 rounded-full bg-white/80 border border-slate-200 px-4 py-2 text-xs font-black uppercase tracking-widest text-slate-500 hover:text-slate-900"
      >
        Change account
      </button>

      <main className="w-full max-w-3xl">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#1b366a] text-white shadow-lg">
            <BookOpenCheck size={28} />
          </div>
          <p className="text-xs font-black uppercase tracking-[0.24em] text-blue-700">LET Review Setup</p>
          <h1 className="mt-2 text-3xl font-black font-headline">Prepare your review simulator</h1>
          <p className="mt-2 text-sm font-medium text-slate-500">
            Self-study is the base experience. A professor class adds private materials, deadlines, feedback, and monitoring on top.
          </p>
        </div>

        <div className="mb-6 flex justify-center gap-2">
          {steps.map((item) => (
            <div key={item.id} className={`h-2 rounded-full transition-all ${step >= item.id ? 'w-16 bg-[#1b366a]' : 'w-6 bg-white border border-slate-200'}`} />
          ))}
        </div>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 md:p-8 shadow-xl shadow-slate-900/5">
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-blue-700">Step 1</p>
                <h2 className="mt-1 text-2xl font-black font-headline">How are you reviewing?</h2>
                <p className="mt-2 text-sm font-medium text-slate-500">Choose the path you will use first. You can still join a class later from the student top bar.</p>
              </div>

              <label className="block">
                <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">Full name</span>
                <input
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm font-bold outline-none focus:border-blue-300 focus:bg-white"
                  placeholder="Enter your full name"
                />
              </label>

              <div className="grid gap-3 md:grid-cols-2">
                <button
                  onClick={() => setReviewMode('class_based')}
                  className={`rounded-2xl border p-5 text-left transition-all ${reviewMode === 'class_based' ? 'border-blue-600 bg-blue-50' : 'border-slate-200 bg-slate-50 hover:border-blue-200'}`}
                >
                  <School className="mb-4 text-blue-700" size={28} />
                  <h3 className="font-black">Yes, I have a class code</h3>
                  <p className="mt-1 text-sm font-medium text-slate-500">Join a professor-created LET review class after setup.</p>
                </button>
                <button
                  onClick={() => setReviewMode('self_review')}
                  className={`rounded-2xl border p-5 text-left transition-all ${reviewMode === 'self_review' ? 'border-emerald-600 bg-emerald-50' : 'border-slate-200 bg-slate-50 hover:border-emerald-200'}`}
                >
                  <UserRound className="mb-4 text-emerald-700" size={28} />
                  <h3 className="font-black">No, I am reviewing on my own</h3>
                  <p className="mt-1 text-sm font-medium text-slate-500">Use the public AI-powered LET review simulator.</p>
                </button>
              </div>

              {reviewMode === 'class_based' && (
                <label className="block rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
                  <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-blue-700">Class code, optional</span>
                  <input
                    value={classCode}
                    onChange={(event) => setClassCode(event.target.value.toUpperCase())}
                    className="w-full rounded-xl border border-blue-100 bg-white px-4 py-3 font-mono text-sm font-black uppercase outline-none focus:border-blue-400"
                    placeholder="LM-ABC123"
                  />
                  <p className="mt-2 text-xs font-bold text-blue-700/70">You can leave this blank and enter the code on the join page.</p>
                </label>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-blue-700">Step 2</p>
                <h2 className="mt-1 text-2xl font-black font-headline">Select your LET track</h2>
                <p className="mt-2 text-sm font-medium text-slate-500">The dashboard and reviewer categories will follow this track instead of showing every subject at once.</p>
              </div>

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

              {(reviewTrack === 'secondary' || reviewTrack === 'specialization') && (
                <label className="block">
                  <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">Specialization or major</span>
                  <input
                    value={specialization}
                    onChange={(event) => setSpecialization(event.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm font-bold outline-none focus:border-blue-300 focus:bg-white"
                    placeholder="Example: Mathematics, English, Filipino, Science"
                  />
                </label>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-blue-700">Step 3</p>
                <h2 className="mt-1 text-2xl font-black font-headline">Start with a diagnostic?</h2>
                <p className="mt-2 text-sm font-medium text-slate-500">The diagnostic is optional, but it gives the AI mentor real data for recommendations.</p>
              </div>

              <label className="block">
                <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">Target LET exam date, optional</span>
                <input
                  type="date"
                  value={targetExamDate}
                  onChange={(event) => setTargetExamDate(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm font-bold outline-none focus:border-blue-300 focus:bg-white"
                />
                <span className="mt-2 block text-xs font-bold text-slate-400">This helps the planner pace reviewer modules and mock exam practice.</span>
              </label>

              <div className="grid gap-3 md:grid-cols-2">
                <button
                  onClick={() => setDiagnosticChoice('now')}
                  className={`rounded-2xl border p-5 text-left transition-all ${diagnosticChoice === 'now' ? 'border-blue-600 bg-blue-50' : 'border-slate-200 bg-slate-50 hover:border-blue-200'}`}
                >
                  <h3 className="font-black">Take diagnostic now</h3>
                  <p className="mt-1 text-sm font-medium text-slate-500">Measure your starting level before choosing what to review.</p>
                </button>
                <button
                  onClick={() => setDiagnosticChoice('later')}
                  className={`rounded-2xl border p-5 text-left transition-all ${diagnosticChoice === 'later' ? 'border-amber-500 bg-amber-50' : 'border-slate-200 bg-slate-50 hover:border-amber-200'}`}
                >
                  <h3 className="font-black">Skip for later</h3>
                  <p className="mt-1 text-sm font-medium text-slate-500">Enter with zero progress and take the diagnostic from the dashboard later.</p>
                </button>
              </div>

              <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(event) => setAgreed(event.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-slate-300 text-[#1b366a] focus:ring-[#1b366a]"
                />
                <span className="text-sm font-bold text-slate-600">
                  I agree that LET review progress, attempts, mistakes, notes, and recommendations will be stored for learning analytics and review guidance.
                </span>
              </label>

              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">
                <ShieldCheck className="mb-2" size={20} />
                New accounts start honestly: zero progress, zero mock exams, zero mistake-bank items, and no active modules until you start or join one.
              </div>
            </div>
          )}

          <div className="mt-8 flex gap-3">
            <button
              onClick={() => setStep((value) => Math.max(1, value - 1))}
              disabled={step === 1 || isSubmitting}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm font-black uppercase tracking-widest text-slate-500 disabled:opacity-40"
            >
              <ArrowLeft size={16} />
              Back
            </button>
            {step < 3 ? (
              <button
                onClick={() => setStep((value) => value + 1)}
                disabled={(step === 1 && !canContinueStep1) || (step === 2 && !canContinueStep2)}
                className="inline-flex flex-[2] items-center justify-center gap-2 rounded-2xl bg-[#1b366a] px-5 py-4 text-sm font-black uppercase tracking-widest text-white shadow-lg disabled:opacity-50"
              >
                Continue
                <ArrowRight size={16} />
              </button>
            ) : (
              <button
                onClick={completeSetup}
                disabled={!agreed || !canContinueStep1 || !canContinueStep2 || isSubmitting}
                className="inline-flex flex-[2] items-center justify-center gap-2 rounded-2xl bg-[#1b366a] px-5 py-4 text-sm font-black uppercase tracking-widest text-white shadow-lg disabled:opacity-50"
              >
                {isSubmitting && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />}
                Finish setup
              </button>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
