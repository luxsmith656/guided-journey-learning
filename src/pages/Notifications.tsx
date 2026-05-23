import React, { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import DashboardLayout from '../components/DashboardLayout';
import StudentLayout from '../components/StudentLayout';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/firebase';
import { createNotification, getClassRecipientIds, getUserIdsFromTokens, NotificationRole } from '../lib/notifications';
import { useNotifications } from '../hooks/useNotifications';

export default function Notifications() {
  const { user } = useAuth();
  const { items, unreadCount, markRead, isRead } = useNotifications();
  const [classes, setClasses] = useState<any[]>([]);
  const [composerOpen, setComposerOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [composer, setComposer] = useState({
    targetType: 'role',
    role: 'student' as NotificationRole,
    classId: '',
    recipients: '',
    title: '',
    body: '',
    targetLink: '',
  });

  const canCompose = user?.role === 'admin' || user?.role === 'instructor';

  useEffect(() => {
    if (!canCompose || !user) return;
    return onSnapshot(collection(db, 'classes'), (snapshot) => {
      const rows = snapshot.docs
        .map((classDoc) => ({ id: classDoc.id, ...classDoc.data() }))
        .filter((classItem: any) => user.role === 'admin' || classItem.instructorId === user.uid || classItem.instructorEmail === user.email);
      setClasses(rows);
      setComposer((current) => ({ ...current, classId: current.classId || rows[0]?.id || '' }));
    });
  }, [canCompose, user]);

  const sendNotification = async () => {
    if (!user || !composer.title.trim() || !composer.body.trim()) return;
    setIsSending(true);
    try {
      let recipientIds: string[] = [];
      let roleRecipients: NotificationRole[] = [];

      if (composer.targetType === 'role') {
        roleRecipients = [composer.role];
      } else if (composer.targetType === 'class') {
        recipientIds = await getClassRecipientIds(composer.classId);
      } else {
        recipientIds = await getUserIdsFromTokens(composer.recipients.split(','));
      }

      await createNotification({
        title: composer.title,
        body: composer.body,
        targetLink: composer.targetLink,
        recipientIds,
        roleRecipients,
        classId: composer.targetType === 'class' ? composer.classId : '',
        type: 'announcement',
        createdBy: user.uid,
        createdByEmail: user.email,
      });

      setComposer((current) => ({ ...current, title: '', body: '', targetLink: '', recipients: '' }));
      setComposerOpen(false);
    } catch (error) {
      console.warn('Unable to send notification', error);
      alert('Unable to send notification. Check recipients and try again.');
    } finally {
      setIsSending(false);
    }
  };

  const content = (
    <div className="p-4 md:p-8 max-w-5xl mx-auto w-full text-on-surface">
      <section className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 shadow-sm mb-6">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-primary mb-2">Notifications</p>
            <h1 className="text-3xl font-extrabold font-headline">Updates and reminders</h1>
            <p className="text-sm text-on-surface-variant mt-2">{unreadCount} unread across your personal and role notifications.</p>
          </div>
          {canCompose && (
            <button onClick={() => setComposerOpen(!composerOpen)} className="rounded-xl bg-primary text-on-primary px-4 py-3 text-xs font-bold">
              {composerOpen ? 'Close composer' : 'Send notification'}
            </button>
          )}
        </div>
      </section>

      {canCompose && composerOpen && (
        <section className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 shadow-sm mb-6 space-y-4">
          <h2 className="font-headline font-extrabold text-xl">Notification composer</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <select value={composer.targetType} onChange={(event) => setComposer({ ...composer, targetType: event.target.value })} className="input font-bold">
              <option value="role">Target role</option>
              <option value="class">Target class</option>
              <option value="users">Specific users</option>
            </select>
            {composer.targetType === 'role' && (
              <select value={composer.role} onChange={(event) => setComposer({ ...composer, role: event.target.value as NotificationRole })} className="input font-bold">
                <option value="student">All students</option>
                <option value="instructor">All instructors</option>
                <option value="admin">All admins</option>
              </select>
            )}
            {composer.targetType === 'class' && (
              <select value={composer.classId} onChange={(event) => setComposer({ ...composer, classId: event.target.value })} className="input font-bold">
                {classes.map((classItem) => <option key={classItem.id} value={classItem.id}>{classItem.className}</option>)}
              </select>
            )}
            {composer.targetType === 'users' && (
              <input value={composer.recipients} onChange={(event) => setComposer({ ...composer, recipients: event.target.value })} placeholder="UIDs or emails, comma-separated" className="input md:col-span-2" />
            )}
            <input value={composer.targetLink} onChange={(event) => setComposer({ ...composer, targetLink: event.target.value })} placeholder="/student/todo or /instructor/grades" className="input" />
          </div>
          <input value={composer.title} onChange={(event) => setComposer({ ...composer, title: event.target.value })} placeholder="Notification title" className="input" />
          <textarea value={composer.body} onChange={(event) => setComposer({ ...composer, body: event.target.value })} rows={4} placeholder="Message body" className="input resize-none" />
          <button disabled={isSending || !composer.title.trim() || !composer.body.trim()} onClick={sendNotification} className="rounded-xl bg-primary text-on-primary px-5 py-3 text-sm font-bold disabled:opacity-50">
            {isSending ? 'Sending...' : 'Send'}
          </button>
        </section>
      )}

      <div className="space-y-3">
        {items.map((item) => {
          const read = isRead(item);
          return (
            <article key={item.id} className={`rounded-2xl border p-5 shadow-sm ${read ? 'bg-surface-container-lowest border-outline-variant/40 opacity-70' : 'bg-surface-container-lowest border-primary/30'}`}>
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    {!read && <span className="w-2 h-2 rounded-full bg-error shrink-0" />}
                    <h2 className="font-extrabold text-on-surface">{item.title || item.subject}</h2>
                  </div>
                  <p className="text-sm text-on-surface-variant mt-1">{item.body || item.description}</p>
                  {item.targetLink && (
                    <a href={item.targetLink} className="inline-flex mt-3 text-xs font-black uppercase tracking-widest text-primary hover:underline">Open related page</a>
                  )}
                </div>
                {!read && (
                  <button onClick={() => markRead(item.id)} className="rounded-xl bg-primary text-on-primary px-4 py-2 text-xs font-bold">Mark read</button>
                )}
              </div>
            </article>
          );
        })}
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
