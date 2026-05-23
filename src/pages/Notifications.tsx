import React, { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
import DashboardLayout from '../components/DashboardLayout';
import StudentLayout from '../components/StudentLayout';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/firebase';

export default function Notifications() {
  const { user } = useAuth();
  const [items, setItems] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'notifications'), where('recipientIds', 'array-contains', user.uid));
    const unsub = onSnapshot(q, (snapshot) => {
      setItems(snapshot.docs.map((itemDoc) => ({ id: itemDoc.id, ...itemDoc.data() })));
    });
    return () => unsub();
  }, [user]);

  const markRead = async (id: string) => {
    await updateDoc(doc(db, 'notifications', id), { status: 'read' });
  };

  const content = (
    <div className="p-4 md:p-8 max-w-5xl mx-auto w-full text-on-surface">
      <section className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 shadow-sm mb-6">
        <p className="text-xs font-black uppercase tracking-widest text-primary mb-2">Notifications</p>
        <h1 className="text-3xl font-extrabold font-headline">Updates and reminders</h1>
      </section>
      <div className="space-y-3">
        {items.map((item) => (
          <article key={item.id} className={`rounded-2xl border p-5 shadow-sm ${item.status === 'read' ? 'bg-surface-container-lowest border-outline-variant/40 opacity-70' : 'bg-surface-container-lowest border-primary/30'}`}>
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div>
                <h2 className="font-extrabold text-on-surface">{item.title || item.subject}</h2>
                <p className="text-sm text-on-surface-variant mt-1">{item.body || item.description}</p>
              </div>
              {item.status !== 'read' && (
                <button onClick={() => markRead(item.id)} className="rounded-xl bg-primary text-on-primary px-4 py-2 text-xs font-bold">Mark read</button>
              )}
            </div>
          </article>
        ))}
        {items.length === 0 && (
          <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-10 text-center text-on-surface-variant/40 font-bold">
            No notifications yet.
          </div>
        )}
      </div>
    </div>
  );

  if (user?.role === 'student') return <StudentLayout title="Notifications">{content}</StudentLayout>;
  return <DashboardLayout title="Notifications">{content}</DashboardLayout>;
}
