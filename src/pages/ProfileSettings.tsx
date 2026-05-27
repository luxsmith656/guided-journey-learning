import React, { useState } from 'react';
import { collection, deleteDoc, doc, getDocs, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { Save, KeyRound, RotateCcw } from 'lucide-react';
import DashboardLayout from '../components/DashboardLayout';
import StudentLayout from '../components/StudentLayout';
import { useAuth } from '../context/AuthContext';
import { db, resetPassword } from '../lib/firebase';

export default function ProfileSettings() {
  const { user, refreshUser } = useAuth();
  const [fullName, setFullName] = useState(user?.fullName || '');
  const [message, setMessage] = useState('');
  const [isResettingDemo, setIsResettingDemo] = useState(false);
  const isDemoAccount = ['student@letmastery.com', 'instructor@letmastery.com', 'admin@letmastery.com'].includes((user?.email || '').toLowerCase()) || (user as any)?.isDemo;

  const saveProfile = async () => {
    if (!user) return;
    await updateDoc(doc(db, 'users', user.uid), {
      fullName: fullName.trim(),
      updatedAt: new Date().toISOString(),
    });
    await refreshUser();
    setMessage('Profile updated.');
  };

  const sendReset = async () => {
    if (!user?.email) return;
    await resetPassword(user.email);
    setMessage('Password reset email sent.');
  };

  const resetDemoProgress = async () => {
    if (!user || !isDemoAccount) return;
    if (!window.confirm('Reset this demo account to a clean onboarding state? This clears demo progress, attempts, notes, reminders, and local cached learning data.')) return;
    setIsResettingDemo(true);
    setMessage('');
    try {
      const deleteByUserId = async (collectionName: string, field = 'userId') => {
        const snap = await getDocs(query(collection(db, collectionName), where(field, '==', user.uid)));
        await Promise.allSettled(snap.docs.map((row) => deleteDoc(row.ref)));
      };

      await Promise.allSettled([
        deleteDoc(doc(db, 'learnerProfiles', user.uid)),
        deleteByUserId('moduleProgress'),
        deleteByUserId('diagnosticAttempts'),
        deleteByUserId('quizAttempts'),
        deleteByUserId('mockExamAttempts'),
        deleteByUserId('examAttemptLogs'),
        deleteByUserId('mistakeBank'),
        deleteByUserId('learningNotes'),
        deleteByUserId('learningAnnotations'),
        deleteByUserId('highlights'),
        deleteByUserId('hiddenBlocks'),
        deleteByUserId('bookmarks'),
        deleteByUserId('studyReminders'),
        deleteByUserId('classEnrollments', 'studentId'),
      ]);

      await updateDoc(doc(db, 'users', user.uid), {
        onboarded: false,
        learningMode: null,
        activeClassId: null,
        classIds: [],
        selectedFocus: null,
        reviewTrack: null,
        specialization: '',
        targetExamDate: null,
        diagnosticCompleted: false,
        diagnosticSkipped: false,
        streak: 0,
        xp: 0,
        level: 1,
        earnedBadges: [],
        archivedModuleIds: [],
        archivedClassIds: [],
        onboardingStep: 0,
        updatedAt: serverTimestamp(),
      });

      clearDemoLocalCache(user.uid);
      await clearDemoIndexedDb();
      await refreshUser();
      setMessage('Demo progress reset. Use the loader or sign in again to return to onboarding.');
    } catch (error) {
      console.warn('Demo reset failed', error);
      setMessage('Demo reset could not finish completely. Try again after sync completes.');
    } finally {
      setIsResettingDemo(false);
    }
  };

  const content = (
    <div className="p-4 md:p-8 max-w-3xl mx-auto w-full text-on-surface space-y-6">
      <section className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 shadow-sm">
        <p className="text-xs font-black uppercase tracking-widest text-primary mb-2">Profile settings</p>
        <h1 className="text-3xl font-extrabold font-headline">Account and identity</h1>
        <p className="text-sm text-on-surface-variant mt-2">Update your visible name and manage password access.</p>
      </section>

      <section className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 shadow-sm space-y-5">
        {message && <div className="rounded-xl bg-primary/10 text-primary px-4 py-3 text-sm font-bold">{message}</div>}
        <label className="block space-y-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/50">Full name</span>
          <input value={fullName} onChange={(event) => setFullName(event.target.value)} className="input" />
        </label>
        <label className="block space-y-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/50">Email</span>
          <input value={user?.email || ''} disabled className="input opacity-60" />
        </label>
        <div className="flex flex-col sm:flex-row gap-3">
          <button onClick={saveProfile} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary text-on-primary px-5 py-3 text-sm font-bold">
            <Save size={16} />
            Save profile
          </button>
          <button onClick={sendReset} className="inline-flex items-center justify-center gap-2 rounded-xl bg-surface-container text-on-surface px-5 py-3 text-sm font-bold border border-outline-variant/40">
            <KeyRound size={16} />
            Send password reset
          </button>
        </div>
      </section>

      {isDemoAccount && (
        <section className="bg-error/5 border border-error/20 rounded-2xl p-6 shadow-sm space-y-3">
          <p className="text-xs font-black uppercase tracking-widest text-error">Demo reset</p>
          <h2 className="font-headline text-xl font-extrabold text-on-surface">Return this demo to a clean start</h2>
          <p className="text-sm text-on-surface-variant">Clears demo progress, attempts, mistake bank records, notes, highlights, reminders, class enrollment state, and local/offline learning cache.</p>
          <button
            onClick={resetDemoProgress}
            disabled={isResettingDemo}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-error text-on-error px-5 py-3 text-sm font-bold disabled:opacity-50"
          >
            <RotateCcw size={16} />
            {isResettingDemo ? 'Resetting demo...' : 'Reset demo progress'}
          </button>
        </section>
      )}
    </div>
  );

  if (user?.role === 'student') {
    return <StudentLayout title="Profile">{content}</StudentLayout>;
  }

  return <DashboardLayout title="Profile">{content}</DashboardLayout>;
}

function clearDemoLocalCache(userId: string) {
  const prefixes = [
    `let-mastery-progress:${userId}:`,
    `let-mastery-answer-drafts:${userId}:`,
    `let-mastery-exam-attempt:${userId}:`,
  ];
  Object.keys(localStorage).forEach((key) => {
    if (prefixes.some((prefix) => key.startsWith(prefix))) {
      localStorage.removeItem(key);
    }
  });
}

async function clearDemoIndexedDb() {
  try {
    const { initDB } = await import('../lib/offline/db');
    const localDb = await initDB();
    await Promise.all([
      localDb.clear('localQuizAttempts'),
      localDb.clear('localProgress'),
      localDb.clear('localNotes'),
      localDb.clear('localRecallChallenges'),
      localDb.clear('localStudyPlan'),
      localDb.clear('syncQueue'),
    ]);
  } catch (error) {
    console.warn('Unable to clear local demo IndexedDB cache', error);
  }
}
