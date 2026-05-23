import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, getDocs, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
import { Award, Eye, EyeOff, Trophy, Users } from 'lucide-react';
import InstructorLayout from '../components/InstructorLayout';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/firebase';

export default function InstructorGradebook() {
  const { user } = useAuth();
  const [classes, setClasses] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [progressRows, setProgressRows] = useState<any[]>([]);
  const [selectedClassId, setSelectedClassId] = useState('');

  useEffect(() => {
    if (!user) return;

    const byUid = query(collection(db, 'classes'), where('instructorId', '==', user.uid));
    const byEmail = query(collection(db, 'classes'), where('instructorEmail', '==', user.email));
    const snapshots: Record<string, any[]> = { uid: [], email: [] };
    const publish = () => {
      const merged = new Map<string, any>();
      [...snapshots.uid, ...snapshots.email].forEach((classDoc) => merged.set(classDoc.id, { id: classDoc.id, ...classDoc.data() }));
      const nextClasses = Array.from(merged.values());
      setClasses(nextClasses);
      setSelectedClassId((current) => current || nextClasses[0]?.id || '');
    };

    const unsubUid = onSnapshot(byUid, (snap) => {
      snapshots.uid = snap.docs;
      publish();
    });
    const unsubEmail = onSnapshot(byEmail, (snap) => {
      snapshots.email = snap.docs;
      publish();
    });
    const unsubProgress = onSnapshot(collection(db, 'moduleProgress'), (snap) => {
      setProgressRows(snap.docs.map((progressDoc) => ({ id: progressDoc.id, ...progressDoc.data() })));
    });
    const unsubEnrollments = onSnapshot(collection(db, 'classEnrollments'), (snap) => {
      setEnrollments(snap.docs.map((enrollmentDoc) => ({ id: enrollmentDoc.id, ...enrollmentDoc.data() })));
    });

    getDocs(collection(db, 'users')).then((snap) => {
      setStudents(snap.docs.map((userDoc) => ({ uid: userDoc.id, ...userDoc.data() })).filter((row: any) => row.role === 'student'));
    });

    return () => {
      unsubUid();
      unsubEmail();
      unsubProgress();
      unsubEnrollments();
    };
  }, [user]);

  const selectedClass = classes.find((classItem) => classItem.id === selectedClassId) || classes[0];
  const classStudentIds = useMemo(() => {
    const fromClassDoc = (selectedClass?.studentIds || selectedClass?.students || []).filter(Boolean);
    const fromEnrollments = enrollments.filter((enrollment) => enrollment.classId === selectedClass?.id).map((enrollment) => enrollment.studentId).filter(Boolean);
    return new Set([...fromClassDoc, ...fromEnrollments]);
  }, [selectedClass, enrollments]);
  const visibleStudents = students.filter((student) => classStudentIds.size === 0 || classStudentIds.has(student.uid));
  const gradeRows = visibleStudents.map((student) => {
    const studentProgress = progressRows.filter((row) => row.userId === student.uid);
    const avgProgress = studentProgress.length
      ? Math.round(studentProgress.reduce((sum, row) => sum + (row.progressPercent || 0), 0) / studentProgress.length)
      : 0;
    const avgScore = studentProgress.filter((row) => row.finalScore != null).length
      ? Math.round(studentProgress.filter((row) => row.finalScore != null).reduce((sum, row) => sum + (row.finalScore || 0), 0) / studentProgress.filter((row) => row.finalScore != null).length)
      : 0;
    const completed = studentProgress.filter((row) => row.status === 'completed' && (row.finalScore ?? 0) >= 85).length;
    return { student, avgProgress, avgScore, completed, modules: studentProgress.length };
  }).sort((a, b) => b.avgScore - a.avgScore);

  const updateClassSetting = async (field: 'showGradesToStudents' | 'leaderboardEnabled', value: boolean) => {
    if (!selectedClass) return;
    await updateDoc(doc(db, 'classes', selectedClass.id), { [field]: value });
  };

  return (
    <InstructorLayout title="Gradebook">
      <div className="p-4 md:p-8 max-w-7xl mx-auto w-full text-on-surface space-y-6">
        <section className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-primary mb-2">Instructor grade control</p>
              <h1 className="text-3xl font-extrabold font-headline">Student grades, visibility, and leaderboard</h1>
              <p className="text-sm text-on-surface-variant mt-2">Review real module progress and decide what students can see per class.</p>
            </div>
            <select value={selectedClass?.id || ''} onChange={(event) => setSelectedClassId(event.target.value)} className="bg-surface-container border border-outline-variant/30 rounded-xl px-4 py-3 text-sm font-bold outline-none">
              {classes.map((classItem) => <option key={classItem.id} value={classItem.id}>{classItem.className}</option>)}
            </select>
          </div>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <ControlCard
            icon={Eye}
            title="Show grades"
            body="Allow students in this class to see final scores and module grade summaries."
            enabled={!!selectedClass?.showGradesToStudents}
            onToggle={() => updateClassSetting('showGradesToStudents', !selectedClass?.showGradesToStudents)}
          />
          <ControlCard
            icon={Trophy}
            title="Leaderboard"
            body="Show a ranked class leaderboard based on final exam averages."
            enabled={!!selectedClass?.leaderboardEnabled}
            onToggle={() => updateClassSetting('leaderboardEnabled', !selectedClass?.leaderboardEnabled)}
          />
          <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-5 shadow-sm">
            <Users className="text-primary mb-3" size={22} />
            <p className="text-xs font-black uppercase tracking-widest text-on-surface-variant/50">Students</p>
            <p className="text-3xl font-black text-on-surface mt-1">{visibleStudents.length}</p>
            <p className="text-xs text-on-surface-variant/60 mt-2">Roster count in the selected class.</p>
          </div>
        </section>

        <section className="bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-sm overflow-hidden">
          <div className="p-5 border-b border-outline-variant flex items-center justify-between">
            <h2 className="font-headline font-extrabold text-xl">Gradebook rows</h2>
            <span className="text-xs font-black text-primary bg-primary/10 px-3 py-1 rounded-full">85% pass gate</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-container text-on-surface-variant/50 uppercase tracking-widest text-[10px] font-black">
                <tr>
                  <th className="px-5 py-4">Student</th>
                  <th className="px-5 py-4">Avg Score</th>
                  <th className="px-5 py-4">Progress</th>
                  <th className="px-5 py-4">Completed</th>
                  <th className="px-5 py-4">Rank</th>
                </tr>
              </thead>
              <tbody>
                {gradeRows.map((row, index) => (
                  <tr key={row.student.uid} className="border-t border-outline-variant/20">
                    <td className="px-5 py-4">
                      <p className="font-extrabold text-on-surface">{row.student.fullName || row.student.email}</p>
                      <p className="text-xs text-on-surface-variant/50">{row.student.email}</p>
                    </td>
                    <td className="px-5 py-4 font-black text-primary">{row.avgScore}%</td>
                    <td className="px-5 py-4">{row.avgProgress}%</td>
                    <td className="px-5 py-4">{row.completed} / {row.modules}</td>
                    <td className="px-5 py-4">
                      <span className="inline-flex items-center gap-1 rounded-full bg-surface-container px-3 py-1 text-xs font-black">
                        <Award size={13} />
                        #{index + 1}
                      </span>
                    </td>
                  </tr>
                ))}
                {gradeRows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-5 py-12 text-center text-on-surface-variant/40 font-bold">No student progress yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </InstructorLayout>
  );
}

function ControlCard({ icon: Icon, title, body, enabled, onToggle }: { icon: React.ElementType; title: string; body: string; enabled: boolean; onToggle: () => void }) {
  return (
    <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Icon className="text-primary mb-3" size={22} />
          <p className="font-extrabold text-on-surface">{title}</p>
          <p className="text-xs text-on-surface-variant/60 mt-1 leading-relaxed">{body}</p>
        </div>
        <button onClick={onToggle} className={`w-12 h-7 rounded-full p-1 transition-colors ${enabled ? 'bg-primary' : 'bg-surface-container'}`}>
          <span className={`block w-5 h-5 rounded-full bg-white transition-transform ${enabled ? 'translate-x-5' : ''}`}></span>
        </button>
      </div>
      <p className="mt-4 text-xs font-black uppercase tracking-widest text-on-surface-variant/50 inline-flex items-center gap-2">
        {enabled ? <Eye size={14} /> : <EyeOff size={14} />}
        {enabled ? 'Enabled' : 'Hidden'}
      </p>
    </div>
  );
}
