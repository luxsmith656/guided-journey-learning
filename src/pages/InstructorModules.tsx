import React, { useEffect, useMemo, useState } from 'react';
import {
  Bot,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  FileQuestion,
  Eye,
  Layers3,
  Plus,
  Save,
  Search,
  Sparkles,
  Trash2,
  Wand2,
  X,
} from 'lucide-react';
import { addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc } from 'firebase/firestore';
import DashboardLayout from '../components/DashboardLayout';
import Toast from '../components/Toast';
import { useAuth } from '../context/AuthContext';
import { JourneyModulePart, JourneyQuestion, journeyModules, journeySubjects } from '../lib/learningJourney';
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
  publishScope: 'public' | 'classes';
  classIds: string[];
  dueAt?: string;
  antiCheatEnabled: boolean;
  recordFirstAttemptOnly: boolean;
  authorName?: string;
  authorEmail?: string;
  parts: JourneyModulePart[];
  finalExam: JourneyQuestion[];
}

const blankQuestion = (id: string): JourneyQuestion => ({
  id,
  type: 'multiple_choice',
  stem: 'Write the question stem here.',
  options: [
    { id: 'A', text: 'Option A' },
    { id: 'B', text: 'Option B' },
    { id: 'C', text: 'Option C' },
    { id: 'D', text: 'Option D' },
  ],
  correctOptionId: 'A',
  explanation: 'Explain why the answer is correct.',
});

const blankPart = (index: number): JourneyModulePart => ({
  id: `part-${index + 1}`,
  title: `Part ${index + 1}: New learning part`,
  objective: 'What should students be able to do after this part?',
  textbookSection: {
    title: 'Textbook section title',
    body: 'Write the reading section here. Keep it focused and connected to the mini lesson.',
    estimatedReadMinutes: 8,
    mediaUrl: '',
  },
  lessonBlocks: [
    { type: 'heading', content: 'Mini lesson heading' },
    { type: 'text', content: 'Explain the concept in short, clear paragraphs.' },
    { type: 'callout', content: 'Add a board-exam tip or common misconception here.' },
  ],
  miniQuiz: [blankQuestion(`part-${index + 1}-q1`)],
});

const emptyModule: BuilderModule = {
  id: '',
  title: '',
  description: '',
  subjectId: journeySubjects[0].id,
  topicId: journeySubjects[0].topics[0].id,
  level: 1,
  duration: '45 min',
  isPublished: false,
  publishScope: 'public',
  classIds: [],
  dueAt: '',
  antiCheatEnabled: true,
  recordFirstAttemptOnly: true,
  authorName: '',
  authorEmail: '',
  parts: [blankPart(0)],
  finalExam: [blankQuestion('final-q1')],
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
    publishScope: 'public',
    classIds: [],
    dueAt: '',
    antiCheatEnabled: true,
    recordFirstAttemptOnly: true,
    authorName: 'Preset curriculum',
    authorEmail: '',
    parts: module.parts?.length ? module.parts : [blankPart(0)],
    finalExam: module.finalExam?.length ? module.finalExam : module.questions.slice(0, 2),
  };
}

function fromFirestoreModule(id: string, data: any): BuilderModule {
  const legacyPart = data.lessonBlocks?.length
    ? {
        ...blankPart(0),
        title: 'Part 1: Lesson',
        objective: data.description || 'Study the lesson and complete the check.',
        lessonBlocks: data.lessonBlocks,
        textbookSection: {
          title: `${data.title || 'Module'} reading`,
          body: data.lessonBlocks.map((block: any) => block.content).join('\n\n'),
          estimatedReadMinutes: 8,
        },
      }
    : blankPart(0);

  return {
    id,
    title: data.title || 'Untitled module',
    description: data.description || '',
    subjectId: data.subjectId || data.categoryId || journeySubjects[0].id,
    topicId: data.topicId || journeySubjects[0].topics[0].id,
    level: data.level || 1,
    duration: data.duration || '45 min',
    isPublished: data.isPublished ?? false,
    publishScope: data.publishScope || (data.classIds?.length ? 'classes' : 'public'),
    classIds: data.classIds || [],
    dueAt: data.dueAt || '',
    antiCheatEnabled: data.antiCheatEnabled ?? true,
    recordFirstAttemptOnly: data.recordFirstAttemptOnly ?? true,
    authorName: data.authorName || data.createdByName || data.instructorName || 'Instructor',
    authorEmail: data.authorEmail || '',
    parts: data.parts?.length ? data.parts : [legacyPart],
    finalExam: data.finalExam?.length ? data.finalExam : [blankQuestion('final-q1')],
  };
}

const builderSteps = [
  { id: 'outline', label: 'Outline' },
  { id: 'parts', label: 'Parts' },
  { id: 'assessments', label: 'Quizzes' },
  { id: 'publish', label: 'Publish' },
] as const;

type BuilderStep = typeof builderSteps[number]['id'];

