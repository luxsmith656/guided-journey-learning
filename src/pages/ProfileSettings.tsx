import React, { useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { Save, KeyRound } from 'lucide-react';
import DashboardLayout from '../components/DashboardLayout';
import StudentLayout from '../components/StudentLayout';
import { useAuth } from '../context/AuthContext';
import { db, resetPassword } from '../lib/firebase';

export default function ProfileSettings() {
  const { user, refreshUser } = useAuth();
  const [fullName, setFullName] = useState(user?.fullName || '');
  const [message, setMessage] = useState('');

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
    </div>
  );

  if (user?.role === 'student') {
    return <StudentLayout title="Profile">{content}</StudentLayout>;
  }

  return <DashboardLayout title="Profile">{content}</DashboardLayout>;
}
