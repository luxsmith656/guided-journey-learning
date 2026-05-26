import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, doc, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  FileQuestion,
  GraduationCap,
  Library,
  Lock,
  Map,
  PlayCircle,
  Plus,
  Search,
} from 'lucide-react';
import StudentLayout from '../components/StudentLayout';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/firebase';
import { JourneyModule, journeySubjects } from '../lib/learningJourney';

const statusLabel: Record<string, string> = {
  locked: 'Locked',
  available: 'Ready',
  in_progress: 'In progress',
  paused: 'Paused',
  ready_for_final_exam: 'Ready for final',
  review_required: 'Review required',
  completed: 'Completed',
  mastered: 'Mastered',
  assigned: 'Class assigned',
};

function normalizeFirestoreModule(id: string, data: any): JourneyModule {
  return {
    id,
    title: data.title || 'Untitled reviewer',
    description: data.description || 'Published LET reviewer module',
    subjectId: data.subjectId || data.categoryId || 'gened',
    topicId: data.topicId || 'gened_english',
    level: data.level || 1,
    duration: data.duration || '30 min',
    status: 'available',
    progress: 0,
    lessonBlocks: data.lessonBlocks || [],
    prerequisiteModuleIds: data.prerequisiteModuleIds || [],
    publishScope: data.publishScope || (data.classIds?.length ? 'classes' : 'public'),
    classIds: data.classIds || [],
    dueAt: data.dueAt || '',
    antiCheatEnabled: data.antiCheatEnabled ?? true,
    recordFirstAttemptOnly: data.recordFirstAttemptOnly ?? true,
    resources: data.resources?.map((resource: any, index: number) => ({
      id: resource.id || `${id}-resource-${index}`,
      type: resource.type || 'activity',
      title: resource.title || 'Learning activity',
      meta: resource.meta || 'Linked',
    })) || [
      { id: `${id}-textbook`, type: 'textbook', title: 'Reviewer reading', meta: 'Digital reviewer' },
      { id: `${id}-quiz`, type: 'quiz', title: 'Practice drill', meta: 'After starting' },
      { id: `${id}-exam`, type: 'exam', title: 'Mastery check', meta: 'After study' },
    ],
    questions: [],
    parts: data.parts || undefined,
    finalExam: data.finalExam || undefined,
    examBlueprint: data.examBlueprint || undefined,
    competencies: data.competencies || undefined,
    authorName: data.authorName || data.instructorName || '',
  };
}

function moduleProgressState(progress: any, isClassAssigned: boolean) {
  if (!progress && isClassAssigned) return 'assigned';
  if (!progress) return 'available';
  if (progress.moduleState) return progress.moduleState;
  if (progress.status === 'completed' && (progress.finalScore ?? 0) >= 85) return 'completed';
  return 'in_progress';
}

