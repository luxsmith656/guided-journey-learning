import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, doc, onSnapshot, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import {
  ArrowRight,
  GraduationCap,
  Library,
  Map as MapIcon,
  Search,
} from 'lucide-react';
import StudentLayout from '../components/StudentLayout';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/firebase';
import { JourneyModule } from '../lib/learningJourney';

interface ReviewTopic {
  id: string;
  title: string;
  description: string;
  categoryId: string;
}

interface ReviewSubject {
  id: string;
  title: string;
  description: string;
  levelLabel: string;
  accent: string;
  topics: ReviewTopic[];
}

const subjectAccents = ['bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500', 'bg-violet-500', 'bg-cyan-500'];

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
    reviewTrack: data.reviewTrack || '',
    reviewTracks: data.reviewTracks || data.trackIds || data.tracks || [],
    specialization: data.specialization || '',
  };
}

function moduleProgressState(progress: any, isClassAssigned: boolean) {
  if (!progress && isClassAssigned) return 'assigned';
  if (!progress) return 'available';
  if (progress.moduleState) return progress.moduleState;
  if (progress.status === 'completed' && (progress.finalScore ?? 0) >= 85) return 'completed';
  return 'in_progress';
}

function normalizeCategory(id: string, data: any): ReviewSubject & { raw: any } {
  return {
    id,
    title: data.title || data.name || 'Untitled review track',
    description: data.description || data.body || 'LET reviewer track configured by the platform.',
    levelLabel: data.levelLabel || data.trackLabel || data.type || 'LET Review',
    accent: data.accent || subjectAccents[Math.abs(id.length) % subjectAccents.length],
    topics: [],
    raw: data,
  };
}

function normalizeTopic(id: string, data: any): ReviewTopic {
  return {
    id,
    title: data.title || data.name || 'Untitled topic',
    description: data.description || data.body || 'Reviewer topic configured by the platform.',
    categoryId: data.categoryId || data.subjectId || '',
  };
}

function categoryAllowedForStudent(category: ReviewSubject & { raw: any }, user: any) {
  const track = user?.reviewTrack || '';
  if (!track) return true;
  const raw = category.raw || {};
  const allowedTracks = raw.reviewTracks || raw.trackIds || raw.tracks;
  if (Array.isArray(allowedTracks) && allowedTracks.length > 0) {
    return allowedTracks.includes(track) || allowedTracks.includes('all');
  }
  if (raw.reviewTrack) return raw.reviewTrack === track || raw.reviewTrack === 'all';

  if (track === 'elementary') {
    const haystack = `${category.id} ${category.title} ${category.levelLabel}`.toLowerCase();
    return !haystack.includes('major') && !haystack.includes('specialization') && !haystack.includes('secondary');
  }
  return true;
}

function moduleAllowedForStudent(module: JourneyModule & { [key: string]: any }, user: any) {
  const track = user?.reviewTrack || '';
  if (!track) return true;
  const allowedTracks = module.reviewTracks || module.trackIds || module.tracks;
  if (Array.isArray(allowedTracks) && allowedTracks.length > 0) {
    return allowedTracks.includes(track) || allowedTracks.includes('all');
  }
  if (module.reviewTrack) return module.reviewTrack === track || module.reviewTrack === 'all';

  if (track === 'elementary') {
    const haystack = `${module.subjectId} ${module.topicId} ${module.title} ${module.description}`.toLowerCase();
    return !haystack.includes('major') && !haystack.includes('specialization') && !haystack.includes('secondary');
  }

  if ((track === 'secondary' || track === 'specialization') && module.specialization) {
    const selectedSpecialization = String(user?.specialization || '').toLowerCase();
    return !selectedSpecialization || String(module.specialization).toLowerCase() === selectedSpecialization;
  }

  return true;
}

