import React, { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, doc, onSnapshot, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { CalendarDays, CalendarPlus, CheckCircle2, ChevronRight, ClipboardList, Image, Link2, MessageSquareText, Send } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import StudentLayout from '../components/StudentLayout';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/firebase';
import { buildStudyPlan, getRecallInsights, StudyPlanItem } from '../lib/learningInsights';

type CalendarMarker = {
  id: string;
  dateKey: string;
  label: string;
  type: 'todo' | 'reminder' | 'study';
  targetLink?: string;
};

type SubmissionDraft = {
  type: 'link' | 'text' | 'image';
  content: string;
};

const submissionTypeIcons = {
  link: Link2,
  text: MessageSquareText,
  image: Image,
};

export default function StudentTodo() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [modules, setModules] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [reminders, setReminders] = useState<any[]>([]);
  const [submissions, setSubmissions] = useState<Record<string, any>>({});
  const [submissionDrafts, setSubmissionDrafts] = useState<Record<string, SubmissionDraft>>({});
  const [progressByModule, setProgressByModule] = useState<Record<string, any>>({});
  const [profile, setProfile] = useState<any>(null);
  const [reminderDraft, setReminderDraft] = useState({ title: '', remindAt: todayInputValue() });
  const [submissionWarning, setSubmissionWarning] = useState('');

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
    const reminderQuery = query(collection(db, 'studyReminders'), where('userId', '==', user.uid));
    const unsubReminders = onSnapshot(reminderQuery, (snapshot) => {
      setReminders(snapshot.docs.map((reminderDoc) => ({ id: reminderDoc.id, ...reminderDoc.data() })));
    });
    const submissionQuery = query(collection(db, 'assignmentSubmissions'), where('userId', '==', user.uid));
    const unsubSubmissions = onSnapshot(submissionQuery, (snapshot) => {
      const rows: Record<string, any> = {};
      snapshot.docs.forEach((submissionDoc) => {
        const data = submissionDoc.data();
        rows[data.assignmentId] = { id: submissionDoc.id, ...data };
      });
      setSubmissions(rows);
    });
    return () => {
      unsubProfile();
      unsubProgress();
      unsubReminders();
      unsubSubmissions();
    };
  }, [user]);

  const todoItems = useMemo(() => modules
    .filter((module) => {
      if (module.publishScope === 'classes') return user?.activeClassId && module.classIds?.includes(user.activeClassId);
      return true;
    })
    .filter((module) => progressByModule[module.id]?.status !== 'completed')
    .sort((a, b) => new Date(a.dueAt || '2999-12-31').getTime() - new Date(b.dueAt || '2999-12-31').getTime()), [modules, progressByModule, user]);

  const assignmentItems = useMemo(() => assignments
    .filter((assignment) => !assignment.classId || assignment.classId === user?.activeClassId)
    .sort((a, b) => new Date(a.dueAt || '2999-12-31').getTime() - new Date(b.dueAt || '2999-12-31').getTime()), [assignments, user?.activeClassId]);

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

  const calendarDays = useMemo(() => {
    const markers: CalendarMarker[] = [
      ...todoItems
        .filter((module) => module.dueAt)
        .map((module) => ({
          id: `module-${module.id}`,
          dateKey: toDateKey(module.dueAt),
          label: module.title,
          type: 'todo' as const,
          targetLink: `/quest?moduleId=${module.id}`,
        })),
      ...assignmentItems
        .filter((assignment) => assignment.dueAt)
        .map((assignment) => ({
          id: `assignment-${assignment.id}`,
          dateKey: toDateKey(assignment.dueAt),
          label: assignment.title,
          type: 'todo' as const,
          targetLink: '/student/todo',
        })),
      ...reminders.map((reminder) => ({
        id: `reminder-${reminder.id}`,
        dateKey: toDateKey(reminder.remindAt),
        label: reminder.title,
        type: 'reminder' as const,
      })),
      ...studyPlan.map((item, index) => ({
        id: `study-${index}`,
        dateKey: planItemDateKey(item, index),
        label: item.title,
        type: 'study' as const,
        targetLink: item.targetLink,
      })),
    ];

    return Array.from({ length: 14 }).map((_item, offset) => {
      const date = new Date();
      date.setDate(date.getDate() + offset);
      const key = toDateKey(date);
      return {
        key,
        date,
        markers: markers.filter((marker) => marker.dateKey === key),
      };
    });
  }, [todoItems, assignmentItems, reminders, studyPlan]);

  const addReminder = async () => {
    if (!user || !reminderDraft.title.trim()) return;
    await addDoc(collection(db, 'studyReminders'), {
      userId: user.uid,
      title: reminderDraft.title.trim(),
      remindAt: reminderDraft.remindAt,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    setReminderDraft({ title: '', remindAt: todayInputValue() });
  };

  const submitAssignment = async (assignment: any) => {
    if (!user) return;
    const draft = submissionDrafts[assignment.id] || { type: assignment.submissionType || 'link', content: '' };
    if (!draft.content.trim()) return;
    await setDoc(doc(db, 'assignmentSubmissions', `${user.uid}_${assignment.id}`), {
      assignmentId: assignment.id,
      assignmentTitle: assignment.title,
      classId: assignment.classId || '',
      instructorId: assignment.instructorId || '',
      userId: user.uid,
      studentName: user.fullName || user.email,
      studentEmail: user.email,
      type: draft.type,
      content: draft.content.trim(),
      status: 'submitted',
      submittedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true });
    setSubmissionDrafts((drafts) => ({ ...drafts, [assignment.id]: { ...draft, content: '' } }));
  };

  return (
    <StudentLayout title="To Do">
      <div className="space-y-6 pb-20 md:pb-0">
        <section className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-5 md:p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-2 text-primary text-xs font-black uppercase tracking-widest">
            <ClipboardList size={16} />
            Deadlines and planner
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold font-headline">Your calendar planner</h1>
          <p className="text-sm text-on-surface-variant mt-2">Class deadlines, generated study tasks, and your own reminders stay together so the week is easier to follow.</p>
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-5">
          <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-4 md:p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <CalendarDays size={18} className="text-primary" />
              <h2 className="text-xl font-extrabold font-headline">Next 14 days</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-2">
              {calendarDays.map((day) => (
                <article key={day.key} className="min-h-32 rounded-2xl border border-outline-variant/40 bg-surface-container/20 p-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/50">{day.date.toLocaleDateString(undefined, { weekday: 'short' })}</p>
                  <p className="text-lg font-black text-on-surface">{day.date.getDate()}</p>
                  <div className="mt-3 space-y-1">
                    {day.markers.slice(0, 4).map((marker) => (
                      <button
                        key={marker.id}
                        onClick={() => marker.targetLink && navigate(marker.targetLink)}
                        className={`w-full rounded-lg px-2 py-1 text-left text-[11px] font-bold leading-tight ${markerTone(marker.type)}`}
                      >
                        {marker.label}
                      </button>
                    ))}
                    {day.markers.length > 4 && <p className="text-[10px] font-bold text-on-surface-variant/50">+{day.markers.length - 4} more</p>}
                  </div>
                </article>
              ))}
            </div>
            <div className="mt-4 rounded-2xl bg-surface-container/40 border border-outline-variant/30 p-3 text-xs text-on-surface-variant">
              <span className="font-black text-error">To Dos</span> are class deadlines. <span className="font-black text-primary">Study</span> is generated from your pace and weak areas. <span className="font-black text-emerald-700">Reminders</span> are made by you.
            </div>
          </div>

          <aside className="space-y-4">
            <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <CalendarPlus size={18} className="text-primary" />
                <h3 className="font-headline font-extrabold text-lg">Add reminder</h3>
              </div>
              <input value={reminderDraft.title} onChange={(event) => setReminderDraft({ ...reminderDraft, title: event.target.value })} placeholder="Review notes, ask instructor..." className="input" />
              <input type="date" value={reminderDraft.remindAt} onChange={(event) => setReminderDraft({ ...reminderDraft, remindAt: event.target.value })} className="input mt-3" />
              <button onClick={addReminder} className="mt-3 w-full rounded-xl bg-primary text-on-primary px-4 py-3 text-sm font-bold">Save reminder</button>
            </div>

            <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-5 shadow-sm">
              <h3 className="font-headline font-extrabold text-lg mb-3">Suggested study flow</h3>
              <div className="space-y-2">
                {studyPlan.map((item, index) => (
                  <button key={`${item.title}-${index}`} onClick={() => navigate(item.targetLink)} className="w-full rounded-xl border border-outline-variant/40 bg-surface-container/30 p-3 text-left hover:border-primary/40 transition-colors">
                    <p className={`text-[10px] font-black uppercase tracking-widest ${item.priority === 'high' ? 'text-error' : 'text-primary'}`}>{item.dayLabel || 'This week'} {item.minutes ? `/ ${item.minutes} min` : ''}</p>
                    <h4 className="font-extrabold text-sm text-on-surface mt-1">{item.title}</h4>
                    <p className="text-[11px] text-on-surface-variant/60 mt-1">{item.body}</p>
                  </button>
                ))}
              </div>
            </div>
          </aside>
        </section>

        <section className="space-y-3">
          {assignmentItems.map((assignment) => {
            const dueDate = assignment.dueAt ? new Date(assignment.dueAt) : null;
            const isOverdue = dueDate ? dueDate.getTime() < Date.now() : false;
            const submission = submissions[assignment.id];
            const draft = submissionDrafts[assignment.id] || { type: assignment.submissionType || 'link', content: '' };
            const TypeIcon = submissionTypeIcons[draft.type];
            return (
              <article key={assignment.id} className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-5 shadow-sm">
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-5">
                  <div className="min-w-0">
                    <p className={`text-xs font-black uppercase tracking-widest mb-2 ${isOverdue ? 'text-error' : 'text-primary'}`}>
                      Assignment {dueDate ? `/ ${isOverdue ? 'Overdue' : 'Due'} ${dueDate.toLocaleString()}` : '/ No due date'}
                    </p>
                    <h2 className="text-lg font-extrabold text-on-surface">{assignment.title}</h2>
                    <p className="text-sm text-on-surface-variant mt-1">{assignment.instructions}</p>
                    <p className="text-xs text-on-surface-variant/50 mt-2">For file work, submit a Drive or image link with access enabled until grading is complete.</p>
                    {submission && (
                      <div className="mt-3 rounded-xl border border-outline-variant/30 bg-surface-container/40 p-3 text-xs">
                        <p className="font-black uppercase tracking-widest text-primary">Submission {submission.status || 'submitted'}</p>
                        <p className="mt-1 text-on-surface-variant break-words">{submission.content}</p>
                        {submission.grade !== undefined && <p className="mt-2 font-extrabold text-on-surface">Grade: {submission.grade}</p>}
                        {submission.comment && <p className="mt-1 text-on-surface-variant">Instructor comment: {submission.comment}</p>}
                      </div>
                    )}
                  </div>

                  <div className="w-full lg:w-96 rounded-2xl bg-surface-container/30 border border-outline-variant/30 p-4">
                    <div className="grid grid-cols-3 gap-2 mb-3">
                      {(['link', 'text', 'image'] as const).map((type) => {
                        const Icon = submissionTypeIcons[type];
                        return (
                          <button
                            key={type}
                            onClick={() => setSubmissionDrafts((drafts) => ({ ...drafts, [assignment.id]: { ...draft, type } }))}
                            className={`rounded-xl px-3 py-2 text-xs font-black uppercase border flex items-center justify-center gap-1 ${draft.type === type ? 'bg-primary text-on-primary border-primary' : 'bg-surface-container text-on-surface-variant border-outline-variant/30'}`}
                          >
                            <Icon size={13} />
                            {type}
                          </button>
                        );
                      })}
                    </div>
                    <textarea
                      value={draft.content}
                      onChange={(event) => setSubmissionDrafts((drafts) => ({ ...drafts, [assignment.id]: { ...draft, content: event.target.value } }))}
                      onPaste={(event) => {
                        if (assignment.antiCheatEnabled && draft.type === 'text') {
                          event.preventDefault();
                          setSubmissionWarning('Paste is disabled for this written assignment.');
                        }
                      }}
                      onBlur={() => assignment.antiCheatEnabled && draft.type === 'text' && setSubmissionWarning('Keep your answer focused in the writing field while submitting.')}
                      rows={4}
                      placeholder={draft.type === 'text' ? 'Write your answer here.' : draft.type === 'image' ? 'Paste an image/cloud link here.' : 'Paste Drive or external link here.'}
                      className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl p-3 text-sm outline-none focus:border-primary/40 resize-none"
                    />
                    {submissionWarning && <p className="text-xs font-bold text-error mt-2">{submissionWarning}</p>}
                    <button onClick={() => submitAssignment(assignment)} className="mt-3 w-full rounded-xl bg-primary text-on-primary px-4 py-3 text-sm font-bold inline-flex items-center justify-center gap-2">
                      <TypeIcon size={15} />
                      {submission ? 'Resubmit' : 'Submit'}
                      <Send size={15} />
                    </button>
                  </div>
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

function toDateKey(value: any) {
  const date = value?.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function planItemDateKey(item: StudyPlanItem, index: number) {
  const date = new Date();
  if (item.dayLabel === 'Tomorrow') date.setDate(date.getDate() + 1);
  else if (item.dayLabel === 'Friday') {
    const diff = (5 - date.getDay() + 7) % 7 || 7;
    date.setDate(date.getDate() + diff);
  } else if (item.dayLabel === 'This week') date.setDate(date.getDate() + Math.min(index + 2, 6));
  return toDateKey(date);
}

function markerTone(type: CalendarMarker['type']) {
  if (type === 'todo') return 'bg-error/10 text-error';
  if (type === 'reminder') return 'bg-emerald-500/10 text-emerald-700';
  return 'bg-primary/10 text-primary';
}
