import React, { useEffect, useState } from 'react';
import { addDoc, collection, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { BookOpen, CheckCircle2, ClipboardList, MessageSquare, Plus, RotateCcw, Users } from 'lucide-react';
import InstructorLayout from '../components/InstructorLayout';
import Toast from '../components/Toast';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/firebase';
import { createNotification, getClassRecipientIds } from '../lib/notifications';

export default function InstructorAssignments() {
  const { user } = useAuth();
  const [classes, setClasses] = useState<any[]>([]);
  const [modules, setModules] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [reviewDrafts, setReviewDrafts] = useState<Record<string, { grade: string; comment: string }>>({});
  const [toastMsg, setToastMsg] = useState('');
  const [showToast, setShowToast] = useState(false);
  const [draft, setDraft] = useState({
    title: '',
    instructions: '',
    classId: '',
    moduleId: '',
    dueAt: '',
    antiCheatEnabled: true,
    submissionType: 'link',
  });

  useEffect(() => {
    if (!user) return;
    const unsubClasses = onSnapshot(collection(db, 'classes'), (snapshot) => {
      const rows = snapshot.docs.map((classDoc) => ({ id: classDoc.id, ...classDoc.data() }))
        .filter((classItem: any) => user.role === 'admin' || classItem.instructorId === user.uid || classItem.instructorEmail === user.email);
      setClasses(rows);
      setDraft((current) => ({ ...current, classId: current.classId || rows[0]?.id || '' }));
    });
    const unsubAssignments = onSnapshot(query(collection(db, 'assignments'), where('instructorId', '==', user.uid)), (snapshot) => {
      const rows = snapshot.docs.map((assignmentDoc) => ({ id: assignmentDoc.id, ...assignmentDoc.data() }));
      setAssignments(rows);
    });
    const unsubModules = onSnapshot(collection(db, 'modules'), (snapshot) => {
      const rows = snapshot.docs.map((moduleDoc) => ({ id: moduleDoc.id, ...moduleDoc.data() }))
        .filter((module: any) => (
          user.role === 'admin' ||
          module.authorId === user.uid ||
          module.createdBy === user.uid ||
          module.authorEmail === user.email
        ));
      setModules(rows);
    });
    const unsubSubmissions = onSnapshot(collection(db, 'assignmentSubmissions'), (snapshot) => {
      setSubmissions(snapshot.docs.map((submissionDoc) => ({ id: submissionDoc.id, ...submissionDoc.data() })));
    });
    return () => {
      unsubClasses();
      unsubAssignments();
      unsubModules();
      unsubSubmissions();
    };
  }, [user]);

  const selectedClass = classes.find((classItem) => classItem.id === draft.classId);
  const moduleOptions = modules
    .filter((module) => (
      !draft.classId ||
      module.publishScope === 'public' ||
      !module.classIds?.length ||
      module.classIds.includes(draft.classId)
    ))
    .sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')));

  const reviewSubmission = async (submission: any, status: 'graded' | 'returned' | 'complete') => {
    const draftReview = reviewDrafts[submission.id] || { grade: submission.grade || '', comment: submission.comment || '' };
    try {
      await updateDoc(doc(db, 'assignmentSubmissions', submission.id), {
        grade: draftReview.grade,
        comment: draftReview.comment,
        status,
        reviewedBy: user?.uid || '',
        reviewedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      try {
        await createNotification({
          title: `Assignment feedback: ${submission.assignmentTitle}`,
          body: status === 'returned'
            ? 'Your instructor returned this assignment for revision.'
            : status === 'complete'
              ? 'Your instructor marked this assignment complete.'
              : 'Your instructor posted feedback or a grade.',
          type: 'assignment_feedback',
          targetLink: '/student/todo',
          recipientIds: [submission.userId],
          classId: submission.classId,
          createdBy: user?.uid,
          createdByEmail: user?.email,
        });
      } catch (notificationError) {
        console.warn('Assignment feedback notification was not sent', notificationError);
      }
      setToastMsg(status === 'returned' ? 'Submission returned for revision.' : status === 'complete' ? 'Submission marked complete.' : 'Grade and feedback saved.');
      setShowToast(true);
    } catch (error) {
      console.warn('Assignment feedback could not be saved', error);
      setToastMsg('Unable to save assignment feedback.');
      setShowToast(true);
    }
  };

  const createAssignment = async () => {
    if (!user || !draft.title.trim() || !draft.classId) {
      setToastMsg('Add an assignment title and class before publishing.');
      setShowToast(true);
      return;
    }
    const selectedModule = moduleOptions.find((module) => module.id === draft.moduleId);
    try {
      await addDoc(collection(db, 'assignments'), {
        ...draft,
        title: draft.title.trim(),
        instructions: draft.instructions.trim(),
        className: selectedClass?.className || '',
        moduleId: selectedModule?.id || '',
        moduleTitle: selectedModule?.title || '',
        instructorId: user.uid,
        instructorEmail: user.email,
        instructorName: user.fullName || user.email,
        status: 'published',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      try {
        const recipientIds = await getClassRecipientIds(draft.classId);
        if (recipientIds.length) {
          await createNotification({
            title: `New assignment: ${draft.title.trim()}`,
            body: draft.dueAt
              ? `Your instructor posted an assignment${selectedModule ? ` for ${selectedModule.title}` : ` for ${selectedClass?.className || 'your class'}`} due ${new Date(draft.dueAt).toLocaleString()}. Submit a Drive or external link with access enabled.`
              : `Your instructor posted a new assignment${selectedModule ? ` for ${selectedModule.title}` : ` for ${selectedClass?.className || 'your class'}`}. Submit a Drive or external link with access enabled.`,
            type: 'assignment_created',
            targetLink: '/student/todo',
            recipientIds,
            classId: draft.classId,
            moduleId: selectedModule?.id || '',
            createdBy: user.uid,
            createdByEmail: user.email,
          });
        }
      } catch (notificationError) {
        console.warn('Assignment notification was not sent', notificationError);
      }
      setDraft((current) => ({ ...current, title: '', instructions: '', dueAt: '', moduleId: '' }));
      setToastMsg('Assignment published.');
      setShowToast(true);
    } catch (error) {
      console.warn('Assignment notification was not sent', error);
      setToastMsg('Unable to publish assignment.');
      setShowToast(true);
    }
  };

  return (
    <InstructorLayout title="Assignments">
      <div className="p-4 md:p-8 max-w-6xl mx-auto w-full text-on-surface space-y-6">
        <section className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 shadow-sm">
          <p className="text-xs font-black uppercase tracking-widest text-primary mb-2">Class and module assignment workflow</p>
          <h1 className="text-3xl font-extrabold font-headline">Assignments</h1>
          <p className="text-sm text-on-surface-variant mt-2">Create class assignments, optionally attach them to a module, and notify students in their To Do list.</p>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
          <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 shadow-sm space-y-4">
            <h2 className="font-headline font-extrabold text-xl">Create assignment</h2>
            <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="Assignment title" className="input" />
            <textarea value={draft.instructions} onChange={(event) => setDraft({ ...draft, instructions: event.target.value })} rows={5} placeholder="Instructions, rubric, link access reminder..." className="input resize-none" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <select value={draft.classId} onChange={(event) => setDraft({ ...draft, classId: event.target.value, moduleId: '' })} className="input font-bold">
                {classes.map((classItem) => <option key={classItem.id} value={classItem.id}>{classItem.className}</option>)}
              </select>
              <input type="datetime-local" value={draft.dueAt} onChange={(event) => setDraft({ ...draft, dueAt: event.target.value })} className="input" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-4">
              <select value={draft.moduleId} onChange={(event) => setDraft({ ...draft, moduleId: event.target.value })} className="input font-bold">
                <option value="">Class-only assignment</option>
                {moduleOptions.map((module) => <option key={module.id} value={module.id}>{module.title}</option>)}
              </select>
              <select value={draft.submissionType} onChange={(event) => setDraft({ ...draft, submissionType: event.target.value })} className="input font-bold">
                <option value="link">Link submission</option>
                <option value="text">Written response</option>
                <option value="image">Image/link proof</option>
              </select>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="rounded-xl border border-outline-variant/30 bg-surface-container/30 p-4">
                <div className="flex items-center gap-2 text-primary">
                  <Users size={16} />
                  <p className="text-[10px] font-black uppercase tracking-widest">Class target</p>
                </div>
                <p className="mt-2 text-sm font-extrabold text-on-surface">{selectedClass?.className || 'Choose a class'}</p>
                <p className="text-xs text-on-surface-variant/60">Students in this class receive the assignment notification.</p>
              </div>
              <div className="rounded-xl border border-outline-variant/30 bg-surface-container/30 p-4">
                <div className="flex items-center gap-2 text-primary">
                  <BookOpen size={16} />
                  <p className="text-[10px] font-black uppercase tracking-widest">Module link</p>
                </div>
                <p className="mt-2 text-sm font-extrabold text-on-surface">{moduleOptions.find((module) => module.id === draft.moduleId)?.title || 'Class-only assignment'}</p>
                <p className="text-xs text-on-surface-variant/60">Attach only when this should appear beside a module journey.</p>
              </div>
            </div>
            <label className="flex items-center justify-between gap-4 bg-surface-container rounded-xl px-4 py-4">
              <span>
                <span className="block text-sm font-extrabold text-on-surface">Anti-cheat on written submission</span>
                <span className="block text-xs text-on-surface-variant/60">Blocks paste and warns on tab switching when enabled in the submission screen.</span>
              </span>
              <input type="checkbox" checked={draft.antiCheatEnabled} onChange={(event) => setDraft({ ...draft, antiCheatEnabled: event.target.checked })} className="w-5 h-5 accent-primary" />
            </label>
            <button onClick={createAssignment} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary text-on-primary px-5 py-3 text-sm font-bold">
              <Plus size={16} />
              Publish assignment
            </button>
          </div>

          <aside className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-5 shadow-sm h-fit">
            <ClipboardList className="text-primary mb-3" />
            <p className="font-extrabold text-on-surface">Submission rule</p>
            <p className="text-xs text-on-surface-variant/60 mt-2">File uploads should be Drive links or other cloud links, not database-stored files. Tell students to keep link access open until grading is complete.</p>
          </aside>
        </section>

        <section className="space-y-3">
          {assignments.map((assignment) => {
            const assignmentSubmissions = submissions.filter((submission) => submission.assignmentId === assignment.id);
            return (
            <article key={assignment.id} className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-5 shadow-sm">
              <p className="text-xs font-black uppercase tracking-widest text-primary mb-2">{assignment.dueAt ? `Due ${new Date(assignment.dueAt).toLocaleString()}` : 'No due date'}</p>
              <h2 className="font-extrabold text-on-surface">{assignment.title}</h2>
              <div className="mt-2 flex flex-wrap gap-2">
                <span className="rounded-full bg-primary/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-primary">
                  {assignment.className || classes.find((classItem) => classItem.id === assignment.classId)?.className || 'Class'}
                </span>
                <span className="rounded-full bg-surface-container px-3 py-1 text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                  {assignment.moduleTitle || modules.find((module) => module.id === assignment.moduleId)?.title || 'Class-only'}
                </span>
              </div>
              <p className="text-sm text-on-surface-variant mt-1">{assignment.instructions}</p>
              <div className="mt-4 space-y-3">
                {assignmentSubmissions.map((submission) => {
                  const draftReview = reviewDrafts[submission.id] || { grade: submission.grade || '', comment: submission.comment || '' };
                  return (
                    <div key={submission.id} className="rounded-2xl border border-outline-variant/40 bg-surface-container/30 p-4">
                      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/50">{submission.status || 'submitted'} / {submission.type}</p>
                          <h3 className="font-extrabold text-on-surface mt-1">{submission.studentName || submission.studentEmail}</h3>
                          <p className="text-sm text-on-surface-variant mt-2 break-words">{submission.content}</p>
                        </div>
                        <div className="w-full lg:w-96 space-y-2">
                          <input
                            value={draftReview.grade}
                            onChange={(event) => setReviewDrafts((drafts) => ({ ...drafts, [submission.id]: { ...draftReview, grade: event.target.value } }))}
                            placeholder="Grade or score"
                            className="input"
                          />
                          <textarea
                            value={draftReview.comment}
                            onChange={(event) => setReviewDrafts((drafts) => ({ ...drafts, [submission.id]: { ...draftReview, comment: event.target.value } }))}
                            rows={3}
                            placeholder="Feedback, revision notes, or completion comment"
                            className="input resize-none"
                          />
                          <div className="grid grid-cols-3 gap-2">
                            <button onClick={() => reviewSubmission(submission, 'graded')} className="rounded-xl bg-primary text-on-primary px-3 py-2 text-xs font-bold inline-flex items-center justify-center gap-1">
                              <MessageSquare size={13} />
                              Grade
                            </button>
                            <button onClick={() => reviewSubmission(submission, 'returned')} className="rounded-xl bg-amber-500/10 text-amber-700 px-3 py-2 text-xs font-bold inline-flex items-center justify-center gap-1">
                              <RotateCcw size={13} />
                              Return
                            </button>
                            <button onClick={() => reviewSubmission(submission, 'complete')} className="rounded-xl bg-emerald-500/10 text-emerald-700 px-3 py-2 text-xs font-bold inline-flex items-center justify-center gap-1">
                              <CheckCircle2 size={13} />
                              Done
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {assignmentSubmissions.length === 0 && (
                  <p className="rounded-xl bg-surface-container/30 border border-outline-variant/30 px-4 py-3 text-xs font-bold text-on-surface-variant/60">No submissions yet.</p>
                )}
              </div>
            </article>
            );
          })}
        </section>
      </div>
      <Toast
        isVisible={showToast}
        message={toastMsg}
        onClose={() => setShowToast(false)}
        type={toastMsg.includes('Unable') || toastMsg.includes('Add ') ? 'error' : 'success'}
      />
    </InstructorLayout>
  );
}