export default function StudentCourses() {
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();
  const allowedSubjects = useMemo(() => {
    const track = (user as any)?.reviewTrack;
    if (track === 'elementary') return journeySubjects.filter((subject) => subject.id !== 'major');
    return journeySubjects;
  }, [user]);
  const [selectedSubjectId, setSelectedSubjectId] = useState(allowedSubjects[0]?.id || journeySubjects[0].id);
  const [selectedTopicId, setSelectedTopicId] = useState(allowedSubjects[0]?.topics[0]?.id || journeySubjects[0].topics[0].id);
  const [searchTerm, setSearchTerm] = useState('');
  const [publishedModules, setPublishedModules] = useState<JourneyModule[]>([]);
  const [progressByModule, setProgressByModule] = useState<Record<string, any>>({});
  const [classData, setClassData] = useState<any>(null);

  useEffect(() => {
    const modulesQuery = query(collection(db, 'modules'), where('isPublished', '==', true));
    const unsubscribe = onSnapshot(modulesQuery, (snapshot) => {
      setPublishedModules(snapshot.docs.map((moduleDoc) => normalizeFirestoreModule(moduleDoc.id, moduleDoc.data())));
    }, (error) => {
      console.warn('Unable to load published reviewer modules', error);
      setPublishedModules([]);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const progressQuery = query(collection(db, 'moduleProgress'), where('userId', '==', user.uid));
    const unsubscribe = onSnapshot(progressQuery, (snapshot) => {
      const progressMap: Record<string, any> = {};
      snapshot.docs.forEach((progressDoc) => {
        const data = progressDoc.data();
        if (data.moduleId) progressMap[data.moduleId] = data;
      });
      setProgressByModule(progressMap);
    }, (error) => {
      console.warn('Unable to load reviewer progress', error);
      setProgressByModule({});
    });

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!user?.activeClassId) {
      setClassData(null);
      return;
    }
    const unsubscribe = onSnapshot(doc(db, 'classes', user.activeClassId), (snapshot) => {
      setClassData(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null);
    }, () => setClassData(null));
    return () => unsubscribe();
  }, [user?.activeClassId]);

  useEffect(() => {
    if (!allowedSubjects.some((subject) => subject.id === selectedSubjectId)) {
      const nextSubject = allowedSubjects[0] || journeySubjects[0];
      setSelectedSubjectId(nextSubject.id);
      setSelectedTopicId(nextSubject.topics[0]?.id || '');
    }
  }, [allowedSubjects, selectedSubjectId]);

  const selectedSubject = allowedSubjects.find((subject) => subject.id === selectedSubjectId) || allowedSubjects[0] || journeySubjects[0];
  const selectedTopic = selectedSubject.topics.find((topic) => topic.id === selectedTopicId) || selectedSubject.topics[0];
  const assignedModuleIds = useMemo(() => new Set<string>(classData?.assignedModuleIds || []), [classData]);

  const visibleModules = useMemo(() => publishedModules
    .filter((module: any) => !(user as any)?.archivedModuleIds?.includes(module.id))
    .filter((module) => {
      if (module.publishScope === 'classes') return !!user?.activeClassId && (assignedModuleIds.has(module.id) || module.classIds?.includes(user.activeClassId));
      return module.publishScope === 'public' || !module.publishScope;
    })
    .map((module) => {
      const progress = progressByModule[module.id];
      const isClassAssigned = !!user?.activeClassId && (assignedModuleIds.has(module.id) || module.classIds?.includes(user.activeClassId));
      return {
        ...module,
        status: moduleProgressState(progress, isClassAssigned),
        progress: progress?.progressPercent ?? 0,
      } as JourneyModule;
    }), [publishedModules, progressByModule, user, assignedModuleIds]);

  const activeReviewers = useMemo(() => visibleModules.filter((module: any) => {
    const isClassAssigned = !!user?.activeClassId && (assignedModuleIds.has(module.id) || module.classIds?.includes(user.activeClassId));
    return !!progressByModule[module.id] || isClassAssigned;
  }), [visibleModules, progressByModule, user?.activeClassId, assignedModuleIds]);

  const publicReviewers = useMemo(() => visibleModules.filter((module) => !module.publishScope || module.publishScope === 'public'), [visibleModules]);
  const selectedPublicModules = publicReviewers.filter((module) => module.subjectId === selectedSubject.id && module.topicId === selectedTopic.id);
  const filteredTopics = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return selectedSubject.topics;
    return selectedSubject.topics.filter((topic) => {
      const modules = publicReviewers.filter((module) => module.topicId === topic.id);
      return (
        topic.title.toLowerCase().includes(term) ||
        topic.description.toLowerCase().includes(term) ||
        modules.some((module) => module.title.toLowerCase().includes(term))
      );
    });
  }, [searchTerm, selectedSubject, publicReviewers]);

  const completedCount = activeReviewers.filter((module) => module.status === 'completed' || module.status === 'mastered').length;

  const startReview = async (module: JourneyModule) => {
    if (!user) return;
    await setDoc(doc(db, 'moduleProgress', `${user.uid}_${module.id}`), {
      userId: user.uid,
      moduleId: module.id,
      moduleTitle: module.title,
      subjectId: module.subjectId,
      topicId: module.topicId,
      status: 'in_progress',
      moduleState: 'in_progress',
      currentPartIndex: 0,
      phase: 'intro',
      partScores: {},
      progressPercent: 0,
      source: module.publishScope === 'classes' ? 'class_assigned' : 'public_self_review',
      activeClassId: module.publishScope === 'classes' ? user.activeClassId || null : null,
      startedAt: serverTimestamp(),
      lastAccessedAt: serverTimestamp(),
    }, { merge: true });
    navigate(`/quest?moduleId=${module.id}`);
  };

  const openModule = (module: JourneyModule, locked: boolean) => {
    if (locked) return;
    if (progressByModule[module.id]) {
      navigate(`/quest?moduleId=${module.id}`);
      return;
    }
    startReview(module);
  };

  const archiveModule = async (moduleId: string) => {
    if (!user) return;
    const archived = new Set((user as any).archivedModuleIds || []);
    archived.add(moduleId);
    await updateDoc(doc(db, 'users', user.uid), { archivedModuleIds: Array.from(archived) });
    await refreshUser();
  };

  const archiveClass = async () => {
    if (!user?.activeClassId) return;
    const archived = new Set((user as any).archivedClassIds || []);
    archived.add(user.activeClassId);
    await updateDoc(doc(db, 'users', user.uid), {
      archivedClassIds: Array.from(archived),
      activeClassId: null,
      learningMode: 'self_review',
    });
    await refreshUser();
  };

  return (
    <StudentLayout title="LET Reviewers">
      <div className="space-y-6">
        <section className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-5 md:p-6 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
            <div className="max-w-2xl">
              <div className="flex items-center gap-2 text-primary text-xs font-black uppercase tracking-widest mb-2">
                <Map size={16} />
                LET review center
              </div>
              <h1 className="text-2xl md:text-3xl font-extrabold font-headline text-on-surface tracking-tight">
                Active reviewers are separated from public modules you can explore.
              </h1>
              <p className="text-sm text-on-surface-variant mt-3 leading-relaxed">
                Public reviewers do not count as progress until you click Start Review. Class reviewers appear only when a real enrolled class assigns them.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3 min-w-full lg:min-w-[360px]">
              <Stat label="Active" value={activeReviewers.length} />
              <Stat label="Public" value={publicReviewers.length} />
              <Stat label="Completed" value={completedCount} />
            </div>
          </div>
        </section>

        <section className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-5 md:p-6 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-5">
            <div>
              <h2 className="text-xl font-extrabold font-headline text-on-surface">My Active Reviewers</h2>
              <p className="text-sm text-on-surface-variant mt-1">Only started public reviewers and real class-assigned modules appear here.</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => navigate('/join-class')} className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-surface-container text-on-surface font-bold text-sm border border-outline-variant hover:border-primary/40 transition-colors">
                <Plus size={16} />
                Join class
              </button>
              {user?.activeClassId && (
                <button onClick={archiveClass} className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-surface-container text-on-surface font-bold text-sm border border-outline-variant hover:border-error/40 transition-colors">
                  Archive class
                </button>
              )}
            </div>
          </div>

          {activeReviewers.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-outline-variant p-8 text-center">
              <BookOpen className="mx-auto text-on-surface-variant/30 mb-4" size={40} />
              <h3 className="font-extrabold text-on-surface">No active reviewers yet.</h3>
              <p className="text-sm text-on-surface-variant mt-2">Start a public reviewer below or join a professor class to receive assigned materials.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {activeReviewers.map((module) => {
                const progress = progressByModule[module.id];
                const missingPrerequisite = module.prerequisiteModuleIds?.some((id) => progressByModule[id]?.status !== 'completed' || (progressByModule[id]?.finalScore ?? 0) < 85);
                const isLocked = module.status === 'locked' || !!missingPrerequisite;
                return (
                  <ReviewerCard
                    key={module.id}
                    module={module}
                    locked={isLocked}
                    isActive={!!progress}
                    onOpen={() => openModule(module, isLocked)}
                    onArchive={() => archiveModule(module.id)}
                  />
                );
              })}
            </div>
          )}
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-6">
          <aside className="space-y-4">
            <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-headline font-extrabold text-lg text-on-surface">Explore Public Reviewers</h2>
                <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40">{allowedSubjects.length} tracks</span>
              </div>

              <div className="space-y-2">
                {allowedSubjects.map((subject) => {
                  const isSelected = subject.id === selectedSubject.id;
                  const modules = publicReviewers.filter((module) => module.subjectId === subject.id);
                  return (
                    <button
                      key={subject.id}
                      onClick={() => {
                        setSelectedSubjectId(subject.id);
                        setSelectedTopicId(subject.topics[0].id);
                      }}
                      className={`w-full text-left rounded-xl border p-4 transition-all ${isSelected ? 'border-primary bg-primary/10 text-primary' : 'border-outline-variant/30 bg-surface-container/30 text-on-surface hover:border-primary/40'}`}
                    >
                      <div className="flex items-start gap-3">
                        <span className={`w-2 h-10 rounded-full ${subject.accent} shrink-0`}></span>
                        <div className="min-w-0 flex-1">
                          <p className="font-extrabold leading-tight">{subject.title}</p>
                          <p className="text-[11px] text-on-surface-variant/60 mt-1 line-clamp-2">{subject.levelLabel}</p>
                          <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40 mt-3">{subject.topics.length} topics / {modules.length} public</p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-4 shadow-sm">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/40" size={16} />
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search public topics"
                  className="w-full bg-surface-container border border-outline-variant/30 rounded-xl py-3 pl-10 pr-3 text-sm font-medium outline-none focus:border-primary/40"
                />
              </div>
            </div>
          </aside>

          <main className="space-y-6">
            <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-5 md:p-6 shadow-sm">
              <div className="mb-6">
                <p className="text-xs font-black uppercase tracking-widest text-primary mb-2">{selectedSubject.levelLabel}</p>
                <h2 className="text-2xl font-extrabold font-headline text-on-surface">{selectedSubject.title}</h2>
                <p className="text-sm text-on-surface-variant mt-2 max-w-3xl">{selectedSubject.description}</p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                {filteredTopics.map((topic) => {
                  const isSelected = topic.id === selectedTopic.id;
                  const modules = publicReviewers.filter((module) => module.topicId === topic.id);
                  return (
                    <button
                      key={topic.id}
                      onClick={() => setSelectedTopicId(topic.id)}
                      className={`text-left rounded-xl border p-4 transition-all ${isSelected ? 'border-primary bg-primary/10' : 'border-outline-variant/30 bg-surface-container/30 hover:border-primary/40'}`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/50">Topic</span>
                        <span className="text-[10px] font-black text-primary bg-primary/10 rounded-full px-2 py-1">{modules.length} public</span>
                      </div>
                      <h3 className="font-extrabold text-on-surface leading-tight">{topic.title}</h3>
                      <p className="text-xs text-on-surface-variant/60 mt-2 line-clamp-2">{topic.description}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            <section className="space-y-4">
              <div>
                <h2 className="text-xl font-extrabold font-headline text-on-surface">{selectedTopic.title}</h2>
                <p className="text-sm text-on-surface-variant mt-1">Public modules here are explorable content until you start them.</p>
              </div>

              {selectedPublicModules.length === 0 ? (
                <div className="bg-surface-container-lowest border border-dashed border-outline-variant rounded-2xl p-8 text-center">
                  <GraduationCap className="mx-auto text-on-surface-variant/30 mb-4" size={40} />
                  <h3 className="font-extrabold text-on-surface">No public reviewer has been published here yet.</h3>
                  <p className="text-sm text-on-surface-variant mt-2">Approved public modules will appear here without creating progress automatically.</p>
                </div>
              ) : (
                selectedPublicModules.map((module, index) => {
                  const progress = progressByModule[module.id];
                  const isStarted = !!progress;
                  return (
                    <article key={module.id} className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-5 shadow-sm">
                      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                        <div className="flex gap-4 min-w-0">
                          <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                            <Library size={24} />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40">Public reviewer {index + 1} / {module.duration}</p>
                            <h3 className="text-lg font-extrabold text-on-surface mt-1">{module.title}</h3>
                            <p className="text-sm text-on-surface-variant mt-1">{module.description}</p>
                            {module.authorName && <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40 mt-3">Author: {module.authorName}</p>}
                          </div>
                        </div>
                        <button
                          onClick={() => isStarted ? navigate(`/quest?moduleId=${module.id}`) : startReview(module)}
                          className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary text-on-primary px-5 py-3 text-sm font-bold"
                        >
                          {isStarted ? 'Resume review' : 'Start Review'}
                          <ArrowRight size={16} />
                        </button>
                      </div>

                      {isStarted ? (
                        <div className="mt-5">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-bold text-on-surface-variant">{statusLabel[module.status] || module.status}</span>
                            <span className="text-xs font-black text-on-surface">{module.progress}%</span>
                          </div>
                          <div className="h-2 rounded-full bg-surface-container overflow-hidden">
                            <div className="h-full bg-primary rounded-full" style={{ width: `${module.progress}%` }}></div>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-5 rounded-xl border border-outline-variant/30 bg-surface-container/30 p-3 text-xs font-bold text-on-surface-variant/70">
                          Not active yet. Starting this reviewer creates your real progress record at 0%.
                        </div>
                      )}
                    </article>
                  );
                })
              )}
            </section>
          </main>
        </section>
      </div>
    </StudentLayout>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-surface-container rounded-xl p-4 border border-outline-variant/40">
      <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/50">{label}</p>
      <p className="text-2xl font-black text-on-surface mt-1">{value}</p>
    </div>
  );
}

function ReviewerCard({ module, locked, isActive, onOpen, onArchive }: {
  module: JourneyModule;
  locked: boolean;
  isActive: boolean;
  onOpen: () => void;
  onArchive: () => void;
}) {
  const isCompleted = module.status === 'completed' || module.status === 'mastered';
  return (
    <article className="rounded-2xl border border-outline-variant bg-surface-container/20 p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex gap-4 min-w-0">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${locked ? 'bg-surface-container text-on-surface-variant/40' : 'bg-primary/10 text-primary'}`}>
            {isCompleted ? <CheckCircle2 size={24} /> : locked ? <Lock size={22} /> : <PlayCircle size={24} />}
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40">
              {module.publishScope === 'classes' ? 'Class reviewer' : isActive ? 'Started public reviewer' : 'Class assigned'}
            </p>
            <h3 className="text-lg font-extrabold text-on-surface mt-1">{module.title}</h3>
            <p className="text-sm text-on-surface-variant mt-1 line-clamp-2">{module.description}</p>
          </div>
        </div>
        <button
          disabled={locked}
          onClick={onOpen}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary text-on-primary px-4 py-3 text-sm font-bold disabled:bg-surface-container disabled:text-on-surface-variant/40 shrink-0"
        >
          {locked ? 'Locked' : isActive ? 'Resume' : 'Start'}
        </button>
      </div>

      <div className="mt-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold text-on-surface-variant">{statusLabel[module.status] || module.status}</span>
          <span className="text-xs font-black text-on-surface">{module.progress}%</span>
        </div>
        <div className="h-2 rounded-full bg-surface-container overflow-hidden">
          <div className="h-full bg-primary rounded-full" style={{ width: `${module.progress}%` }}></div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-5">
        {module.resources.slice(0, 3).map((resource) => {
          const Icon = resource.type === 'textbook' ? Library : resource.type === 'quiz' ? FileQuestion : resource.type === 'exam' ? ClipboardCheck : BookOpen;
          return (
            <div key={resource.id} className="rounded-xl border border-outline-variant/30 bg-surface-container/40 p-3 text-left">
              <Icon size={17} className="text-primary mb-2" />
              <p className="text-xs font-extrabold text-on-surface leading-tight">{resource.title}</p>
              <p className="text-[10px] text-on-surface-variant/50 font-bold mt-1">{resource.meta}</p>
            </div>
          );
        })}
      </div>

      {isCompleted && (
        <button onClick={onArchive} className="mt-4 rounded-xl bg-surface-container text-on-surface px-4 py-2 text-xs font-black uppercase tracking-widest border border-outline-variant/40">
          Archive
        </button>
      )}
    </article>
  );
}