export default function InstructorModules() {
  const { user } = useAuth();
  const [modules, setModules] = useState<BuilderModule[]>(journeyModules.map(fromSeedModule));
  const [classes, setClasses] = useState<any[]>([]);
  const [selectedModuleId, setSelectedModuleId] = useState(journeyModules[0].id);
  const [draft, setDraft] = useState<BuilderModule>(fromSeedModule(journeyModules[0]));
  const [activeStep, setActiveStep] = useState<BuilderStep>('outline');
  const [activePartIndex, setActivePartIndex] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [assistantPrompt, setAssistantPrompt] = useState('');
  const [isDrafting, setIsDrafting] = useState(false);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [moduleFilter, setModuleFilter] = useState<'all' | 'published' | 'draft'>('all');
  const [builderMode, setBuilderMode] = useState<'edit' | 'preview'>('edit');
  const [aiOpen, setAiOpen] = useState(false);
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

        if (!isCreatingNew && !nextModules.some((module) => module.id === selectedModuleId)) {
          setSelectedModuleId(nextModules[0]?.id || '');
          setDraft(nextModules[0] || emptyModule);
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'modules');
      },
    );

    return () => unsubscribe();
  }, [selectedModuleId, isCreatingNew]);

  useEffect(() => {
    if (!user) return;
    const unsubscribe = onSnapshot(collection(db, 'classes'), (snapshot) => {
      const rows = snapshot.docs.map((classDoc) => ({ id: classDoc.id, ...classDoc.data() }));
      setClasses(rows.filter((classItem: any) => (
        user.role === 'admin' ||
        classItem.instructorId === user.uid ||
        classItem.instructorEmail === user.email
      )));
    });
    return () => unsubscribe();
  }, [user]);

  const selectedSubject = journeySubjects.find((subject) => subject.id === draft.subjectId) || journeySubjects[0];
  const activePart = draft.parts[Math.min(activePartIndex, Math.max(draft.parts.length - 1, 0))];

  const filteredModules = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return modules.filter((module) => {
      if (moduleFilter === 'published' && !module.isPublished) return false;
      if (moduleFilter === 'draft' && module.isPublished) return false;
      if (!term) return true;
      const subject = journeySubjects.find((item) => item.id === module.subjectId);
      const topic = subject?.topics.find((item) => item.id === module.topicId);
      return (
        module.title.toLowerCase().includes(term) ||
        module.description.toLowerCase().includes(term) ||
        subject?.title.toLowerCase().includes(term) ||
        topic?.title.toLowerCase().includes(term)
      );
    });
  }, [modules, searchTerm, moduleFilter]);

  const updateDraft = (field: keyof BuilderModule, value: string | number | boolean | JourneyModulePart[] | JourneyQuestion[] | string[]) => {
    setDraft((current) => {
      if (field === 'subjectId') {
        const nextSubject = journeySubjects.find((subject) => subject.id === value) || journeySubjects[0];
        return { ...current, subjectId: nextSubject.id, topicId: nextSubject.topics[0].id };
      }
      return { ...current, [field]: value };
    });
  };

  const updatePart = (patch: Partial<JourneyModulePart>) => {
    updateDraft('parts', draft.parts.map((part, index) => index === activePartIndex ? { ...part, ...patch } : part));
  };

  const updatePartAtIndex = (partIndex: number, patch: Partial<JourneyModulePart>) => {
    updateDraft('parts', draft.parts.map((part, index) => index === partIndex ? { ...part, ...patch } : part));
  };

  const updateMiniQuestionAtPart = (partIndex: number, patch: Partial<JourneyQuestion>) => {
    const part = draft.parts[partIndex];
    const currentQuestion = part?.miniQuiz?.[0] || blankQuestion(`${part?.id || `part-${partIndex + 1}`}-q1`);
    updatePartAtIndex(partIndex, { miniQuiz: [{ ...currentQuestion, ...patch }] });
  };

  const updateMiniOptionAtPart = (partIndex: number, optionId: string, text: string) => {
    const part = draft.parts[partIndex];
    const currentQuestion = part?.miniQuiz?.[0] || blankQuestion(`${part?.id || `part-${partIndex + 1}`}-q1`);
    updateMiniQuestionAtPart(partIndex, {
      options: currentQuestion.options.map((option) => option.id === optionId ? { ...option, text } : option),
    });
  };

  const updatePartLessonBlock = (blockIndex: number, content: string) => {
    updatePart({
      lessonBlocks: activePart.lessonBlocks.map((block, index) => index === blockIndex ? { ...block, content } : block),
    });
  };

  const updateMiniQuestion = (patch: Partial<JourneyQuestion>) => {
    const currentQuestion = activePart.miniQuiz[0] || blankQuestion(`${activePart.id}-q1`);
    updatePart({ miniQuiz: [{ ...currentQuestion, ...patch }] });
  };

  const updateMiniOption = (optionId: string, text: string) => {
    const currentQuestion = activePart.miniQuiz[0] || blankQuestion(`${activePart.id}-q1`);
    updateMiniQuestion({
      options: currentQuestion.options.map((option) => option.id === optionId ? { ...option, text } : option),
    });
  };

  const updateFinalQuestion = (questionIndex: number, patch: Partial<JourneyQuestion>) => {
    updateDraft('finalExam', draft.finalExam.map((question, index) => index === questionIndex ? { ...question, ...patch } : question));
  };

  const updateFinalOption = (questionIndex: number, optionId: string, text: string) => {
    const question = draft.finalExam[questionIndex];
    updateFinalQuestion(questionIndex, {
      options: question.options.map((option) => option.id === optionId ? { ...option, text } : option),
    });
  };

  const selectModule = (module: BuilderModule) => {
    setIsCreatingNew(false);
    setSelectedModuleId(module.id);
    setDraft(module);
    setActiveStep('outline');
    setActivePartIndex(0);
    setBuilderMode('edit');
  };

  const createNewDraft = () => {
    const topicId = selectedSubject.topics[0]?.id || journeySubjects[0].topics[0].id;
    setIsCreatingNew(true);
    setSelectedModuleId('');
    setSearchTerm('');
    setDraft({ ...emptyModule, title: '', description: '', subjectId: selectedSubject.id, topicId, parts: [blankPart(0)], finalExam: [blankQuestion('final-q1')] });
    setActiveStep('outline');
    setActivePartIndex(0);
    setBuilderMode('edit');
    setToastMsg('New module draft created. Fill Step 1, then save it.');
    setShowToast(true);
  };

  const addPart = () => {
    const nextParts = [...draft.parts, blankPart(draft.parts.length)];
    updateDraft('parts', nextParts);
    setActivePartIndex(nextParts.length - 1);
    setActiveStep('parts');
  };

  const removePart = (indexToRemove: number) => {
    const nextParts = draft.parts.filter((_part, index) => index !== indexToRemove);
    updateDraft('parts', nextParts.length ? nextParts : [blankPart(0)]);
    setActivePartIndex(Math.max(0, indexToRemove - 1));
  };

  const addFinalQuestion = () => {
    updateDraft('finalExam', [...draft.finalExam, blankQuestion(`final-q${draft.finalExam.length + 1}`)]);
  };

  const deleteModule = async () => {
    if (!draft.id || isCreatingNew) {
      createNewDraft();
      return;
    }
    if (journeyModules.some((module) => module.id === draft.id)) {
      setToastMsg('Preset sample modules cannot be deleted. Create or edit your own module instead.');
      setShowToast(true);
      return;
    }
    if (!window.confirm(`Delete "${draft.title}"? This removes it from assigned classes and student journeys.`)) return;
    try {
      await deleteDoc(doc(db, 'modules', draft.id));
      setToastMsg('Module deleted');
      setShowToast(true);
      createNewDraft();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `modules/${draft.id}`);
      setToastMsg('Unable to delete module');
      setShowToast(true);
    }
  };

  const generateAIDraft = async () => {
    const prompt = assistantPrompt.trim() || draft.title || 'LET review module';
    setIsDrafting(true);
    try {
      const response = await fetch('/api/draft-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: prompt, difficulty: 'medium', count: 3 }),
      });
      const data = await response.json();
      const questions = (data.questions || []).map((question: any, index: number) => ({
        id: `ai-q-${Date.now()}-${index}`,
        stem: question.stem,
        options: question.options,
        correctOptionId: question.correctOptionId,
        explanation: question.explanation,
      }));

      const nextTitle = draft.title || prompt;
      setDraft((current) => ({
        ...current,
        title: nextTitle,
        description: current.description || `Guided module for ${prompt}.`,
        parts: [
          {
            ...blankPart(0),
            title: `Part 1: Foundations of ${prompt}`,
            objective: `Understand the core idea behind ${prompt}.`,
            textbookSection: {
              title: `${prompt}: textbook reading`,
              body: `This reading introduces ${prompt}. Start with the key terms, then connect each concept to a classroom or exam situation. Keep notes on definitions, common misconceptions, and examples that could appear in a LET-style item.`,
              estimatedReadMinutes: 10,
            },
            lessonBlocks: [
              { type: 'heading', content: `Core idea: ${prompt}` },
              { type: 'text', content: `Explain ${prompt} with a concrete example, then show how it appears in LET questions.` },
              { type: 'callout', content: 'Ask learners to prove each answer with the concept, not with guesswork.' },
            ],
            miniQuiz: questions[0] ? [questions[0]] : [blankQuestion('ai-part-q1')],
          },
          {
            ...blankPart(1),
            title: `Part 2: Apply ${prompt}`,
            objective: `Use ${prompt} in a question or classroom scenario.`,
            miniQuiz: questions[1] ? [questions[1]] : [blankQuestion('ai-part-q2')],
          },
        ],
        finalExam: questions.length ? questions : current.finalExam,
      }));
      setToastMsg('AI draft added. Review and edit before publishing.');
    } catch (error) {
      console.warn('AI draft failed, using local template', error);
      setDraft((current) => ({
        ...current,
        title: current.title || prompt,
        description: current.description || `Guided module for ${prompt}.`,
        parts: [blankPart(0), blankPart(1)],
      }));
      setToastMsg('AI service unavailable. Added editable template instead.');
    } finally {
      setIsDrafting(false);
      setShowToast(true);
      setActiveStep('parts');
    }
  };

  const rewriteActiveReading = async (mode: 'proofread' | 'paraphrase') => {
    if (!activePart?.textbookSection?.body?.trim()) {
      setToastMsg('Add reading text first, then ask AI to improve it.');
      setShowToast(true);
      return;
    }

    setIsDrafting(true);
    try {
      const response = await fetch('/api/rewrite-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          text: activePart.textbookSection.body,
          instruction: assistantPrompt,
        }),
      });
      const data = await response.json();
      if (!data.text) throw new Error(data.error || 'No rewritten text returned');
      updatePart({ textbookSection: { ...activePart.textbookSection, body: data.text } });
      setToastMsg(mode === 'proofread' ? 'Reading proofread by AI.' : 'Reading paraphrased by AI.');
    } catch (error) {
      console.warn('AI rewrite failed', error);
      setToastMsg('AI rewrite unavailable. Try again later.');
    } finally {
      setIsDrafting(false);
      setShowToast(true);
    }
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
      publishScope: draft.publishScope,
      classIds: draft.publishScope === 'classes' ? draft.classIds : [],
      dueAt: draft.dueAt || '',
      antiCheatEnabled: draft.antiCheatEnabled,
      recordFirstAttemptOnly: draft.recordFirstAttemptOnly,
      createdBy: user?.uid || 'instructor',
      authorId: user?.uid || 'instructor',
      authorName: user?.fullName || user?.email || 'Instructor',
      authorEmail: user?.email || '',
      parts: draft.parts,
      finalExam: draft.finalExam,
      lessonBlocks: draft.parts.flatMap((part) => part.lessonBlocks),
      resources: [
        { type: 'textbook', title: `${draft.title} textbook`, meta: `${draft.parts.length} sections` },
        { type: 'quiz', title: `${draft.title} mini quizzes`, meta: `${draft.parts.length} checks` },
        { type: 'exam', title: `${draft.title} final exam`, meta: `${draft.finalExam.length} items` },
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
        setIsCreatingNew(false);
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
    { label: 'Parts', value: draft.parts.length, icon: ClipboardList },
  ];

  return (
    <DashboardLayout title="Journey Builder">
      <div className="p-4 md:p-8 max-w-7xl mx-auto w-full text-on-surface space-y-6">
        <section className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-5 md:p-6 shadow-sm">
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-5">
            <div className="max-w-3xl">
              <p className="text-xs font-black uppercase tracking-widest text-primary mb-2">Instructor CMS</p>
              <h1 className="text-3xl font-extrabold font-headline text-on-surface tracking-tight">Build modules in steps, not as one confusing form.</h1>
              <p className="text-sm text-on-surface-variant mt-3 leading-relaxed">
                Each module has ordered parts. Every part can include a textbook reading, mini lesson, mini quiz, and activity. The final exam is the gate before completion.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3 min-w-full xl:min-w-[360px]">
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

        <section className="grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-6">
          <aside className="space-y-4">
            <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-headline font-extrabold text-lg">Modules</h2>
                <button onClick={createNewDraft} className="w-10 h-10 rounded-xl bg-primary text-on-primary flex items-center justify-center" title="Create module">
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
              <div className="grid grid-cols-3 gap-2 mb-4">
                {[
                  { id: 'all', label: 'All' },
                  { id: 'published', label: 'Published' },
                  { id: 'draft', label: 'Drafts' },
                ].map((filter) => (
                  <button
                    key={filter.id}
                    onClick={() => setModuleFilter(filter.id as typeof moduleFilter)}
                    className={`rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-widest border ${
                      moduleFilter === filter.id ? 'bg-primary text-on-primary border-primary' : 'bg-surface-container text-on-surface-variant border-outline-variant/30'
                    }`}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>

              <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
                {!selectedModuleId && (
                  <button className="w-full text-left rounded-xl border p-4 transition-all border-primary bg-primary/10">
                    <p className="font-extrabold text-on-surface leading-tight">{draft.title || 'Blank new module'}</p>
                    <p className="text-[11px] text-on-surface-variant/60 mt-1 line-clamp-2">Unsaved blank module / Step 1 ready</p>
                    <p className="text-[10px] font-black uppercase tracking-widest text-primary mt-2">Fill the outline, parts, quizzes, then save</p>
                  </button>
                )}
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
                      <p className="font-extrabold text-on-surface leading-tight">{module.title}</p>
                      <p className="text-[11px] text-on-surface-variant/60 mt-1 line-clamp-2">{subject?.title || 'Subject'} / {topic?.title || 'Topic'}</p>
                      <p className="text-[11px] text-on-surface-variant/50 mt-1 line-clamp-1">Author: {module.authorName || 'Instructor'}</p>
                      <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40 mt-2">
                        {module.parts.length} parts / {module.finalExam.length} exam items / {module.isPublished ? 'Published' : 'Draft'}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

          </aside>

          <main className="bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-sm overflow-hidden">
            <div className="border-b border-outline-variant p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="flex flex-wrap gap-2">
                {builderMode === 'edit' ? builderSteps.map((step, index) => (
                    <button
                      key={step.id}
                      onClick={() => setActiveStep(step.id)}
                      className={`rounded-xl px-4 py-2 text-xs font-black uppercase tracking-widest border transition-colors ${
                        activeStep === step.id ? 'bg-primary text-on-primary border-primary' : 'bg-surface-container text-on-surface-variant border-outline-variant/30'
                      }`}
                    >
                      {index + 1}. {step.label}
                    </button>
                  )) : (
                    <div className="rounded-xl bg-primary/10 text-primary px-4 py-2 text-xs font-black uppercase tracking-widest border border-primary/20">
                      Student preview
                    </div>
                  )}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setBuilderMode(builderMode === 'edit' ? 'preview' : 'edit')}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-surface-container text-on-surface px-5 py-3 font-bold text-sm border border-outline-variant/40"
                >
                  {builderMode === 'edit' ? <Eye size={16} /> : <Wand2 size={16} />}
                  {builderMode === 'edit' ? 'Preview as student' : 'Back to edit'}
                </button>
                <button onClick={saveModule} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary text-on-primary px-5 py-3 font-bold text-sm shadow-sm">
                  <Save size={16} />
                  Save module
                </button>
                <button onClick={deleteModule} className="inline-flex items-center justify-center gap-2 rounded-xl bg-error/10 text-error px-5 py-3 font-bold text-sm border border-error/20">
                  <Trash2 size={16} />
                  Delete
                </button>
              </div>
            </div>

            <div className="p-5 md:p-6">
              {builderMode === 'preview' && (
                <ModuleStudentPreview
                  draft={draft}
                  updateDraft={updateDraft}
                  updatePartAtIndex={updatePartAtIndex}
                  updateMiniQuestionAtPart={updateMiniQuestionAtPart}
                  updateMiniOptionAtPart={updateMiniOptionAtPart}
                  updateFinalQuestion={updateFinalQuestion}
                  updateFinalOption={updateFinalOption}
                />
              )}

              {builderMode === 'edit' && activeStep === 'outline' && (
                <OutlineStep draft={draft} selectedSubject={selectedSubject} updateDraft={updateDraft} />
              )}

              {builderMode === 'edit' && activeStep === 'parts' && (
                <PartsStep
                  draft={draft}
                  activePartIndex={activePartIndex}
                  setActivePartIndex={setActivePartIndex}
                  activePart={activePart}
                  updatePart={updatePart}
                  updatePartLessonBlock={updatePartLessonBlock}
                  addPart={addPart}
                  removePart={removePart}
                />
              )}

              {builderMode === 'edit' && activeStep === 'assessments' && (
                <AssessmentsStep
                  draft={draft}
                  activePartIndex={activePartIndex}
                  setActivePartIndex={setActivePartIndex}
                  activePart={activePart}
                  updateMiniQuestion={updateMiniQuestion}
                  updateMiniOption={updateMiniOption}
                  updateFinalQuestion={updateFinalQuestion}
                  updateFinalOption={updateFinalOption}
                  addFinalQuestion={addFinalQuestion}
                />
              )}

              {builderMode === 'edit' && activeStep === 'publish' && (
                <PublishStep draft={draft} classes={classes} updateDraft={updateDraft} saveModule={saveModule} />
              )}
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

      <FloatingAIHelper
        isOpen={aiOpen}
        setIsOpen={setAiOpen}
        prompt={assistantPrompt}
        setPrompt={setAssistantPrompt}
        isWorking={isDrafting}
        onDraft={generateAIDraft}
        onProofread={() => rewriteActiveReading('proofread')}
        onParaphrase={() => rewriteActiveReading('paraphrase')}
      />
    </DashboardLayout>
  );
}

function OutlineStep({
  draft,
  selectedSubject,
  updateDraft,
}: {
  draft: BuilderModule;
  selectedSubject: typeof journeySubjects[number];
  updateDraft: (field: keyof BuilderModule, value: any) => void;
}) {
  return (
    <div className="space-y-5">
      <SectionTitle icon={BookOpen} title="Step 1: Outline the module" body="Start with where this module belongs and what learners should master." />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Field label="Module title">
          <input value={draft.title} onChange={(event) => updateDraft('title', event.target.value)} placeholder="e.g. Constructive Alignment" className="input" />
        </Field>
        <Field label="Duration">
          <input value={draft.duration} onChange={(event) => updateDraft('duration', event.target.value)} placeholder="e.g. 45 min" className="input" />
        </Field>
        <Field label="Subject">
          <select value={draft.subjectId} onChange={(event) => updateDraft('subjectId', event.target.value)} className="input font-bold">
            {journeySubjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.title}</option>)}
          </select>
        </Field>
        <Field label="Topic">
          <select value={draft.topicId} onChange={(event) => updateDraft('topicId', event.target.value)} className="input font-bold">
            {selectedSubject.topics.map((topic) => <option key={topic.id} value={topic.id}>{topic.title}</option>)}
          </select>
        </Field>
        <Field label="Level">
          <input type="number" min={1} max={10} value={draft.level} onChange={(event) => updateDraft('level', Number(event.target.value))} className="input" />
        </Field>
      </div>
      <Field label="Student-facing description">
        <textarea value={draft.description} onChange={(event) => updateDraft('description', event.target.value)} rows={4} placeholder="What will the learner master in this module?" className="input resize-none" />
      </Field>
    </div>
  );
}