export default function StudentCourses() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [selectedTopicId, setSelectedTopicId] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [publishedModules, setPublishedModules] = useState<JourneyModule[]>([]);
  const [progressByModule, setProgressByModule] = useState<Record<string, any>>({});
  const [classData, setClassData] = useState<any>(null);
  const [categories, setCategories] = useState<(ReviewSubject & { raw: any })[]>([]);
  const [topics, setTopics] = useState<ReviewTopic[]>([]);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'categories'), (snapshot) => {
      const rows = snapshot.docs
        .map((categoryDoc) => normalizeCategory(categoryDoc.id, categoryDoc.data()))
        .filter((category) => category.raw.isPublished !== false)
        .sort((a, b) => a.title.localeCompare(b.title));
      setCategories(rows);
    }, (error) => {
      console.warn('Unable to load review tracks', error);
      setCategories([]);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'topics'), (snapshot) => {
      const rows = snapshot.docs
        .map((topicDoc) => ({ topic: normalizeTopic(topicDoc.id, topicDoc.data()), raw: topicDoc.data() }))
        .filter((row) => row.raw.isPublished !== false)
        .map((row) => row.topic)
        .sort((a, b) => a.title.localeCompare(b.title));
      setTopics(rows);
    }, (error) => {
      console.warn('Unable to load review topics', error);
      setTopics([]);
    });
    return () => unsubscribe();
  }, []);

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

  const publicReviewers = useMemo(() => visibleModules
    .filter((module) => !module.publishScope || module.publishScope === 'public')
    .filter((module) => moduleAllowedForStudent(module as any, user)), [visibleModules, user]);
  const explorePublicReviewers = useMemo(() => publicReviewers
    .filter((module) => !progressByModule[module.id]), [publicReviewers, progressByModule]);

  const allowedSubjects = useMemo<ReviewSubject[]>(() => {
    return categories
      .filter((category) => categoryAllowedForStudent(category, user))
      .map((category) => {
        const topicMap = new Map<string, ReviewTopic>();
        topics
          .filter((topic) => topic.categoryId === category.id)
          .forEach((topic) => topicMap.set(topic.id, topic));

        explorePublicReviewers
          .filter((module) => module.subjectId === category.id)
          .forEach((module) => {
            if (!module.topicId || topicMap.has(module.topicId)) return;
            topicMap.set(module.topicId, {
              id: module.topicId,
              title: 'Uncategorized reviewer topic',
              description: 'Published modules exist for this topic, but the topic record still needs review metadata.',
              categoryId: category.id,
            });
          });

        return {
          id: category.id,
          title: category.title,
          description: category.description,
          levelLabel: category.levelLabel,
          accent: category.accent,
          topics: [...topicMap.values()],
        };
      })
      .filter((subject) => subject.topics.length > 0 || explorePublicReviewers.some((module) => module.subjectId === subject.id));
  }, [categories, topics, explorePublicReviewers, user]);

  useEffect(() => {
    if (allowedSubjects.length === 0) {
      setSelectedSubjectId('');
      setSelectedTopicId('');
      return;
    }
    const nextSubject = allowedSubjects.find((subject) => subject.id === selectedSubjectId) || allowedSubjects[0];
    const nextTopic = nextSubject.topics.find((topic) => topic.id === selectedTopicId) || nextSubject.topics[0];
    if (nextSubject.id !== selectedSubjectId) setSelectedSubjectId(nextSubject.id);
    if ((nextTopic?.id || '') !== selectedTopicId) setSelectedTopicId(nextTopic?.id || '');
  }, [allowedSubjects, selectedSubjectId, selectedTopicId]);

  const selectedSubject = allowedSubjects.find((subject) => subject.id === selectedSubjectId) || allowedSubjects[0] || null;
  const selectedTopic = selectedSubject?.topics.find((topic) => topic.id === selectedTopicId) || selectedSubject?.topics[0] || null;
  const selectedPublicModules = selectedSubject && selectedTopic
    ? explorePublicReviewers.filter((module) => module.subjectId === selectedSubject.id && module.topicId === selectedTopic.id)
    : [];
  const filteredTopics = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!selectedSubject) return [];
    if (!term) return selectedSubject.topics;
    return selectedSubject.topics.filter((topic) => {
      const modules = explorePublicReviewers.filter((module) => module.topicId === topic.id);
      return (
        topic.title.toLowerCase().includes(term) ||
        topic.description.toLowerCase().includes(term) ||
        modules.some((module) => module.title.toLowerCase().includes(term))
      );
    });
  }, [searchTerm, selectedSubject, explorePublicReviewers]);

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

  return (
    <StudentLayout title="LET Reviewers">
      <div className="space-y-6">
        <section className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-5 md:p-6 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
            <div className="max-w-2xl">
              <div className="flex items-center gap-2 text-primary text-xs font-black uppercase tracking-widest mb-2">
                <MapIcon size={16} />
                LET review center
              </div>
              <h1 className="text-2xl md:text-3xl font-extrabold font-headline text-on-surface tracking-tight">
                Explore public LET reviewers by track and topic.
              </h1>
              <p className="text-sm text-on-surface-variant mt-3 leading-relaxed">
                Public reviewers do not count as progress until you click Start Review. Continue started modules from your dashboard.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3 min-w-full lg:min-w-[360px]">
              <Stat label="Tracks" value={allowedSubjects.length} />
              <Stat label="Explore" value={explorePublicReviewers.length} />
              <Stat label="Completed" value={completedCount} />
            </div>
          </div>
        </section>

        {!selectedSubject || !selectedTopic ? (
          <section className="bg-surface-container-lowest border border-dashed border-outline-variant rounded-2xl p-8 text-center">
            <GraduationCap className="mx-auto text-on-surface-variant/30 mb-4" size={40} />
            <h2 className="font-headline text-xl font-extrabold text-on-surface">No review tracks configured yet.</h2>
            <p className="mt-2 text-sm text-on-surface-variant">
              Public reviewers now use Firestore review tracks and topics only. Add published categories and topics in the database to make this page appear.
            </p>
          </section>
        ) : (
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
                  const modules = explorePublicReviewers.filter((module) => module.subjectId === subject.id);
                  return (
                    <button
                      key={subject.id}
                      onClick={() => {
                        setSelectedSubjectId(subject.id);
                        setSelectedTopicId(subject.topics[0]?.id || '');
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
                  const modules = explorePublicReviewers.filter((module) => module.topicId === topic.id);
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
                          onClick={() => startReview(module)}
                          className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary text-on-primary px-5 py-3 text-sm font-bold"
                        >
                          Start Review
                          <ArrowRight size={16} />
                        </button>
                      </div>

                      <div className="mt-5 rounded-xl border border-outline-variant/30 bg-surface-container/30 p-3 text-xs font-bold text-on-surface-variant/70">
                        Not active yet. Starting this reviewer creates your real progress record at 0%.
                      </div>
                    </article>
                  );
                })
              )}
            </section>
          </main>
        </section>
        )}
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
