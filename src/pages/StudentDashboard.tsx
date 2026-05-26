import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import {
  AlertTriangle,
  Award,
  BarChart,
  BookMarked,
  BookOpen,
  Brain,
  ChevronRight,
  Clock,
  ClipboardList,
  FileText,
  PlayCircle,
  Target,
} from 'lucide-react';
import StudentLayout from '../components/StudentLayout';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/firebase';
import { journeyModules } from '../lib/learningJourney';
import { buildStudyPlan, getRecallInsights } from '../lib/learningInsights';

type DashboardModule = {
  id: string;
  title: string;
  description?: string;
  duration?: string;
  dueAt?: string;
  status: string;
  progress: number;
  phase?: string;
  finalScore?: number;
};

function toDate(value: any): Date | null {
  if (!value) return null;
  const date = value?.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatScore(value?: number | null) {
  return typeof value === 'number' ? `${Math.round(value)}%` : '0%';
}

function moduleStatus(progress: any) {
  if (!progress) return 'Available';
  if (progress.status === 'completed' && (progress.finalScore ?? 0) >= 85) return 'Completed';
  if (progress.moduleState === 'review_required') return 'Review required';
  if (progress.moduleState === 'ready_for_final_exam' || progress.phase === 'finalExam') return 'Ready for final';
  if (progress.moduleState === 'paused') return 'Paused';
  return 'In progress';
}

export default function StudentDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [classData, setClassData] = useState<any>(null);
  const [activeModules, setActiveModules] = useState<DashboardModule[]>([]);
  const [progressRows, setProgressRows] = useState<any[]>([]);
  const [progressByModuleState, setProgressByModuleState] = useState<Record<string, any>>({});
  const [diagnosticAttempts, setDiagnosticAttempts] = useState<any[]>([]);
  const [mockAttempts, setMockAttempts] = useState<any[]>([]);
  const [mistakeCount, setMistakeCount] = useState(0);

  useEffect(() => {
    const fetchData = async () => {
      if (!user) return;
      setIsLoading(true);
      try {
        const profileSnap = await getDoc(doc(db, 'learnerProfiles', user.uid));
        setProfile(profileSnap.exists() ? profileSnap.data() : null);

        const progressSnap = await getDocs(query(collection(db, 'moduleProgress'), where('userId', '==', user.uid)));
        const rows = progressSnap.docs.map((progressDoc) => ({ id: progressDoc.id, ...progressDoc.data() }));
        setProgressRows(rows);
        const progressMap = Object.fromEntries(rows.filter((row: any) => row.moduleId).map((row: any) => [row.moduleId, row]));
        setProgressByModuleState(progressMap);

        const diagnosticSnap = await getDocs(query(collection(db, 'diagnosticAttempts'), where('userId', '==', user.uid)));
        setDiagnosticAttempts(diagnosticSnap.docs.map((attemptDoc) => ({ id: attemptDoc.id, ...attemptDoc.data() }))
          .sort((a: any, b: any) => (toDate(b.completedAt)?.getTime() || 0) - (toDate(a.completedAt)?.getTime() || 0)));

        const mockSnap = await getDocs(query(collection(db, 'mockExamAttempts'), where('userId', '==', user.uid)));
        setMockAttempts(mockSnap.docs.map((attemptDoc) => ({ id: attemptDoc.id, ...attemptDoc.data() }))
          .sort((a: any, b: any) => (toDate(b.completedAt)?.getTime() || 0) - (toDate(a.completedAt)?.getTime() || 0)));

        const mistakeSnap = await getDocs(query(collection(db, 'mistakeBank'), where('userId', '==', user.uid)));
        setMistakeCount(mistakeSnap.size);

        let classInfo: any = null;
        if (user.activeClassId) {
          const classRef = await getDoc(doc(db, 'classes', user.activeClassId));
          if (classRef.exists()) classInfo = { id: classRef.id, ...classRef.data() };
        }
        setClassData(classInfo);

        const moduleIds: string[] = user.activeClassId && classInfo?.assignedModuleIds?.length
          ? classInfo.assignedModuleIds.filter(Boolean)
          : rows.map((row: any) => row.moduleId).filter(Boolean);
        const uniqueModuleIds = Array.from(new Set<string>(moduleIds));
        const loadedModules: DashboardModule[] = [];

        for (const moduleId of uniqueModuleIds) {
          const localModule = journeyModules.find((module) => module.id === moduleId);
          let remoteModule: any = null;
          try {
            const moduleSnap = await getDoc(doc(db, 'modules', moduleId));
            if (moduleSnap.exists()) remoteModule = moduleSnap.data();
          } catch {
            remoteModule = null;
          }

          const progress = progressMap[moduleId];
          loadedModules.push({
            id: moduleId,
            title: remoteModule?.title || localModule?.title || `Reviewer ${String(moduleId).slice(0, 4)}`,
            description: remoteModule?.description || localModule?.description || 'LET reviewer module',
            duration: remoteModule?.duration || localModule?.duration || '',
            dueAt: remoteModule?.dueAt || '',
            status: moduleStatus(progress),
            progress: progress?.progressPercent ?? 0,
            phase: progress?.phase || progress?.moduleState || '',
            finalScore: progress?.finalScore,
          });
        }
        setActiveModules(loadedModules);
      } catch (error) {
        console.error('Failed to fetch dashboard data', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [user]);

  const latestDiagnostic = diagnosticAttempts[0];
  const latestMock = mockAttempts[0];
  const diagnosticScore = latestDiagnostic?.scorePercent ?? null;
  const mockAverage = mockAttempts.length
    ? Math.round(mockAttempts.reduce((sum, attempt) => sum + Number(attempt.scorePercent || 0), 0) / mockAttempts.length)
    : null;
  const completedModules = progressRows.filter((row: any) => row.status === 'completed' && (row.finalScore ?? 0) >= 85).length;
  const startedModules = progressRows.length;
  const moduleCompletionScore = activeModules.length ? Math.round((completedModules / activeModules.length) * 100) : 0;
  const boardReadiness = Math.round(((diagnosticScore ?? 0) * 0.25) + ((mockAverage ?? 0) * 0.45) + (moduleCompletionScore * 0.30));
  const hasAnyRecordedActivity = !!latestDiagnostic || mockAttempts.length > 0 || progressRows.length > 0 || mistakeCount > 0;
  const weakTopicLabel = profile?.weakTopics?.[0]
    || Object.entries(profile?.masteryByTopic || {}).sort((a: any, b: any) => a[1] - b[1])[0]?.[0]
    || '';
  const strongTopicLabel = profile?.strongTopics?.[0]
    || Object.entries(profile?.masteryByTopic || {}).sort((a: any, b: any) => b[1] - a[1])[0]?.[0]
    || '';
  const recallInsights = getRecallInsights(profile);
  const nextModule = activeModules.find((module) => module.progress > 0 && module.progress < 100) || activeModules.find((module) => module.progress === 0);
  const studyPlan = buildStudyPlan({ modules: activeModules, recallInsights, weakTopicLabel, progressByModule: progressByModuleState });
  const isClassMode = user?.learningMode === 'class_based';
  const isJoinedToClass = isClassMode && !!user?.activeClassId && !!classData;
  const reviewTrackLabel = useMemo(() => {
    if ((user as any)?.reviewTrack === 'secondary') return `Secondary LET${(user as any)?.specialization ? ` / ${(user as any).specialization}` : ''}`;
    if ((user as any)?.reviewTrack === 'specialization') return (user as any)?.specialization || 'Specialization review';
    return 'Elementary LET';
  }, [user]);
  const readinessLabel = boardReadiness >= 85 ? 'Board-ready signal' : boardReadiness >= 70 ? 'Near-ready' : hasAnyRecordedActivity ? 'Building readiness' : 'Not started';

  return (
    <StudentLayout title="LET Review Command Center">
      <div className="space-y-8">
        <section className="relative overflow-hidden bg-surface-container-lowest border border-outline-variant rounded-3xl p-6 md:p-8 shadow-sm">
          <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="max-w-3xl">
              <p className="text-xs font-black uppercase tracking-widest text-primary mb-2">AI-powered LET review simulator</p>
              <h1 className="text-2xl md:text-3xl font-extrabold font-headline text-on-surface">
                {isJoinedToClass
                  ? `You are enrolled in ${classData.className || 'your professor-guided LET review class'}.`
                  : isClassMode
                    ? 'You chose professor-guided review. Join your class to unlock private materials.'
                    : 'You are reviewing independently.'}
              </h1>
              <p className="text-sm text-on-surface-variant mt-3 leading-relaxed">
                {isJoinedToClass
                  ? `Instructor: ${classData.instructorName || 'Your professor'}. Public reviewers stay available, and class materials are layered on top.`
                  : isClassMode
                    ? 'Enter your class code from the Join Class button. Until then, you can still use public LET reviewers and diagnostics.'
                    : hasAnyRecordedActivity
                      ? 'Your recommendations below come from recorded diagnostics, module progress, mock exams, and mistakes.'
                      : 'You have no progress yet. Start with a diagnostic exam or explore public LET reviewers.'}
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  onClick={() => navigate('/diagnostic')}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary text-on-primary px-5 py-3 text-sm font-bold"
                >
                  {latestDiagnostic ? 'Retake diagnostic' : 'Start diagnostic'}
                  <ChevronRight size={16} />
                </button>
                <button
                  onClick={() => navigate('/student/courses')}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-surface-container text-on-surface px-5 py-3 text-sm font-bold border border-outline-variant"
                >
                  Explore public reviewers
                </button>
                {!isJoinedToClass && (
                  <button
                    onClick={() => navigate('/join-class')}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-surface-container text-on-surface px-5 py-3 text-sm font-bold border border-outline-variant"
                  >
                    Join professor class
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 min-w-full lg:min-w-[360px] lg:max-w-[380px]">
              <StatCard icon={Target} label="Board readiness" value={`${boardReadiness}%`} sublabel={readinessLabel} />
              <StatCard icon={ClipboardList} label="Review track" value={reviewTrackLabel} sublabel={user?.learningMode === 'class_based' ? 'Class overlay' : 'Self-study'} />
              <StatCard icon={AlertTriangle} label="Mistake bank" value={String(mistakeCount)} sublabel="Saved wrong answers" />
              <StatCard icon={BookOpen} label="Active modules" value={String(startedModules)} sublabel={`${completedModules} completed`} />
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <MetricTile title="Diagnostic" value={formatScore(diagnosticScore)} detail={latestDiagnostic ? `${diagnosticAttempts.length} attempt${diagnosticAttempts.length === 1 ? '' : 's'}` : 'Not taken'} />
          <MetricTile title="Mock exams" value={formatScore(mockAverage)} detail={mockAttempts.length ? `${mockAttempts.length} recorded` : 'None taken'} />
          <MetricTile title="Weak area" value={weakTopicLabel || 'None yet'} detail={weakTopicLabel ? 'From recorded answers' : 'Needs diagnostic data'} />
          <MetricTile title="Strong area" value={strongTopicLabel || 'None yet'} detail={strongTopicLabel ? 'From recorded answers' : 'Needs diagnostic data'} />
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-extrabold font-headline text-on-surface flex items-center gap-2">
                  <BookMarked className="text-primary" size={22} />
                  {isJoinedToClass ? 'Class and Active Reviewers' : 'Continue Where You Left Off'}
                </h2>
                <button onClick={() => navigate('/student/courses')} className="text-primary text-xs font-bold uppercase tracking-widest hover:underline">View Reviewers</button>
              </div>

              <div className="space-y-4">
                {isLoading && (
                  <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-8 text-center text-sm font-bold text-on-surface-variant">
                    Loading recorded review activity...
                  </div>
                )}
                {!isLoading && activeModules.length === 0 && (
                  <div className="bg-surface-container-lowest border border-dashed border-outline-variant rounded-2xl p-8 text-center">
                    <BookOpen className="mx-auto text-on-surface-variant/30 mb-4" size={42} />
                    <h3 className="font-extrabold text-on-surface">No active reviewer modules yet.</h3>
                    <p className="text-sm text-on-surface-variant mt-2">
                      Public modules appear here only after you start them. Class modules appear after your professor assigns them.
                    </p>
                    <button onClick={() => navigate('/student/courses')} className="mt-5 rounded-xl bg-primary text-on-primary px-5 py-3 text-sm font-bold">
                      Browse LET reviewers
                    </button>
                  </div>
                )}
                {activeModules.map((module) => (
                  <article key={module.id} className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-5 shadow-sm group hover:border-primary/40 transition-colors">
                    <div className="flex items-start justify-between mb-4 gap-4">
                      <div>
                        <span className="inline-block px-2.5 py-1 bg-surface-container text-[10px] font-bold uppercase tracking-widest rounded-md text-on-surface-variant mb-2">{module.status}</span>
                        <h3 className="font-bold text-lg text-on-surface leading-tight mb-1">{module.title}</h3>
                        <p className="text-xs font-medium text-on-surface-variant flex items-center gap-1.5">
                          <Clock size={12} /> {module.duration || 'Self-paced'} {module.dueAt ? `/ Due ${new Date(module.dueAt).toLocaleDateString()}` : ''}
                        </p>
                      </div>
                      <button
                        onClick={() => navigate(`/quest?moduleId=${module.id}`)}
                        className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center group-hover:bg-primary group-hover:text-on-primary transition-colors shrink-0"
                        title={module.progress > 0 ? 'Resume reviewer' : 'Start reviewer'}
                      >
                        <PlayCircle size={20} />
                      </button>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-2 bg-surface-container rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full transition-all duration-1000" style={{ width: `${module.progress}%` }}></div>
                      </div>
                      <span className="text-xs font-bold text-on-surface">{module.progress}%</span>
                    </div>

                    {module.progress > 0 && module.progress < 100 && (
                      <div className="mt-4 pt-4 border-t border-outline-variant flex items-center gap-2 text-xs font-medium text-on-surface-variant">
                        <FileText size={14} className="text-tertiary" /> Continue from your saved section or current activity.
                      </div>
                    )}
                    {module.status === 'Review required' && (
                      <div className="mt-4 rounded-xl border border-error/20 bg-error/10 p-3 text-xs font-bold text-error">
                        Final mastery check was not passed. Revisit weak sections before the next fresh attempt.
                      </div>
                    )}
                  </article>
                ))}
              </div>
            </section>

            <section className="bg-secondary-container/20 border border-secondary-container/30 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 bg-surface-container rounded-xl flex items-center justify-center text-primary shadow-sm border border-outline-variant/30">
                  <Brain size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-extrabold font-headline text-on-surface leading-tight">AI Review Mentor</h2>
                  <p className="text-xs text-on-surface-variant font-medium">Recommendations use only recorded performance.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {!hasAnyRecordedActivity && (
                  <RecommendationCard
                    label="Start here"
                    title="Take the diagnostic or open a public reviewer"
                    body="The AI mentor needs real answers before it can identify weak areas. Nothing is assumed yet."
                    icon={Target}
                    onClick={() => navigate('/diagnostic')}
                  />
                )}
                {recallInsights[0] && (
                  <RecommendationCard
                    label="Recall due"
                    title={`Your mastery in ${recallInsights[0].topicId} is getting weaker.`}
                    body={`Mastery faded from ${recallInsights[0].mastery}% to about ${recallInsights[0].decayedMastery}% after ${recallInsights[0].daysSinceReview} days without review.`}
                    icon={Clock}
                    onClick={() => navigate('/flashcards')}
                  />
                )}
                {weakTopicLabel && (
                  <RecommendationCard
                    label="Review needed"
                    title={weakTopicLabel}
                    body="Study the related reviewer sections and retry saved mistakes before the next mock exam."
                    icon={AlertTriangle}
                    onClick={() => navigate('/mistake-bank')}
                  />
                )}
                {nextModule && (
                  <RecommendationCard
                    label="Next best step"
                    title={nextModule.title}
                    body={nextModule.progress > 0 ? 'Resume where you paused and finish the next checkpoint.' : 'Start this assigned or active reviewer module.'}
                    icon={BookOpen}
                    onClick={() => navigate(`/quest?moduleId=${nextModule.id}`)}
                  />
                )}
              </div>
            </section>
          </div>

          <div className="space-y-6">
            {(classData?.showGradesToStudents || classData?.leaderboardEnabled) && (
              <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 shadow-sm">
                <h3 className="font-extrabold font-headline text-on-surface mb-4 flex items-center gap-2">
                  <Award size={18} className="text-primary" /> Class Grade View
                </h3>
                {classData?.showGradesToStudents && (
                  <div className="grid grid-cols-2 gap-3">
                    <MetricTile title="Module Avg" value={formatScore(progressRows.length ? Math.round(progressRows.reduce((sum, row) => sum + Number(row.finalScore || 0), 0) / progressRows.length) : null)} detail="Visible by instructor setting" />
                    <MetricTile title="Passed" value={String(completedModules)} detail="85% or higher" />
                  </div>
                )}
                {classData?.leaderboardEnabled && (
                  <div className="mt-3 rounded-xl bg-primary/10 text-primary border border-primary/20 p-3 text-xs font-bold">
                    Leaderboard is enabled for this class. Rankings are based on instructor-visible recorded results.
                  </div>
                )}
              </div>
            )}

            <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 shadow-sm">
              <h3 className="font-extrabold font-headline text-on-surface mb-4 flex items-center gap-2">
                <Clock size={18} className="text-on-surface-variant/60" /> Weekly study plan
              </h3>
              <p className="text-xs text-on-surface-variant/60 mb-4">Generated from real deadlines, progress, weak areas, and recall needs.</p>
              <div className="space-y-4">
                {studyPlan.length === 0 && (
                  <p className="rounded-xl border border-outline-variant/30 bg-surface-container/30 p-3 text-xs font-bold text-on-surface-variant/60">
                    No study plan yet. Start a diagnostic or reviewer module first.
                  </p>
                )}
                {studyPlan.map((item, index) => (
                  <button key={`${item.title}-${index}`} onClick={() => navigate(item.targetLink)} className="w-full flex gap-4 text-left">
                    <div className="flex flex-col items-center min-w-10">
                      <span className={`text-[10px] font-bold uppercase tracking-widest ${item.priority === 'high' ? 'text-error' : item.priority === 'medium' ? 'text-primary' : 'text-on-surface-variant/50'}`}>{item.dayLabel || (index === 0 ? 'Today' : 'Later')}</span>
                      <span className="text-xl font-extrabold text-on-surface">{index + 1}</span>
                    </div>
                    <div className="bg-surface-container border border-outline-variant/40 p-3 rounded-xl flex-1 hover:border-primary/40 transition-colors">
                      <p className="text-xs font-bold text-on-surface leading-tight mb-1">{item.title}</p>
                      <p className="text-[10px] text-on-surface-variant font-medium">{item.body}</p>
                      {item.minutes && <p className="text-[10px] text-primary font-black uppercase tracking-widest mt-2">{item.minutes} min</p>}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 shadow-sm">
              <h3 className="font-extrabold font-headline text-on-surface mb-5 flex items-center gap-2">
                <BarChart size={18} className="text-on-surface-variant/60" /> Readiness Signals
              </h3>
              <div className="space-y-4">
                <ProgressSignal label="Diagnostic baseline" value={diagnosticScore ?? 0} empty={!latestDiagnostic} />
                <ProgressSignal label="Mock exam average" value={mockAverage ?? 0} empty={!mockAttempts.length} />
                <ProgressSignal label="Reviewer completion" value={moduleCompletionScore} empty={!activeModules.length} />
              </div>
              <button onClick={() => navigate('/quiz-results')} className="w-full mt-6 text-center text-xs font-bold text-primary bg-primary/5 hover:bg-primary/10 py-2.5 rounded-xl transition-colors">
                View analytics
              </button>
            </div>
          </div>
        </div>
      </div>
    </StudentLayout>
  );
}

function StatCard({ icon: Icon, label, value, sublabel }: { icon: React.ElementType; label: string; value: string; sublabel: string }) {
  return (
    <div className="bg-surface-container rounded-2xl p-4 border border-outline-variant shadow-sm">
      <Icon size={20} className="text-primary mb-3" />
      <p className="text-[10px] font-bold text-on-surface-variant/50 uppercase tracking-widest">{label}</p>
      <p className="text-xl font-extrabold font-headline leading-tight mt-1">{value}</p>
      <p className="text-[10px] font-bold text-on-surface-variant/60 mt-1">{sublabel}</p>
    </div>
  );
}

function MetricTile({ title, value, detail }: { title: string; value: string; detail: string }) {
  return (
    <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-4 shadow-sm">
      <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/50">{title}</p>
      <p className="text-2xl font-black text-on-surface mt-1 truncate">{value}</p>
      <p className="text-[11px] font-bold text-on-surface-variant/60 mt-1">{detail}</p>
    </div>
  );
}

function RecommendationCard({ label, title, body, icon: Icon, onClick }: { label: string; title: string; body: string; icon: React.ElementType; onClick: () => void }) {
  return (
    <button onClick={onClick} className="bg-surface-container-lowest rounded-xl p-4 border border-outline-variant shadow-sm hover:border-primary/30 transition-colors text-left">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold bg-primary/10 text-primary px-2 py-0.5 rounded uppercase tracking-widest">{label}</span>
        <Icon size={14} className="text-primary" />
      </div>
      <h4 className="font-bold text-sm text-on-surface mb-1">{title}</h4>
      <p className="text-[11px] text-on-surface-variant leading-relaxed">{body}</p>
    </button>
  );
}

function ProgressSignal({ label, value, empty }: { label: string; value: number; empty: boolean }) {
  return (
    <div>
      <div className="flex justify-between text-xs font-bold mb-2">
        <span className="text-on-surface-variant uppercase tracking-widest">{label}</span>
        <span className="text-on-surface">{empty ? 'No data' : `${Math.round(value)}%`}</span>
      </div>
      <div className="h-1.5 w-full bg-surface-container rounded-full overflow-hidden">
        <div className="h-full bg-primary rounded-full" style={{ width: `${empty ? 0 : Math.max(0, Math.min(100, value))}%` }}></div>
      </div>
    </div>
  );
}