function ModuleStudentPreview({
  draft,
  updateDraft,
  updatePartAtIndex,
  updateMiniQuestionAtPart,
  updateMiniOptionAtPart,
  updateFinalQuestion,
  updateFinalOption,
}: {
  draft: BuilderModule;
  updateDraft: (field: keyof BuilderModule, value: any) => void;
  updatePartAtIndex: (partIndex: number, patch: Partial<JourneyModulePart>) => void;
  updateMiniQuestionAtPart: (partIndex: number, patch: Partial<JourneyQuestion>) => void;
  updateMiniOptionAtPart: (partIndex: number, optionId: string, text: string) => void;
  updateFinalQuestion: (questionIndex: number, patch: Partial<JourneyQuestion>) => void;
  updateFinalOption: (questionIndex: number, optionId: string, text: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-[260px_1fr] gap-5">
      <aside className="rounded-2xl border border-outline-variant/40 bg-surface-container/30 p-4 h-fit">
        <p className="text-xs font-black uppercase tracking-widest text-primary mb-3">Student topic book</p>
        <div className="space-y-2">
          {draft.parts.map((part, index) => (
            <div key={part.id} className={`rounded-xl border p-3 ${index === 0 ? 'border-primary bg-primary/10' : 'border-outline-variant/30 bg-surface-container/40'}`}>
              <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/50">Lesson {index + 1}</p>
              <p className="text-sm font-extrabold text-on-surface line-clamp-2">{part.title}</p>
            </div>
          ))}
          <div className="rounded-xl border border-outline-variant/30 bg-surface-container/40 p-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/50">Gate</p>
            <p className="text-sm font-extrabold text-on-surface">Final exam at 85%</p>
          </div>
        </div>
      </aside>

      <section className="space-y-5">
        <div className="rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-6">
          <p className="text-xs font-black uppercase tracking-widest text-primary mb-2">Guided module preview</p>
          <input value={draft.title} onChange={(event) => updateDraft('title', event.target.value)} placeholder="Untitled module" className="w-full bg-transparent text-2xl font-extrabold font-headline text-on-surface outline-none border-b border-transparent focus:border-primary/30" />
          <textarea value={draft.description} onChange={(event) => updateDraft('description', event.target.value)} rows={2} placeholder="Student-facing description will appear here." className="mt-2 w-full bg-transparent text-sm text-on-surface-variant outline-none resize-none border-b border-transparent focus:border-primary/30" />
        </div>

        {draft.parts.map((part, partIndex) => {
          const quiz = part.miniQuiz[0] || blankQuestion(`${part.id}-preview`);
          return (
            <div key={part.id} className="rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-6 space-y-4">
              <p className="text-xs font-black uppercase tracking-widest text-primary">Lesson {partIndex + 1} live edit</p>
              <input value={part.title} onChange={(event) => updatePartAtIndex(partIndex, { title: event.target.value })} className="w-full bg-transparent text-xl font-extrabold text-on-surface outline-none border-b border-outline-variant/20 focus:border-primary/40" />
              <textarea value={part.objective} onChange={(event) => updatePartAtIndex(partIndex, { objective: event.target.value })} rows={2} className="w-full bg-surface-container border border-outline-variant/30 rounded-xl p-3 text-sm font-medium outline-none focus:border-primary/40 resize-none" />
              <input value={part.textbookSection.title} onChange={(event) => updatePartAtIndex(partIndex, { textbookSection: { ...part.textbookSection, title: event.target.value } })} className="w-full bg-transparent font-extrabold text-on-surface outline-none border-b border-outline-variant/20 focus:border-primary/40" />
              <textarea value={part.textbookSection.body} onChange={(event) => updatePartAtIndex(partIndex, { textbookSection: { ...part.textbookSection, body: event.target.value } })} rows={6} className="w-full bg-surface-container border border-outline-variant/30 rounded-xl p-4 text-sm text-on-surface-variant leading-relaxed outline-none focus:border-primary/40 resize-y" />
              <div className="rounded-xl border border-outline-variant/30 bg-surface-container/40 p-4 space-y-3">
                <p className="text-xs font-black uppercase tracking-widest text-primary">Mini quiz</p>
                <textarea value={quiz.stem} onChange={(event) => updateMiniQuestionAtPart(partIndex, { stem: event.target.value })} rows={2} className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl p-3 text-sm font-bold outline-none focus:border-primary/40 resize-none" />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {(quiz.options || []).map((option) => (
                    <input key={option.id} value={option.text} onChange={(event) => updateMiniOptionAtPart(partIndex, option.id, event.target.value)} className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-3 text-sm font-semibold text-on-surface outline-none focus:border-primary/40" />
                  ))}
                </div>
                <textarea value={quiz.explanation} onChange={(event) => updateMiniQuestionAtPart(partIndex, { explanation: event.target.value })} rows={2} className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl p-3 text-xs font-medium outline-none focus:border-primary/40 resize-none" />
              </div>
            </div>
          );
        })}

        <div className="rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-6 space-y-4">
          <p className="text-xs font-black uppercase tracking-widest text-primary">Final exam live edit</p>
          {draft.finalExam.map((question, questionIndex) => (
            <div key={question.id} className="rounded-xl border border-outline-variant/30 bg-surface-container/30 p-4 space-y-3">
              <textarea value={question.stem} onChange={(event) => updateFinalQuestion(questionIndex, { stem: event.target.value })} rows={2} className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl p-3 text-sm font-bold outline-none focus:border-primary/40 resize-none" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {(question.options || []).map((option) => (
                  <input key={option.id} value={option.text} onChange={(event) => updateFinalOption(questionIndex, option.id, event.target.value)} className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-3 text-sm font-semibold text-on-surface outline-none focus:border-primary/40" />
                ))}
              </div>
              <textarea value={question.explanation} onChange={(event) => updateFinalQuestion(questionIndex, { explanation: event.target.value })} rows={2} className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl p-3 text-xs font-medium outline-none focus:border-primary/40 resize-none" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function FloatingAIHelper({
  isOpen,
  setIsOpen,
  prompt,
  setPrompt,
  isWorking,
  onDraft,
  onProofread,
  onParaphrase,
}: {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  prompt: string;
  setPrompt: (value: string) => void;
  isWorking: boolean;
  onDraft: () => void;
  onProofread: () => void;
  onParaphrase: () => void;
}) {
  return (
    <div className="fixed right-5 bottom-5 z-[80]">
      {isOpen && (
        <div className="mb-3 w-[min(360px,calc(100vw-2.5rem))] rounded-2xl border border-outline-variant bg-surface-container-lowest shadow-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-primary text-xs font-black uppercase tracking-widest">
              <Bot size={16} />
              AI edit helper
            </div>
            <button onClick={() => setIsOpen(false)} className="p-1 rounded-lg hover:bg-surface-container text-on-surface-variant">
              <X size={16} />
            </button>
          </div>
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            rows={4}
            placeholder="Ask for edits: proofread, paraphrase, make it clearer, or draft a quiz from this topic."
            className="w-full bg-surface-container border border-transparent rounded-xl px-4 py-3 text-sm font-medium resize-none outline-none focus:border-primary/30"
          />
          <div className="grid grid-cols-1 gap-2 mt-3">
            <button onClick={onDraft} disabled={isWorking} className="rounded-xl bg-primary text-on-primary px-4 py-3 text-sm font-bold disabled:opacity-50 inline-flex items-center justify-center gap-2">
              <Sparkles size={16} />
              Draft module/quiz
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={onProofread} disabled={isWorking} className="rounded-xl bg-surface-container text-on-surface px-4 py-3 text-xs font-black uppercase tracking-widest border border-outline-variant/30 disabled:opacity-50">
                Proofread
              </button>
              <button onClick={onParaphrase} disabled={isWorking} className="rounded-xl bg-surface-container text-on-surface px-4 py-3 text-xs font-black uppercase tracking-widest border border-outline-variant/30 disabled:opacity-50">
                Paraphrase
              </button>
            </div>
          </div>
        </div>
      )}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-14 h-14 rounded-full bg-primary text-on-primary shadow-xl flex items-center justify-center"
        title="AI edit helper"
      >
        {isOpen ? <X size={22} /> : <Bot size={24} />}
      </button>
    </div>
  );
}

