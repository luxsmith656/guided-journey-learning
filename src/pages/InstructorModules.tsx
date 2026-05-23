import React, { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  ClipboardList,
  Edit3,
  FileQuestion,
  Layers3,
  Plus,
  Save,
  Search,
} from 'lucide-react';
import { addDoc, collection, onSnapshot, orderBy, query, serverTimestamp, updateDoc, doc } from 'firebase/firestore';
import DashboardLayout from '../components/DashboardLayout';
import Toast from '../components/Toast';
import { useAuth } from '../context/AuthContext';
import { journeyModules, journeySubjects } from '../lib/learningJourney';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';

interface BuilderModule {
  id: string;
  title: string;
  description: string;
  subjectId: string;
  topicId: string;
  level: number;
  duration: string;
  isPublished: boolean;
  lessonText: string;
}

const emptyModule: BuilderModule = {
  id: '',
  title: '',
  description: '',
  subjectId: journeySubjects[0].id,
  topicId: journeySubjects[0].topics[0].id,
  level: 1,
  duration: '30 min',
  isPublished: false,
  lessonText: '',
};

function fromSeedModule(module: (typeof journeyModules)[number]): BuilderModule {
  return {
    id: module.id,
    title: module.title,
    description: module.description,
    subjectId: module.subjectId,
    topicId: module.topicId,
    level: module.level,
    duration: module.duration,
    isPublished: module.status !== 'locked',
    lessonText: module.lessonBlocks.map((block) => block.content).join('\n\n'),
  };
}

function fromFirestoreModule(id: string, data: any): BuilderModule {
  return {
    id,
    title: data.title || 'Untitled module',
    description: data.description || '',
    subjectId: data.subjectId || data.categoryId || journeySubjects[0].id,
    topicId: data.topicId || journeySubjects[0].topics[0].id,
    level: data.level || 1,
    duration: data.duration || '30 min',
    isPublished: data.isPublished ?? false,
    lessonText: data.lessonBlocks?.map((block: any) => block.content).join('\n\n') || '',
  };
}

