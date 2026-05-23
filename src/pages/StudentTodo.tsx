import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { CalendarDays, CheckCircle2, ChevronRight, ClipboardList } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import StudentLayout from '../components/StudentLayout';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/firebase';
import { buildStudyPlan, getRecallInsights } from '../lib/learningInsights';

export default function StudentTodo() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [modules, setModules] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [progressByModule, setProgressByModule] = useState<Record<string, any>>({});
  const [profile, setProfile] = useState<any>(null);

  useEffect(() => {
    const moduleQuery = query(collection(db, 'modules'), where('isPublished', '==', true));
    const unsubModules = onSnapshot(moduleQuery, (snapshot) => {
      setModules(snapshot.docs.map((moduleDoc) => ({ id: moduleDoc.id, ...moduleDoc.data() })));
    });
    return () => unsubModules();
  }, []);

  useEffect(() => {
    const unsubAssignments = onSnapshot(collection(db, 'assignments'), (snapshot) => {
      setAssignments(snapshot.docs.map((assignmentDoc) => ({ id: assignmentDoc.id, ...assignmentDoc.data() })));
    });
    return () => unsubAssignments();
  }, []);

  useEffect(() => {
    if (!user) return;
    const unsubProfile = onSnapshot(doc(db, 'learnerProfiles', user.uid), (snapshot) => {
      setProfile(snapshot.exists() ? snapshot.data() : null);
    });
    const progressQuery = query(collection(db, 'moduleProgress'), where('userId', '==', user.uid));
    const unsubProgress = onSnapshot(progressQuery, (snapshot) => {
      const rows: Record<string, any> = {};
      snapshot.docs.forEach((progressDoc) => {
        const data = progressDoc.data();
        rows[data.moduleId] = data;
      });
      setProgressByModule(rows);
    });
    return () => {
      unsubProfile();
      unsubProgress();
    };
  }, [user]);

  const todoItems = useMemo(() => modules
    .filter((module) => {
      if (module.publishScope === 'classes') return user?.activeClassId && module.classIds?.includes(user.activeClassId);
      return true;
    })
    .filter((module) => progressByModule[module.id]?.status !== 'completed')
    .sort((a, b) => new Date(a.dueAt || '2999-12-31').getTime() - new Date(b.dueAt || '2999-12-31').getTime()), [modules, progressByModule, user]);
  const assignmentItems = assignments
    .filter((assignment) => !assignment.classId || assignment.classId === user?.activeClassId)
    .sort((a, b) => new Date(a.dueAt || '2999-12-31').getTime() - new Date(b.dueAt || '2999-12-31').getTime());
  const weakTopicLabel = profile?.weakTopics?.[0]
    || Object.entries(profile?.masteryByTopic || {}).sort((a: any, b: any) => a[1] - b[1])[0]?.[0]
    || 'your weakest topic';
  const studyPlan = buildStudyPlan({
    modules: todoItems.map((module) => ({ ...module, progress: progressByModule[module.id]?.progressPercent || 0 })),
    assignments: assignmentItems,
    recallInsights: getRecallInsights(profile),
    weakTopicLabel,
    progressByModule,
  });

  return (
    <StudentLayout title="To Do">
      <div className="space-y-6">
        <section className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-2 text-primary text-xs font-black uppercase tracking-widest">
            <ClipboardList size={16} />
            Deadlines
          </div>
          <h1 className="text-3xl font-extrabold font-headline">Your module to-do list</h1>
          <p className="text-sm text-on-surface-variant mt-2">Due dates set by your instructor appear here. Modules without due dates stay available.</p>
        </section>

        <section className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <CalendarDays size={18} className="text-primary" />
            <h2 className="text-xl font-extrabold font-headline">Personal study planner</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {studyPlan.map((item, index) => (
              <button key={`${item.title}-${index}`} onClick={() => navigate(item.targetLink)} className="rounded-2xl border border-outline-variant/40 bg-surface-container/30 p-4 text-left hover:border-primary/40 transition-colors">
                <p className={`text-[10px] font-black uppercase tracking-widest mb-2 ${item.priority === 'high' ? 'text-error' : 'text-primary'}`}>{item.dayLabel || 'This week'} {item.minutes ? `/ ${item.minutes} min` : ''}</p>
                <h3 className="font-extrabold text-on-surface">{item.title}</h3>
                <p className="text-xs text-on-surface-variant/60 mt-1">{item.body}</p>
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          {assignmentItems.map((assignment) => {
            const dueDate = assignment.dueAt ? new Date(assignment.dueAt) : null;
            const isOverdue = dueDate ? dueDate.getTime() < Date.now() : false;
            return (
              <article key={assignment.id} className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <p className={`text-xs font-black uppercase tracking-widest mb-2 ${isOverdue ? 'text-error' : 'text-primary'}`}>
                    Assignment {dueDate ? `/ ${isOverdue ? 'Overdue' : 'Due'} ${dueDate.toLocaleString()}` : '/ No due date'}
                  </p>
                  <h2 className="text-lg font-extrabold text-on-surface">{assignment.title}</h2>
                  <p className="text-sm text-on-surface-variant mt-1">{assignment.instructions}</p>
                  <p className="text-xs text-on-surface-variant/50 mt-2">Submit a Drive/external link with access enabled.</p>
                </div>
              </article>
            );
          })}
          {todoItems.map((module) => {
            const dueDate = module.dueAt ? new Date(module.dueAt) : null;
            const isOverdue = dueDate ? dueDate.getTime() < Date.now() : false;
            return (
              <article key={module.id} className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <p className={`text-xs font-black uppercase tracking-widest mb-2 ${isOverdue ? 'text-error' : 'text-primary'}`}>
                    {dueDate ? `${isOverdue ? 'Overdue' : 'Due'} ${dueDate.toLocaleString()}` : 'No due date'}
                  </p>
                  <h2 className="text-lg font-extrabold text-on-surface">{module.title}</h2>
                  <p className="text-sm text-on-surface-variant mt-1">{module.description}</p>
                </div>
                <button onClick={() => navigate(`/quest?moduleId=${module.id}`)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary text-on-primary px-5 py-3 text-sm font-bold">
                  Open
                  <ChevronRight size={16} />
                </button>
              </article>
            );
          })}
          {todoItems.length === 0 && assignmentItems.length === 0 && (
            <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-10 text-center shadow-sm">
              <CheckCircle2 className="mx-auto text-emerald-500 mb-3" size={40} />
              <h2 className="font-extrabold text-on-surface">Nothing due right now.</h2>
              <p className="text-sm text-on-surface-variant mt-2">New class modules and deadlines will show here.</p>
            </div>
          )}
        </section>
      </div>
    </StudentLayout>
  );
}