function PartsStep({
  draft,
  activePartIndex,
  setActivePartIndex,
  activePart,
  updatePart,
  updatePartLessonBlock,
  addPart,
  removePart,
}: {
  draft: BuilderModule;
  activePartIndex: number;
  setActivePartIndex: (index: number) => void;
  activePart: JourneyModulePart;
  updatePart: (patch: Partial<JourneyModulePart>) => void;
  updatePartLessonBlock: (blockIndex: number, content: string) => void;
  addPart: () => void;
  removePart: (index: number) => void;
}) {
  return (
    <div className="space-y-5">
      <SectionTitle icon={Layers3} title="Step 2: Build the parts" body="Each part becomes one stop in the learner journey: reading, lesson, quiz, optional activity." />
      <div className="flex flex-wrap gap-2">
        {draft.parts.map((part, index) => (
          <button key={part.id} onClick={() => setActivePartIndex(index)} className={`rounded-xl px-4 py-2 text-xs font-black uppercase tracking-widest ${activePartIndex === index ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant'}`}>
            Part {index + 1}
          </button>
        ))}
        <button onClick={addPart} className="rounded-xl px-4 py-2 text-xs font-black uppercase tracking-widest bg-primary/10 text-primary inline-flex items-center gap-2">
          <Plus size={14} />
          Add part
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_220px] gap-5">
        <div className="space-y-5">
          <Field label="Part title">
            <input value={activePart.title} onChange={(event) => updatePart({ title: event.target.value })} className="input" />
          </Field>
          <Field label="Learning objective">
            <textarea value={activePart.objective} onChange={(event) => updatePart({ objective: event.target.value })} rows={2} className="input resize-none" />
          </Field>
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_160px] gap-4">
            <Field label="Textbook section title">
              <input value={activePart.textbookSection.title} onChange={(event) => updatePart({ textbookSection: { ...activePart.textbookSection, title: event.target.value } })} className="input" />
            </Field>
            <Field label="Read minutes">
              <input type="number" min={1} value={activePart.textbookSection.estimatedReadMinutes} onChange={(event) => updatePart({ textbookSection: { ...activePart.textbookSection, estimatedReadMinutes: Number(event.target.value) } })} className="input" />
            </Field>
          </div>
          <Field label="Video or Canva embed link">
            <input
              value={activePart.textbookSection.mediaUrl || ''}
              onChange={(event) => updatePart({ textbookSection: { ...activePart.textbookSection, mediaUrl: event.target.value } })}
              placeholder="Paste a YouTube, Canva, or slide embed URL without uploading the file"
              className="input"
            />
          </Field>
          <Field label="Textbook reading body">
            <textarea value={activePart.textbookSection.body} onChange={(event) => updatePart({ textbookSection: { ...activePart.textbookSection, body: event.target.value } })} rows={7} className="input resize-y leading-relaxed" />
          </Field>
          <div className="space-y-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/50">Mini lesson blocks</p>
            {activePart.lessonBlocks.map((block, index) => (
              <textarea key={index} value={block.content} onChange={(event) => updatePartLessonBlock(index, event.target.value)} rows={block.type === 'text' ? 3 : 2} className="input resize-y" />
            ))}
          </div>
        </div>

        <aside className="rounded-2xl bg-surface-container/40 border border-outline-variant/40 p-4 h-fit">
          <p className="text-sm font-extrabold text-on-surface">Part checklist</p>
          <ChecklistItem done={!!activePart.textbookSection.body} label="Textbook section" />
          <ChecklistItem done={activePart.lessonBlocks.length > 0} label="Mini lesson" />
          <ChecklistItem done={activePart.miniQuiz.length > 0} label="Mini quiz" />
          <ChecklistItem done={!!activePart.activity?.prompt} label="Optional activity" />
          <button onClick={() => removePart(activePartIndex)} className="w-full mt-4 rounded-xl bg-error/10 text-error px-4 py-3 text-xs font-bold inline-flex items-center justify-center gap-2">
            <Trash2 size={14} />
            Remove part
          </button>
        </aside>
      </div>
    </div>
  );
}

