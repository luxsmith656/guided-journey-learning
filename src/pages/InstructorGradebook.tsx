import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, getDocs, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
import { AlertTriangle, Award, BookOpen, CheckCircle2, ChevronRight, Clock, Eye, EyeOff, ListChecks, ShieldAlert, Trophy, Users } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import InstructorLayout from '../components/InstructorLayout';
import Toast from '../components/Toast';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/firebase';

export default function InstructorGradebook() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [classes, setClasses] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [progressRows, setProgressRows] = useState<any[]>([]);
  const [attemptLogs, setAttemptLogs] = useState<any[]>([]);
  const [modules, setModules] = useState<any[]>([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedModuleId, setSelectedModuleId] = useState('all');
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [toastMsg, setToastMsg] = useState('');
  const [showToast, setShowToast] = useState(false);

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
      const requestedClassId = searchParams.get('class');
      setSelectedClassId((current) => current || requestedClassId || nextClasses[0]?.id || '');
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
    const unsubAttemptLogs = onSnapshot(collection(db, 'examAttemptLogs'), (snap) => {
      setAttemptLogs(snap.docs.map((attemptDoc) => ({ id: attemptDoc.id, ...attemptDoc.data() })));
    });
    const unsubEnrollments = onSnapshot(collection(db, 'classEnrollments'), (snap) => {
      setEnrollments(snap.docs.map((enrollmentDoc) => ({ id: enrollmentDoc.id, ...enrollmentDoc.data() })));
    });
    const unsubModules = onSnapshot(collection(db, 'modules'), (snap) => {
      const remoteModules = snap.docs.map((moduleDoc) => ({ id: moduleDoc.id, ...moduleDoc.data() }));
      setModules(remoteModules);
    });

    getDocs(collection(db, 'users')).then((snap) => {
      setStudents(snap.docs.map((userDoc) => ({ uid: userDoc.id, ...userDoc.data() })).filter((row: any) => row.role === 'student'));
    });

    return () => {
      unsubUid();
      unsubEmail();
      unsubProgress();
      unsubAttemptLogs();
      unsubEnrollments();
      unsubModules();
    };
  }, [user, searchParams]);

  const selectedClass = classes.find((classItem) => classItem.id === selectedClassId) || classes[0];
  const classStudentIds = useMemo(() => {
    const fromClassDoc = (selectedClass?.studentIds || selectedClass?.students || []).filter(Boolean);
    const fromEnrollments = enrollments.filter((enrollment) => enrollment.classId === selectedClass?.id).map((enrollment) => enrollment.studentId).filter(Boolean);
    return new Set([...fromClassDoc, ...fromEnrollments]);
  }, [selectedClass, enrollments]);
  const visibleStudents = students.filter((student) => classStudentIds.size === 0 || classStudentIds.has(student.uid));
  const classModules = modules.filter((module: any) => (
    selectedClass?.assignedModuleIds?.includes(module.id) ||
    module.classIds?.includes(selectedClass?.id) ||
    (module.publishScope === 'public' && selectedClass)
  ));
  const classModuleIds = new Set(classModules.map((module: any) => module.id));
  const moduleById = useMemo(() => new Map(modules.map((module: any) => [module.id, module])), [modules]);

  const matchesModuleFilter = (row: any) => (
    selectedModuleId === 'all'
      ? classModuleIds.size === 0 || classModuleIds.has(row.moduleId)
      : row.moduleId === selectedModuleId
  );

  const gradeRows = visibleStudents.map((student) => {
    const studentProgress = progressRows.filter((row) => row.userId === student.uid && matchesModuleFilter(row));
    const studentAttemptLogs = attemptLogs.filter((row) => row.userId === student.uid && matchesModuleFilter(row));
    const avgProgress = studentProgress.length
      ? Math.round(studentProgress.reduce((sum, row) => sum + (row.progressPercent || 0), 0) / studentProgress.length)
      : 0;
    const scoredRows = studentProgress.filter((row) => row.finalScore != null || row.firstFinalScore != null || row.latestFinalScore != null);
    const avgScore = scoredRows.length
      ? Math.round(scoredRows.reduce((sum, row) => sum + (row.firstFinalScore ?? row.finalScore ?? row.latestFinalScore ?? 0), 0) / scoredRows.length)
      : 0;
    const completed = studentProgress.filter((row) => row.status === 'completed' && (row.finalScore ?? row.firstFinalScore ?? 0) >= 85).length;
    const attempts = studentAttemptLogs.length || studentProgress.reduce((sum, row) => sum + (row.finalAttemptCount || row.failedAttempts || 0), 0);
    const warnings = studentAttemptLogs.length
      ? studentAttemptLogs.reduce((sum, row) => sum + (row.proctorWarnings || 0), 0)
      : studentProgress.reduce((sum, row) => sum + (row.proctorWarnings || 0), 0);
    const timeSpentSeconds = studentAttemptLogs.length
      ? studentAttemptLogs.reduce((sum, row) => sum + (row.timeSpentSeconds || 0), 0)
      : studentProgress.reduce((sum, row) => sum + (row.timeSpentSeconds || 0), 0);
    return { student, avgProgress, avgScore, completed, modules: studentProgress.length, attempts, warnings, timeSpentSeconds, loggedAttempts: studentAttemptLogs.length };
  }).sort((a, b) => b.avgScore - a.avgScore);

  const selectedGradeRow = gradeRows.find((row) => row.student.uid === selectedStudentId) || gradeRows[0];
  const selectedStudent = selectedGradeRow?.student;
  const selectedStudentProgress = selectedStudent
    ? progressRows.filter((row) => row.userId === selectedStudent.uid && matchesModuleFilter(row))
    : [];
  const selectedStudentAttempts = selectedStudent
    ? attemptLogs
      .filter((row) => row.userId === selectedStudent.uid && matchesModuleFilter(row))
      .sort((a, b) => toMillis(b.createdAt || b.startedAtMillis) - toMillis(a.createdAt || a.startedAtMillis))
    : [];

  const updateClassSetting = async (field: 'showGradesToStudents' | 'leaderboardEnabled', value: boolean) => {
    if (!selectedClass) return;
    const previousValue = !!selectedClass[field];
    setClasses((current) => current.map((classItem) => classItem.id === selectedClass.id ? { ...classItem, [field]: value } : classItem));
    try {
      await updateDoc(doc(db, 'classes', selectedClass.id), { [field]: value });
      setToastMsg(field === 'showGradesToStudents'
        ? `Grade visibility ${value ? 'enabled' : 'hidden'} for this class.`
        : `Leaderboard ${value ? 'enabled' : 'hidden'} for this class.`);
      setShowToast(true);
    } catch (error) {
      console.warn('Unable to update class gradebook setting', error);
      setClasses((current) => current.map((classItem) => classItem.id === selectedClass.id ? { ...classItem, [field]: previousValue } : classItem));
      setToastMsg('Unable to update gradebook setting.');
      setShowToast(true);
    }
  };

  return (
    <InstructorLayout title="Gradebook">
      <div className="p-4 md:p-8 max-w-7xl mx-auto w-full text-on-surface space-y-6">
        <section className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-primary mb-2">Instructor grade control</p>
              <h1 className="text-3xl font-extrabold font-headline">Student grades, visibility, and leaderboard</h1>
              <p className="text-sm text-on-surface-variant mt-2">Click a student to inspect progress, attempts, time spent, and assessment warnings.</p>
            </div>
            <select
              value={selectedClass?.id || ''}
              onChange={(event) => {
                setSelectedClassId(event.target.value);
                setSelectedStudentId('');
              }}
              className="bg-surface-container border border-outline-variant/30 rounded-xl px-4 py-3 text-sm font-bold outline-none"
            >
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

        <section className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-5 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <h2 className="font-headline font-extrabold text-xl flex items-center gap-2"><BookOpen size={20} className="text-primary" /> Class modules</h2>
              <p className="text-sm text-on-surface-variant/60 mt-1">Filter progress by the modules posted to this class.</p>
            </div>
            <select value={selectedModuleId} onChange={(event) => setSelectedModuleId(event.target.value)} className="bg-surface-container border border-outline-variant/30 rounded-xl px-4 py-3 text-sm font-bold outline-none">
              <option value="all">All class modules</option>
              {classModules.map((module: any) => <option key={module.id} value={module.id}>{module.title}</option>)}
            </select>
          </div>
        </section>

        {selectedClass?.leaderboardEnabled && (
          <section className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="font-headline font-extrabold text-xl flex items-center gap-2"><Trophy size={20} className="text-primary" /> Leaderboard preview</h2>
              <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-black text-primary">Visible to students</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {gradeRows.slice(0, 3).map((row, index) => (
                <button key={row.student.uid} onClick={() => setSelectedStudentId(row.student.uid)} className="rounded-2xl border border-outline-variant/30 bg-surface-container p-4 text-left hover:border-primary/40">
                  <p className="text-xs font-black uppercase tracking-widest text-primary">Rank #{index + 1}</p>
                  <p className="mt-2 font-extrabold text-on-surface">{row.student.fullName || row.student.email}</p>
                  <p className="mt-1 text-sm font-black text-primary">{row.avgScore}% average</p>
                </button>
              ))}
            </div>
          </section>
        )}

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
                  <th className="px-5 py-4">Attempts</th>
                  <th className="px-5 py-4">Logs</th>
                  <th className="px-5 py-4">Time</th>
                  <th className="px-5 py-4">Warnings</th>
                  <th className="px-5 py-4">Rank</th>
                </tr>
              </thead>
              <tbody>
                {gradeRows.map((row, index) => (
                  <tr
                    key={row.student.uid}
                    onClick={() => setSelectedStudentId(row.student.uid)}
                    className={`cursor-pointer border-t border-outline-variant/20 transition-colors ${selectedStudent?.uid === row.student.uid ? 'bg-primary/5' : 'hover:bg-surface-container/60'}`}
                  >
                    <td className="px-5 py-4">
                      <p className="font-extrabold text-on-surface">{row.student.fullName || row.student.email}</p>
                      <p className="text-xs text-on-surface-variant/50">{row.student.email}</p>
                    </td>
                    <td className="px-5 py-4 font-black text-primary">{row.avgScore}%</td>
                    <td className="px-5 py-4">{row.avgProgress}%</td>
                    <td className="px-5 py-4">{row.completed} / {row.modules}</td>
                    <td className="px-5 py-4">{row.attempts}</td>
                    <td className="px-5 py-4">{row.loggedAttempts}</td>
                    <td className="px-5 py-4"><span className="inline-flex items-center gap-1"><Clock size={13} /> {formatDuration(row.timeSpentSeconds)}</span></td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center gap-1 ${row.warnings > 0 ? 'text-error font-black' : 'text-on-surface-variant'}`}>
                        <ShieldAlert size={13} />
                        {row.warnings}
                      </span>
                    </td>
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
                    <td colSpan={9} className="px-5 py-12 text-center text-on-surface-variant/40 font-bold">No student progress yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {selectedStudent && (
          <StudentGradeReport
            row={selectedGradeRow}
            progressRows={selectedStudentProgress}
            attemptLogs={selectedStudentAttempts}
            moduleById={moduleById}
          />
        )}
      </div>
      <Toast
        isVisible={showToast}
        message={toastMsg}
        onClose={() => setShowToast(false)}
        type={toastMsg.includes('Unable') ? 'error' : 'success'}
      />
    </InstructorLayout>
  );
}

function StudentGradeReport({
  row,
  progressRows,
  attemptLogs,
  moduleById,
}: {
  row: any;
  progressRows: any[];
  attemptLogs: any[];
  moduleById: Map<string, any>;
}) {
  const reasons = Array.from(new Set([
    ...progressRows.flatMap((progress) => progress.proctorWarningReasons || []),
    ...attemptLogs.flatMap((attempt) => attempt.proctorWarningReasons || []),
  ].filter(Boolean)));

  return (
    <section className="bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-sm overflow-hidden">
      <div className="border-b border-outline-variant p-5">
        <p className="text-xs font-black uppercase tracking-widest text-primary mb-2">Individual grade report</p>
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div>
            <h2 className="font-headline text-2xl font-black text-on-surface">{row.student.fullName || row.student.email}</h2>
            <p className="text-sm text-on-surface-variant/60">{row.student.email}</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <ReportStat label="Average" value={`${row.avgScore}%`} />
            <ReportStat label="Progress" value={`${row.avgProgress}%`} />
            <ReportStat label="Attempts" value={row.attempts} />
            <ReportStat label="Warnings" value={row.warnings} danger={row.warnings > 0} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_420px] gap-5 p-5">
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-headline font-extrabold text-xl flex items-center gap-2"><ListChecks size={18} className="text-primary" /> Module progress</h3>
            <span className="rounded-full bg-surface-container px-3 py-1 text-xs font-black text-on-surface-variant">{progressRows.length} module records</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {progressRows.map((progress) => {
              const module = moduleById.get(progress.moduleId);
              const firstScore = progress.firstFinalScore ?? progress.finalScore ?? progress.latestFinalScore;
              const latestScore = progress.latestFinalScore ?? progress.finalScore ?? progress.firstFinalScore;
              const partScores = Object.entries(progress.partScores || {});
              return (
                <article key={progress.id} className="rounded-2xl border border-outline-variant/30 bg-surface-container p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-extrabold text-on-surface">{module?.title || progress.moduleTitle || progress.moduleId}</p>
                      <p className="mt-1 text-xs font-black uppercase tracking-widest text-primary">{formatState(progress.moduleState || progress.status || progress.phase)}</p>
                    </div>
                    {progress.status === 'completed' ? <CheckCircle2 size={20} className="text-emerald-500" /> : <ChevronRight size={18} className="text-on-surface-variant/40" />}
                  </div>
                  <div className="mt-4 h-2 rounded-full bg-surface-container-lowest">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, progress.progressPercent || 0)}%` }} />
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                    <MiniMetric label="Progress" value={`${progress.progressPercent || 0}%`} />
                    <MiniMetric label="First final" value={firstScore == null ? 'None' : `${firstScore}%`} />
                    <MiniMetric label="Latest final" value={latestScore == null ? 'None' : `${latestScore}%`} />
                    <MiniMetric label="Attempts" value={progress.finalAttemptCount || 0} />
                    <MiniMetric label="Time" value={formatDuration(progress.timeSpentSeconds || 0)} />
                    <MiniMetric label="Warnings" value={progress.proctorWarnings || 0} danger={(progress.proctorWarnings || 0) > 0} />
                  </div>
                  {partScores.length > 0 && (
                    <div className="mt-4 rounded-xl bg-surface-container-lowest p-3">
                      <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/50">Mini quiz scores</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {partScores.map(([partId, score], index) => (
                          <span key={partId} className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">Part {index + 1}: {Number(score)}%</span>
                        ))}
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
            {progressRows.length === 0 && (
              <div className="rounded-2xl border border-outline-variant/30 bg-surface-container p-8 text-center text-sm font-bold text-on-surface-variant/50">
                This student has not started the selected module filter yet.
              </div>
            )}
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-outline-variant/30 bg-surface-container p-4">
            <h3 className="font-headline font-extrabold text-lg flex items-center gap-2"><AlertTriangle size={18} className={reasons.length ? 'text-error' : 'text-primary'} /> Warning record</h3>
            {reasons.length ? (
              <div className="mt-3 space-y-2">
                {reasons.map((reason) => (
                  <p key={reason} className="rounded-xl bg-error/10 px-3 py-2 text-xs font-bold text-error">{reason}</p>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-on-surface-variant/60">No copied text, tab switch, focus loss, or fullscreen warnings recorded in this filter.</p>
            )}
          </div>

          <div className="rounded-2xl border border-outline-variant/30 bg-surface-container p-4">
            <h3 className="font-headline font-extrabold text-lg">Exam attempt history</h3>
            <div className="mt-3 max-h-[520px] space-y-3 overflow-y-auto pr-1">
              {attemptLogs.map((attempt) => {
                const attemptReasons = attempt.proctorWarningReasons || [];
                return (
                  <article key={attempt.id} className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-extrabold text-on-surface">{attempt.moduleTitle || moduleById.get(attempt.moduleId)?.title || 'Final exam'}</p>
                        <p className="text-[11px] text-on-surface-variant/50">{formatDate(attempt.createdAt || attempt.startedAtMillis)}</p>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-xs font-black ${attempt.passed ? 'bg-emerald-500/10 text-emerald-600' : 'bg-error/10 text-error'}`}>
                        {attempt.passed ? 'Passed' : 'Failed'}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <MiniMetric label="Attempt" value={`#${attempt.attemptNumber || 1}`} />
                      <MiniMetric label="Raw score" value={`${attempt.rawScore ?? 0}%`} />
                      <MiniMetric label="Recorded" value={`${attempt.officialScore ?? attempt.rawScore ?? 0}%`} />
                      <MiniMetric label="Time" value={formatDuration(attempt.timeSpentSeconds || 0)} />
                      <MiniMetric label="Answered" value={`${attempt.answeredCount || 0}/${attempt.questionCount || 0}`} />
                      <MiniMetric label="Warnings" value={attempt.proctorWarnings || 0} danger={(attempt.proctorWarnings || 0) > 0} />
                    </div>
                    {attemptReasons.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {attemptReasons.map((reason: string) => (
                          <span key={reason} className="rounded-full bg-error/10 px-3 py-1 text-[11px] font-bold text-error">{reason}</span>
                        ))}
                      </div>
                    )}
                  </article>
                );
              })}
              {attemptLogs.length === 0 && (
                <p className="rounded-xl bg-surface-container-lowest p-4 text-sm font-bold text-on-surface-variant/50">No exam attempts recorded yet.</p>
              )}
            </div>
          </div>
        </aside>
      </div>
    </section>
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
        <button type="button" onClick={onToggle} className={`w-12 h-7 rounded-full p-1 transition-colors ${enabled ? 'bg-primary' : 'bg-surface-container'}`}>
          <span className={`block w-5 h-5 rounded-full bg-white transition-transform ${enabled ? 'translate-x-5' : ''}`} />
        </button>
      </div>
      <p className="mt-4 text-xs font-black uppercase tracking-widest text-on-surface-variant/50 inline-flex items-center gap-2">
        {enabled ? <Eye size={14} /> : <EyeOff size={14} />}
        {enabled ? 'Enabled' : 'Hidden'}
      </p>
    </div>
  );
}

function ReportStat({ label, value, danger = false }: { label: string; value: React.ReactNode; danger?: boolean }) {
  return (
    <div className="rounded-xl border border-outline-variant/30 bg-surface-container px-4 py-3">
      <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/50">{label}</p>
      <p className={`mt-1 text-xl font-black ${danger ? 'text-error' : 'text-on-surface'}`}>{value}</p>
    </div>
  );
}

function MiniMetric({ label, value, danger = false }: { label: string; value: React.ReactNode; danger?: boolean }) {
  return (
    <div className="rounded-lg bg-surface-container-lowest px-3 py-2">
      <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/45">{label}</p>
      <p className={`mt-1 font-black ${danger ? 'text-error' : 'text-on-surface'}`}>{value}</p>
    </div>
  );
}

function formatDuration(totalSeconds: number) {
  if (!totalSeconds) return '0m';
  const minutes = Math.round(totalSeconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function toMillis(value: any) {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  const parsed = Date.parse(String(value));
  return Number.isNaN(parsed) ? 0 : parsed;
}

function formatDate(value: any) {
  const millis = toMillis(value);
  if (!millis) return 'No date recorded';
  return new Date(millis).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function formatState(value: string) {
  return String(value || 'not_started').replace(/_/g, ' ');
}
