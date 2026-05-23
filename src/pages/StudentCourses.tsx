import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
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
import { getSubjectModules, getTopicModules, JourneyModule, journeyModules, journeySubjects } from '../lib/learningJourney';

const statusLabel = {
  locked: 'Locked',
  available: 'Ready',
  in_progress: 'In progress',
  completed: 'Completed',
};

export default function StudentCourses() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [selectedSubjectId, setSelectedSubjectId] = useState(journeySubjects[0].id);
  const [selectedTopicId, setSelectedTopicId] = useState(journeySubjects[0].topics[0].id);
  const [searchTerm, setSearchTerm] = useState('');
  const [remoteModules, setRemoteModules] = useState<JourneyModule[]>([]);
  const [completedModuleIds, setCompletedModuleIds] = useState<Set<string>>(new Set());
  const [progressByModule, setProgressByModule] = useState<Record<string, any>>({});

  useEffect(() => {
    const modulesQuery = query(collection(db, 'modules'), where('isPublished', '==', true));
    const unsubscribe = onSnapshot(modulesQuery, (snapshot) => {
      setRemoteModules(snapshot.docs.map((moduleDoc) => {
        const data = moduleDoc.data() as any;
        return {
          id: moduleDoc.id,
          title: data.title || 'Untitled module',
          description: data.description || 'Instructor-created module',
          subjectId: data.subjectId || data.categoryId || 'gened',
          topicId: data.topicId || 'gened_english',
          level: data.level || 1,
          duration: data.duration || '30 min',
          status: 'available',
          progress: 0,
          lessonBlocks: data.lessonBlocks || [],
          prerequisiteModuleIds: data.prerequisiteModuleIds || [],
          resources: data.resources?.map((resource: any, index: number) => ({
            id: resource.id || `${moduleDoc.id}-resource-${index}`,
            type: resource.type || 'activity',
            title: resource.title || 'Learning activity',
            meta: resource.meta || 'Linked',
          })) || [
            { id: `${moduleDoc.id}-textbook`, type: 'textbook', title: 'Textbook reading', meta: 'Linked' },
            { id: `${moduleDoc.id}-quiz`, type: 'quiz', title: 'Practice quiz', meta: 'Adaptive' },
            { id: `${moduleDoc.id}-exam`, type: 'exam', title: 'Exam practice', meta: 'Simulation' },
          ],
          questions: [],
        } as JourneyModule;
      }));
    }, (error) => {
      console.warn('Unable to load published modules, using local journey samples', error);
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
      setCompletedModuleIds(new Set(Object.values(progressMap).filter((data: any) => data.status === 'completed').map((data: any) => data.moduleId)));
    }, (error) => {
      console.warn('Unable to load module completion gates', error);
    });

    return () => unsubscribe();
  }, [user]);

  const selectedSubject = journeySubjects.find((subject) => subject.id === selectedSubjectId) || journeySubjects[0];
  const selectedTopic = selectedSubject.topics.find((topic) => topic.id === selectedTopicId) || selectedSubject.topics[0];
  const allModules = useMemo(() => {
    const remoteIds = new Set(remoteModules.map((module) => module.id));
    return [...remoteModules, ...journeyModules.filter((module) => !remoteIds.has(module.id))].map((module) => {
      const progress = progressByModule[module.id];
      return {
        ...module,
        status: progress?.status === 'completed' ? 'completed' : progress ? 'in_progress' : module.status,
        progress: progress?.progressPercent ?? module.progress,
      } as JourneyModule;
    });
  }, [remoteModules, progressByModule]);
  const subjectModules = getSubjectModules(selectedSubject.id, allModules);
  const topicModules = getTopicModules(selectedTopic.id, allModules);

  const filteredTopics = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return selectedSubject.topics;

    return selectedSubject.topics.filter((topic) => {
      const modules = getTopicModules(topic.id, allModules);
      return (
        topic.title.toLowerCase().includes(term) ||
        topic.description.toLowerCase().includes(term) ||
        modules.some((module) => module.title.toLowerCase().includes(term))
      );
    });
  }, [searchTerm, selectedSubject, allModules]);

  const completedCount = subjectModules.filter((module) => module.status === 'completed').length;
  const subjectProgress = subjectModules.length
    ? Math.round(subjectModules.reduce((sum, module) => sum + module.progress, 0) / subjectModules.length)
    : 0;

  const openModule = (moduleId: string, locked: boolean) => {
    if (!locked) navigate(`/quest?moduleId=${moduleId}`);
  };

  return (
    <StudentLayout title="Learning Journey">
      <div className="space-y-6">
        <section className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-5 md:p-6 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
            <div className="max-w-2xl">
              <div className="flex items-center gap-2 text-primary text-xs font-black uppercase tracking-widest mb-2">
                <Map size={16} />
                Guided path
              </div>
              <h1 className="text-2xl md:text-3xl font-extrabold font-headline text-on-surface tracking-tight">
                Pick a subject, follow the topic trail, then finish each module with practice.
              </h1>
              <p className="text-sm text-on-surface-variant mt-3 leading-relaxed">
                Each topic connects a mini lesson, textbook reading, quiz, and exam practice so studying feels like one journey instead of scattered pages.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3 min-w-full lg:min-w-[360px]">
              <div className="bg-surface-container rounded-xl p-4 border border-outline-variant/40">
                <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/50">Mastery</p>
                <p className="text-2xl font-black text-on-surface mt-1">{subjectProgress}%</p>
              </div>
              <div className="bg-surface-container rounded-xl p-4 border border-outline-variant/40">
                <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/50">Modules</p>
                <p className="text-2xl font-black text-on-surface mt-1">{subjectModules.length}</p>
              </div>
              <div className="bg-surface-container rounded-xl p-4 border border-outline-variant/40">
                <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/50">Done</p>
                <p className="text-2xl font-black text-on-surface mt-1">{completedCount}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-6">
          <aside className="space-y-4">
            <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-headline font-extrabold text-lg text-on-surface">Subjects</h2>
                <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40">
                  {journeySubjects.length} tracks
                </span>
              </div>

              <div className="space-y-2">
                {journeySubjects.map((subject) => {
                  const isSelected = subject.id === selectedSubject.id;
                  const modules = getSubjectModules(subject.id, allModules);
                  return (
                    <button
                      key={subject.id}
                      onClick={() => {
                        setSelectedSubjectId(subject.id);
                        setSelectedTopicId(subject.topics[0].id);
                      }}
                      className={`w-full text-left rounded-xl border p-4 transition-all ${
                        isSelected
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-outline-variant/30 bg-surface-container/30 text-on-surface hover:border-primary/40'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <span className={`w-2 h-10 rounded-full ${subject.accent} shrink-0`}></span>
                        <div className="min-w-0 flex-1">
                          <p className="font-extrabold leading-tight">{subject.title}</p>
                          <p className="text-[11px] text-on-surface-variant/60 mt-1 line-clamp-2">
                            {subject.levelLabel} by {subject.instructor}
                          </p>
                          <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40 mt-3">
                            {subject.topics.length} topics / {modules.length} modules
                          </p>
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
                  placeholder="Search topics or modules"
                  className="w-full bg-surface-container border border-outline-variant/30 rounded-xl py-3 pl-10 pr-3 text-sm font-medium outline-none focus:border-primary/40"
                />
              </div>
            </div>
          </aside>

          <main className="space-y-6">
            <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-5 md:p-6 shadow-sm">
              <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 mb-6">
                <div>
                  <p className="text-xs font-black uppercase tracking-widest text-primary mb-2">{selectedSubject.levelLabel}</p>
                  <h2 className="text-2xl font-extrabold font-headline text-on-surface">{selectedSubject.title}</h2>
                  <p className="text-sm text-on-surface-variant mt-2 max-w-3xl">{selectedSubject.description}</p>
                </div>
                <button
                  onClick={() => navigate('/join-class')}
                  className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-surface-container text-on-surface font-bold text-sm border border-outline-variant hover:border-primary/40 transition-colors"
                >
                  <Plus size={16} />
                  Join class
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                {filteredTopics.map((topic) => {
                  const isSelected = topic.id === selectedTopic.id;
                  const modules = getTopicModules(topic.id, allModules);
                  return (
                    <button
                      key={topic.id}
                      onClick={() => setSelectedTopicId(topic.id)}
                      className={`text-left rounded-xl border p-4 transition-all ${
                        isSelected
                          ? 'border-primary bg-primary/10'
                          : 'border-outline-variant/30 bg-surface-container/30 hover:border-primary/40'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/50">
                          Topic
                        </span>
                        <span className="text-[10px] font-black text-primary bg-primary/10 rounded-full px-2 py-1">
                          {topic.mastery}%
                        </span>
                      </div>
                      <h3 className="font-extrabold text-on-surface leading-tight">{topic.title}</h3>
                      <p className="text-xs text-on-surface-variant/60 mt-2 line-clamp-2">{topic.description}</p>
                      <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40 mt-4">
                        {modules.length || 'No'} module{modules.length === 1 ? '' : 's'}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-extrabold font-headline text-on-surface">{selectedTopic.title}</h2>
                    <p className="text-sm text-on-surface-variant mt-1">{selectedTopic.description}</p>
                  </div>
                </div>

                {topicModules.length === 0 ? (
                  <div className="bg-surface-container-lowest border border-dashed border-outline-variant rounded-2xl p-8 text-center">
                    <GraduationCap className="mx-auto text-on-surface-variant/30 mb-4" size={40} />
                    <h3 className="font-extrabold text-on-surface">No module has been published here yet.</h3>
                    <p className="text-sm text-on-surface-variant mt-2">
                      Your instructor can add lessons, textbook readings, quizzes, and exam practice for this topic.
                    </p>
                  </div>
                ) : (
                  topicModules.map((module, index) => {
                    const missingPrerequisite = module.prerequisiteModuleIds?.some((id) => !completedModuleIds.has(id));
                    const isLocked = module.status === 'locked' || !!missingPrerequisite;
                    return (
                      <article
                        key={module.id}
                        className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-5 shadow-sm"
                      >
                        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                          <div className="flex gap-4 min-w-0">
                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
                              isLocked ? 'bg-surface-container text-on-surface-variant/40' : 'bg-primary/10 text-primary'
                            }`}>
                              {module.status === 'completed' ? <CheckCircle2 size={24} /> : isLocked ? <Lock size={22} /> : <PlayCircle size={24} />}
                            </div>
                            <div className="min-w-0">
                              <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40">
                                Step {index + 1} / Level {module.level} / {module.duration}
                              </p>
                              <h3 className="text-lg font-extrabold text-on-surface mt-1">{module.title}</h3>
                              <p className="text-sm text-on-surface-variant mt-1">{module.description}</p>
                            </div>
                          </div>
                          <button
                            disabled={isLocked}
                            onClick={() => openModule(module.id, isLocked)}
                            className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary text-on-primary px-5 py-3 text-sm font-bold disabled:bg-surface-container disabled:text-on-surface-variant/40"
                          >
                            {isLocked ? 'Pass previous final' : module.progress > 0 ? 'Resume module' : 'Start module'}
                            {!isLocked && <ArrowRight size={16} />}
                          </button>
                        </div>

                        <div className="mt-5">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-bold text-on-surface-variant">{statusLabel[module.status]}</span>
                            <span className="text-xs font-black text-on-surface">{module.progress}%</span>
                          </div>
                          <div className="h-2 rounded-full bg-surface-container overflow-hidden">
                            <div className="h-full bg-primary rounded-full" style={{ width: `${module.progress}%` }}></div>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-5">
                          {module.resources.map((resource) => {
                            const Icon = resource.type === 'textbook' ? Library : resource.type === 'quiz' ? FileQuestion : resource.type === 'exam' ? ClipboardCheck : BookOpen;
                            const target = resource.type === 'textbook' ? '/library' : resource.type === 'exam' ? `/exam?category=${module.subjectId}` : `/exam?type=practice&category=${module.subjectId}`;
                            return (
                              <button
                                key={resource.id}
                                onClick={() => navigate(target)}
                                disabled={isLocked}
                                className="rounded-xl border border-outline-variant/30 bg-surface-container/40 p-3 text-left hover:border-primary/40 disabled:opacity-50 transition-colors"
                              >
                                <Icon size={17} className="text-primary mb-2" />
                                <p className="text-xs font-extrabold text-on-surface leading-tight">{resource.title}</p>
                                <p className="text-[10px] text-on-surface-variant/50 font-bold mt-1">{resource.meta}</p>
                              </button>
                            );
                          })}
                        </div>
                      </article>
                    );
                  })
                )}
              </section>

              <aside className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-5 shadow-sm h-fit">
                <h3 className="font-headline font-extrabold text-on-surface mb-4">Journey Rules</h3>
                <div className="space-y-4">
                  {[
                    { title: 'Learn', body: 'Short module lesson with examples and a quick check.' },
                    { title: 'Read', body: 'Textbook chapter linked to the exact topic.' },
                    { title: 'Practice', body: 'Adaptive quiz pulls questions from weak skills.' },
                    { title: 'Prove', body: 'Exam simulation unlocks after topic modules.' },
                  ].map((item) => (
                    <div key={item.title} className="flex gap-3">
                      <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-black text-xs shrink-0">
                        {item.title[0]}
                      </div>
                      <div>
                        <p className="text-sm font-extrabold text-on-surface">{item.title}</p>
                        <p className="text-xs text-on-surface-variant/60 leading-relaxed">{item.body}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </aside>
            </div>
          </main>
        </section>
      </div>
    </StudentLayout>
  );
}