function AssessmentsStep({
  draft,
  activePartIndex,
  setActivePartIndex,
  activePart,
  updateMiniQuestion,
  updateMiniOption,
  updateFinalQuestion,
  updateFinalOption,
  addFinalQuestion,
}: {
  draft: BuilderModule;
  activePartIndex: number;
  setActivePartIndex: (index: number) => void;
  activePart: JourneyModulePart;
  updateMiniQuestion: (patch: Partial<JourneyQuestion>) => void;
  updateMiniOption: (optionId: string, text: string) => void;
  updateFinalQuestion: (questionIndex: number, patch: Partial<JourneyQuestion>) => void;
  updateFinalOption: (questionIndex: number, optionId: string, text: string) => void;
  addFinalQuestion: () => void;
}) {
  const miniQuestion = activePart.miniQuiz[0] || blankQuestion(`${activePart.id}-q1`);

  return (
    <div className="space-y-8">
      <SectionTitle icon={FileQuestion} title="Step 3: Add checks and final exam" body="Mini quizzes teach inside each part. The final exam gates module completion." />

      <section className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {draft.parts.map((_part, index) => (
            <button key={index} onClick={() => setActivePartIndex(index)} className={`rounded-xl px-4 py-2 text-xs font-black uppercase tracking-widest ${activePartIndex === index ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant'}`}>
              Mini quiz part {index + 1}
            </button>
          ))}
        </div>
        <QuestionEditor
          title={`Mini quiz for ${activePart.title}`}
          question={miniQuestion}
          onQuestion={(patch) => updateMiniQuestion(patch)}
          onOption={(optionId, text) => updateMiniOption(optionId, text)}
        />
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-headline font-extrabold text-xl">Final module exam</h3>
          <button onClick={addFinalQuestion} className="rounded-xl bg-primary/10 text-primary px-4 py-2 text-xs font-black uppercase tracking-widest inline-flex items-center gap-2">
            <Plus size={14} />
            Add exam item
          </button>
        </div>
        {draft.finalExam.map((question, index) => (
          <QuestionEditor
            key={question.id}
            title={`Final exam question ${index + 1}`}
            question={question}
            onQuestion={(patch) => updateFinalQuestion(index, patch)}
            onOption={(optionId, text) => updateFinalOption(index, optionId, text)}
          />
        ))}
      </section>
    </div>
  );
}

