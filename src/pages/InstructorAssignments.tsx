import React, { useEffect, useState } from 'react';
import { addDoc, collection, onSnapshot, query, serverTimestamp, where } from 'firebase/firestore';
import { ClipboardList, Plus } from 'lucide-react';
import InstructorLayout from '../components/InstructorLayout';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/firebase';
import { createNotification, getClassRecipientIds } from '../lib/notifications';

export default function InstructorAssignments() {
  const { user } = useAuth();
  const [classes, setClasses] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
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
      setAssignments(snapshot.docs.map((assignmentDoc) => ({ id: assignmentDoc.id, ...assignmentDoc.data() })));
    });
    return () => {
      unsubClasses();
      unsubAssignments();
    };
  }, [user]);

  const createAssignment = async () => {
    if (!user || !draft.title.trim() || !draft.classId) return;
    await addDoc(collection(db, 'assignments'), {
      ...draft,
      title: draft.title.trim(),
      instructions: draft.instructions.trim(),
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
            ? `Your instructor posted an assignment due ${new Date(draft.dueAt).toLocaleString()}. Submit a Drive or external link with access enabled.`
            : 'Your instructor posted a new assignment. Submit a Drive or external link with access enabled.',
          type: 'assignment_created',
          targetLink: '/student/todo',
          recipientIds,
          classId: draft.classId,
          createdBy: user.uid,
          createdByEmail: user.email,
        });
      }
    } catch (error) {
      console.warn('Assignment notification was not sent', error);
    }
    setDraft((current) => ({ ...current, title: '', instructions: '', dueAt: '' }));
  };

  return (
    <InstructorLayout title="Assignments">
      <div className="p-4 md:p-8 max-w-6xl mx-auto w-full text-on-surface space-y-6">
        <section className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 shadow-sm">
          <p className="text-xs font-black uppercase tracking-widest text-primary mb-2">Separate assignment workflow</p>
          <h1 className="text-3xl font-extrabold font-headline">Assignments</h1>
          <p className="text-sm text-on-surface-variant mt-2">Create link-based submissions. Students should submit Google Drive or external links with access enabled.</p>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
          <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 shadow-sm space-y-4">
            <h2 className="font-headline font-extrabold text-xl">Create assignment</h2>
            <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="Assignment title" className="input" />
            <textarea value={draft.instructions} onChange={(event) => setDraft({ ...draft, instructions: event.target.value })} rows={5} placeholder="Instructions, rubric, link access reminder..." className="input resize-none" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <select value={draft.classId} onChange={(event) => setDraft({ ...draft, classId: event.target.value })} className="input font-bold">
                {classes.map((classItem) => <option key={classItem.id} value={classItem.id}>{classItem.className}</option>)}
              </select>
              <input type="datetime-local" value={draft.dueAt} onChange={(event) => setDraft({ ...draft, dueAt: event.target.value })} className="input" />
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
          {assignments.map((assignment) => (
            <article key={assignment.id} className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-5 shadow-sm">
              <p className="text-xs font-black uppercase tracking-widest text-primary mb-2">{assignment.dueAt ? `Due ${new Date(assignment.dueAt).toLocaleString()}` : 'No due date'}</p>
              <h2 className="font-extrabold text-on-surface">{assignment.title}</h2>
              <p className="text-sm text-on-surface-variant mt-1">{assignment.instructions}</p>
            </article>
          ))}
        </section>
      </div>
    </InstructorLayout>
  );
}