export default function InstructorModules() {
  const { user } = useAuth();
  const [modules, setModules] = useState<BuilderModule[]>(journeyModules.map(fromSeedModule));
  const [selectedModuleId, setSelectedModuleId] = useState(journeyModules[0].id);
  const [draft, setDraft] = useState<BuilderModule>(fromSeedModule(journeyModules[0]));
  const [searchTerm, setSearchTerm] = useState('');
  const [toastMsg, setToastMsg] = useState('');
  const [showToast, setShowToast] = useState(false);

  useEffect(() => {
    const modulesQuery = query(collection(db, 'modules'), orderBy('updatedAt', 'desc'));
    const unsubscribe = onSnapshot(
      modulesQuery,
      (snapshot) => {
        const remoteModules = snapshot.docs.map((moduleDoc) => fromFirestoreModule(moduleDoc.id, moduleDoc.data()));
        const remoteIds = new Set(remoteModules.map((module) => module.id));
        const seedModules = journeyModules.map(fromSeedModule).filter((module) => !remoteIds.has(module.id));
        const nextModules = [...remoteModules, ...seedModules];
        setModules(nextModules);

        if (!nextModules.some((module) => module.id === selectedModuleId)) {
          setSelectedModuleId(nextModules[0]?.id || '');
          setDraft(nextModules[0] || emptyModule);
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'modules');
      },
    );

    return () => unsubscribe();
  }, [selectedModuleId]);

  const selectedSubject = journeySubjects.find((subject) => subject.id === draft.subjectId) || journeySubjects[0];

  const filteredModules = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return modules;

    return modules.filter((module) => {
      const subject = journeySubjects.find((item) => item.id === module.subjectId);
      const topic = subject?.topics.find((item) => item.id === module.topicId);
      return (
        module.title.toLowerCase().includes(term) ||
        module.description.toLowerCase().includes(term) ||
        subject?.title.toLowerCase().includes(term) ||
        topic?.title.toLowerCase().includes(term)
      );
    });
  }, [modules, searchTerm]);

  const selectModule = (module: BuilderModule) => {
    setSelectedModuleId(module.id);
    setDraft(module);
  };

  const createNewDraft = () => {
    const topicId = selectedSubject.topics[0]?.id || journeySubjects[0].topics[0].id;
    setSelectedModuleId('');
    setDraft({ ...emptyModule, subjectId: selectedSubject.id, topicId });
  };

  const updateDraft = (field: keyof BuilderModule, value: string | number | boolean) => {
    setDraft((current) => {
      if (field === 'subjectId') {
        const nextSubject = journeySubjects.find((subject) => subject.id === value) || journeySubjects[0];
        return { ...current, subjectId: nextSubject.id, topicId: nextSubject.topics[0].id };
      }
      return { ...current, [field]: value };
    });
  };

  const saveModule = async () => {
    if (!draft.title.trim()) {
      setToastMsg('Module title is required');
      setShowToast(true);
      return;
    }

    const payload = {
      title: draft.title.trim(),
      description: draft.description.trim(),
      subjectId: draft.subjectId,
      categoryId: draft.subjectId,
      topicId: draft.topicId,
      level: draft.level,
      duration: draft.duration,
      isPublished: draft.isPublished,
      createdBy: user?.uid || 'instructor',
      lessonBlocks: draft.lessonText
        .split(/\n{2,}/)
        .map((content) => content.trim())
        .filter(Boolean)
        .map((content, index) => ({ type: index === 0 ? 'heading' : 'text', content })),
      resources: [
        { type: 'textbook', title: `${draft.title} textbook reading`, meta: 'Linked reading' },
        { type: 'quiz', title: `${draft.title} quiz`, meta: 'Adaptive practice' },
        { type: 'exam', title: `${draft.title} exam set`, meta: 'Simulation' },
      ],
      updatedAt: serverTimestamp(),
    };

    try {
      if (draft.id && !journeyModules.some((module) => module.id === draft.id)) {
        await updateDoc(doc(db, 'modules', draft.id), payload);
        setToastMsg('Module updated');
      } else {
        const newDoc = await addDoc(collection(db, 'modules'), {
          ...payload,
          createdAt: serverTimestamp(),
        });
        setSelectedModuleId(newDoc.id);
        setDraft((current) => ({ ...current, id: newDoc.id }));
        setToastMsg('Module created');
      }
      setShowToast(true);
    } catch (error) {
      handleFirestoreError(error, draft.id ? OperationType.UPDATE : OperationType.CREATE, 'modules');
      setToastMsg('Unable to save module');
      setShowToast(true);
    }
  };

  const moduleStats = [
    { label: 'Modules', value: modules.length, icon: Layers3 },
    { label: 'Published', value: modules.filter((module) => module.isPublished).length, icon: CheckCircle2 },
    { label: 'Topics', value: journeySubjects.reduce((sum, subject) => sum + subject.topics.length, 0), icon: ClipboardList },
  ];

  return (
    <DashboardLayout title="Journey Builder">
      <div className="p-4 md:p-8 max-w-7xl mx-auto w-full text-on-surface space-y-6">
        <section className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-5 md:p-6 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
            <div className="max-w-3xl">
              <p className="text-xs font-black uppercase tracking-widest text-primary mb-2">Instructor CMS</p>
              <h1 className="text-3xl font-extrabold font-headline text-on-surface tracking-tight">
                Build a guided learning journey, not a loose folder of files.
              </h1>
              <p className="text-sm text-on-surface-variant mt-3 leading-relaxed">
                Create subject modules with lesson text, textbook reading, quizzes, and exam practice. Students see them as a path from topic to mastery.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3 min-w-full lg:min-w-[360px]">
              {moduleStats.map((stat) => (
                <div key={stat.label} className="bg-surface-container rounded-xl p-4 border border-outline-variant/40">
                  <stat.icon className="text-primary mb-2" size={18} />
                  <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/50">{stat.label}</p>
                  <p className="text-2xl font-black text-on-surface mt-1">{stat.value}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-[380px_1fr] gap-6">
          <aside className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-4 shadow-sm h-fit">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-headline font-extrabold text-lg">Modules</h2>
              <button
                onClick={createNewDraft}
                className="w-10 h-10 rounded-xl bg-primary text-on-primary flex items-center justify-center"
                title="Create module"
              >
                <Plus size={18} />
              </button>
            </div>

            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/40" size={16} />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search module, subject, topic"
                className="w-full bg-surface-container border border-outline-variant/30 rounded-xl py-3 pl-10 pr-3 text-sm font-medium outline-none focus:border-primary/40"
              />
            </div>

            <div className="space-y-2 max-h-[680px] overflow-y-auto pr-1">
              {filteredModules.map((module) => {
                const subject = journeySubjects.find((item) => item.id === module.subjectId);
                const topic = subject?.topics.find((item) => item.id === module.topicId);
                const isSelected = selectedModuleId === module.id;

                return (
                  <button
                    key={module.id}
                    onClick={() => selectModule(module)}
                    className={`w-full text-left rounded-xl border p-4 transition-all ${
                      isSelected ? 'border-primary bg-primary/10' : 'border-outline-variant/30 bg-surface-container/30 hover:border-primary/40'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                        <BookOpen size={20} />
                      </div>
                      <div className="min-w-0">
                        <p className="font-extrabold text-on-surface leading-tight">{module.title}</p>
                        <p className="text-[11px] text-on-surface-variant/60 mt-1 line-clamp-2">
                          {subject?.title || 'Subject'} / {topic?.title || 'Topic'}
                        </p>
                        <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40 mt-2">
                          Level {module.level} / {module.duration} / {module.isPublished ? 'Published' : 'Draft'}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          <main className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-5 md:p-6 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-6">
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-primary mb-2">
                  {draft.id ? 'Edit module' : 'New module'}
                </p>
                <h2 className="text-2xl font-extrabold font-headline text-on-surface">
                  {draft.title || 'Untitled journey module'}
                </h2>
                <p className="text-sm text-on-surface-variant mt-2">
                  Arrange content the way students experience it: lesson, reading, quick quiz, exam practice.
                </p>
              </div>
              <button
                onClick={saveModule}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary text-on-primary px-5 py-3 font-bold text-sm shadow-sm"
              >
                <Save size={16} />
                Save module
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <label className="space-y-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/50">Module title</span>
                <input
                  value={draft.title}
                  onChange={(event) => updateDraft('title', event.target.value)}
                  placeholder="e.g. Constructive Alignment"
                  className="w-full bg-surface-container border border-transparent rounded-xl px-4 py-3 text-sm font-medium outline-none focus:border-primary/30"
                />
              </label>

              <label className="space-y-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/50">Duration</span>
                <input
                  value={draft.duration}
                  onChange={(event) => updateDraft('duration', event.target.value)}
                  placeholder="e.g. 45 min"
                  className="w-full bg-surface-container border border-transparent rounded-xl px-4 py-3 text-sm font-medium outline-none focus:border-primary/30"
                />
              </label>

              <label className="space-y-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/50">Subject</span>
                <select
                  value={draft.subjectId}
                  onChange={(event) => updateDraft('subjectId', event.target.value)}
                  className="w-full bg-surface-container border border-transparent rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-primary/30"
                >
                  {journeySubjects.map((subject) => (
                    <option key={subject.id} value={subject.id}>
                      {subject.title}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/50">Topic</span>
                <select
                  value={draft.topicId}
                  onChange={(event) => updateDraft('topicId', event.target.value)}
                  className="w-full bg-surface-container border border-transparent rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-primary/30"
                >
                  {selectedSubject.topics.map((topic) => (
                    <option key={topic.id} value={topic.id}>
                      {topic.title}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/50">Level</span>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={draft.level}
                  onChange={(event) => updateDraft('level', Number(event.target.value))}
                  className="w-full bg-surface-container border border-transparent rounded-xl px-4 py-3 text-sm font-medium outline-none focus:border-primary/30"
                />
              </label>

              <label className="flex items-center justify-between gap-4 bg-surface-container rounded-xl px-4 py-3">
                <span>
                  <span className="block text-sm font-extrabold text-on-surface">Publish to students</span>
                  <span className="block text-xs text-on-surface-variant/60">Draft modules stay hidden from the learner journey.</span>
                </span>
                <input
                  type="checkbox"
                  checked={draft.isPublished}
                  onChange={(event) => updateDraft('isPublished', event.target.checked)}
                  className="w-5 h-5 accent-primary"
                />
              </label>
            </div>

            <label className="block space-y-2 mt-5">
              <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/50">Student-facing description</span>
              <textarea
                value={draft.description}
                onChange={(event) => updateDraft('description', event.target.value)}
                rows={3}
                placeholder="What will the learner master in this module?"
                className="w-full bg-surface-container border border-transparent rounded-xl px-4 py-3 text-sm font-medium resize-none outline-none focus:border-primary/30"
              />
            </label>

            <label className="block space-y-2 mt-5">
              <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/50">Lesson blocks</span>
              <textarea
                value={draft.lessonText}
                onChange={(event) => updateDraft('lessonText', event.target.value)}
                rows={10}
                placeholder="Write a heading first, then lesson paragraphs. Separate blocks with a blank line."
                className="w-full bg-surface-container border border-transparent rounded-xl px-4 py-3 text-sm font-medium resize-y outline-none focus:border-primary/30 leading-relaxed"
              />
            </label>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-5">
              {[
                { icon: BookOpen, title: 'Mini Lesson', body: 'Short explanation students finish first.' },
                { icon: FileQuestion, title: 'Quiz', body: 'Attach topic questions for adaptive practice.' },
                { icon: ClipboardList, title: 'Exam', body: 'Route learners into simulation mode.' },
              ].map((item) => (
                <div key={item.title} className="rounded-xl border border-outline-variant/40 bg-surface-container/30 p-4">
                  <item.icon className="text-primary mb-3" size={20} />
                  <p className="font-extrabold text-on-surface">{item.title}</p>
                  <p className="text-xs text-on-surface-variant/60 mt-1 leading-relaxed">{item.body}</p>
                </div>
              ))}
            </div>
          </main>
        </section>
      </div>

      <Toast
        isVisible={showToast}
        message={toastMsg}
        onClose={() => setShowToast(false)}
        type={toastMsg.includes('Unable') || toastMsg.includes('required') ? 'error' : 'success'}
      />
    </DashboardLayout>
  );
}