function PublishStep({
  draft,
  classes,
  updateDraft,
  saveModule,
}: {
  draft: BuilderModule;
  classes: any[];
  updateDraft: (field: keyof BuilderModule, value: any) => void;
  saveModule: () => void;
}) {
  const readyChecks = [
    { label: 'Module has a title', done: !!draft.title.trim() },
    { label: 'Description explains the goal', done: !!draft.description.trim() },
    { label: 'At least one learning part', done: draft.parts.length > 0 },
    { label: 'Every part has reading text', done: draft.parts.every((part) => !!part.textbookSection.body.trim()) },
    { label: 'Final exam has at least one item', done: draft.finalExam.length > 0 },
  ];

  const canPublish = readyChecks.every((item) => item.done);

  return (
    <div className="space-y-5">
      <SectionTitle icon={CheckCircle2} title="Step 4: Review and publish" body="Publish only when the path is complete enough for learners to follow without confusion." />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {readyChecks.map((item) => <ChecklistItem key={item.label} done={item.done} label={item.label} />)}
      </div>
      <label className="flex items-center justify-between gap-4 bg-surface-container rounded-xl px-4 py-4">
        <span>
          <span className="block text-sm font-extrabold text-on-surface">Publish to students</span>
          <span className="block text-xs text-on-surface-variant/60">Draft modules stay hidden from the learner journey.</span>
        </span>
        <input type="checkbox" checked={draft.isPublished} disabled={!canPublish} onChange={(event) => updateDraft('isPublished', event.target.checked)} className="w-5 h-5 accent-primary disabled:opacity-40" />
      </label>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Field label="Available to">
          <select value={draft.publishScope} onChange={(event) => updateDraft('publishScope', event.target.value)} className="input font-bold">
            <option value="public">Public / self-study learners</option>
            <option value="classes">Specific classes only</option>
          </select>
        </Field>
        <Field label="Due date">
          <input type="datetime-local" value={draft.dueAt || ''} onChange={(event) => updateDraft('dueAt', event.target.value)} className="input" />
        </Field>
      </div>
      {draft.publishScope === 'classes' && (
        <div className="rounded-2xl border border-outline-variant/40 bg-surface-container/30 p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/50 mb-3">Choose classes</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {classes.map((classItem) => {
              const checked = draft.classIds.includes(classItem.id);
              return (
                <label key={classItem.id} className="flex items-center gap-3 rounded-xl bg-surface-container-lowest border border-outline-variant/30 p-3">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) => {
                      const nextIds = event.target.checked
                        ? [...draft.classIds, classItem.id]
                        : draft.classIds.filter((id) => id !== classItem.id);
                      updateDraft('classIds', nextIds);
                    }}
                    className="w-4 h-4 accent-primary"
                  />
                  <span className="text-sm font-bold text-on-surface">{classItem.className}</span>
                </label>
              );
            })}
            {classes.length === 0 && <p className="text-sm font-bold text-on-surface-variant/40">No classes yet. Create a class first.</p>}
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <label className="flex items-center justify-between gap-4 bg-surface-container rounded-xl px-4 py-4">
          <span>
            <span className="block text-sm font-extrabold text-on-surface">Anti-cheat for exam/assignment</span>
            <span className="block text-xs text-on-surface-variant/60">Fullscreen, tab focus, and copy/paste warnings.</span>
          </span>
          <input type="checkbox" checked={draft.antiCheatEnabled} onChange={(event) => updateDraft('antiCheatEnabled', event.target.checked)} className="w-5 h-5 accent-primary" />
        </label>
        <label className="flex items-center justify-between gap-4 bg-surface-container rounded-xl px-4 py-4">
          <span>
            <span className="block text-sm font-extrabold text-on-surface">Record first attempt only</span>
            <span className="block text-xs text-on-surface-variant/60">Retakes can practice, but first score remains official.</span>
          </span>
          <input type="checkbox" checked={draft.recordFirstAttemptOnly} onChange={(event) => updateDraft('recordFirstAttemptOnly', event.target.checked)} className="w-5 h-5 accent-primary" />
        </label>
      </div>
      <button onClick={saveModule} className="rounded-xl bg-primary text-on-primary px-6 py-3 font-bold">Save module</button>
    </div>
  );
}

function QuestionEditor({
  title,
  question,
  onQuestion,
  onOption,
}: {
  title: string;
  question: JourneyQuestion;
  onQuestion: (patch: Partial<JourneyQuestion>) => void;
  onOption: (optionId: string, text: string) => void;
}) {
  return (
    <div className="rounded-2xl border border-outline-variant/40 bg-surface-container/20 p-4 space-y-4">
      <h4 className="font-extrabold text-on-surface">{title}</h4>
      <Field label="Question type">
        <select
          value={question.type || 'multiple_choice'}
          onChange={(event) => {
            const type = event.target.value as JourneyQuestion['type'];
            if (type === 'true_false') {
              onQuestion({
                type,
                options: [{ id: 'A', text: 'True' }, { id: 'B', text: 'False' }],
                correctOptionId: 'A',
              });
            } else if (type === 'multiple_choice') {
              onQuestion({
                type,
                options: question.options?.length ? question.options : blankQuestion(question.id).options,
                correctOptionId: question.correctOptionId || 'A',
              });
            } else {
              onQuestion({
                type,
                options: [],
                correctOptionId: '',
                acceptedAnswers: question.acceptedAnswers?.length ? question.acceptedAnswers : ['Key idea from the reading'],
                expectedAnswer: question.expectedAnswer || 'Expected answer based on the textbook reading.',
              });
            }
          }}
          className="input font-bold"
        >
          <option value="multiple_choice">Multiple choice</option>
          <option value="true_false">True / False</option>
          <option value="enumeration">Enumeration</option>
          <option value="short_answer">Short answer</option>
          <option value="essay">Essay</option>
        </select>
      </Field>
      <Field label="Question stem">
        <textarea value={question.stem} onChange={(event) => onQuestion({ stem: event.target.value })} rows={3} className="input resize-none" />
      </Field>
      {(!question.type || question.type === 'multiple_choice' || question.type === 'true_false') ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {question.options.map((option) => (
              <Field key={option.id} label={`Option ${option.id}`}>
                <input value={option.text} onChange={(event) => onOption(option.id, event.target.value)} className="input" />
              </Field>
            ))}
          </div>
          <Field label="Correct answer">
            <select value={question.correctOptionId} onChange={(event) => onQuestion({ correctOptionId: event.target.value })} className="input font-bold">
              {question.options.map((option) => <option key={option.id} value={option.id}>{option.id}</option>)}
            </select>
          </Field>
        </>
      ) : (
        <>
          <Field label="Expected answer / rubric">
            <textarea value={question.expectedAnswer || ''} onChange={(event) => onQuestion({ expectedAnswer: event.target.value })} rows={3} className="input resize-none" />
          </Field>
          <Field label="Accepted answers or key terms">
            <textarea
              value={(question.acceptedAnswers || []).join('\n')}
              onChange={(event) => onQuestion({ acceptedAnswers: event.target.value.split('\n').map((item) => item.trim()).filter(Boolean) })}
              rows={3}
              className="input resize-none"
              placeholder="One accepted answer or key term per line"
            />
          </Field>
        </>
      )}
      <Field label="Explanation">
        <textarea value={question.explanation} onChange={(event) => onQuestion({ explanation: event.target.value })} rows={2} className="input resize-none" />
      </Field>
    </div>
  );
}

function SectionTitle({ icon: Icon, title, body }: { icon: React.ElementType; title: string; body: string }) {
  return (
    <div>
      <div className="flex items-center gap-2 text-primary text-xs font-black uppercase tracking-widest mb-2">
        <Icon size={16} />
        Builder guide
      </div>
      <h2 className="text-2xl font-extrabold font-headline text-on-surface">{title}</h2>
      <p className="text-sm text-on-surface-variant mt-2">{body}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/50">{label}</span>
      {children}
    </label>
  );
}

function ChecklistItem({ done, label }: { done: boolean; label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-surface-container/40 border border-outline-variant/30 px-4 py-3">
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${done ? 'bg-emerald-500/10 text-emerald-600' : 'bg-surface-container text-on-surface-variant/40'}`}>
        <CheckCircle2 size={16} />
      </div>
      <span className="text-sm font-bold text-on-surface">{label}</span>
    </div>
  );
}
