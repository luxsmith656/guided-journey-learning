import React, { useEffect, useMemo, useState } from 'react';
import {
  Bot,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  FileQuestion,
  Layers3,
  Plus,
  Save,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { addDoc, collection, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc } from 'firebase/firestore';
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
  const [selectedModuleId, setSelectedModuleId] = useState(journeyModules[0].id);
  const [draft, setDraft] = useState<BuilderModule>(fromSeedModule(journeyModules[0]));
  const [activeStep, setActiveStep] = useState<BuilderStep>('outline');
  const [activePartIndex, setActivePartIndex] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [assistantPrompt, setAssistantPrompt] = useState('');
  const [isDrafting, setIsDrafting] = useState(false);
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
  const activePart = draft.parts[Math.min(activePartIndex, Math.max(draft.parts.length - 1, 0))];

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

  const updateDraft = (field: keyof BuilderModule, value: string | number | boolean | JourneyModulePart[] | JourneyQuestion[]) => {
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
    setSelectedModuleId(module.id);
    setDraft(module);
    setActiveStep('outline');
    setActivePartIndex(0);
  };

  const createNewDraft = () => {
    const topicId = selectedSubject.topics[0]?.id || journeySubjects[0].topics[0].id;
    setSelectedModuleId('');
    setDraft({ ...emptyModule, subjectId: selectedSubject.id, topicId, parts: [blankPart(0)], finalExam: [blankQuestion('final-q1')] });
    setActiveStep('outline');
    setActivePartIndex(0);
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

              <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
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
                      <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40 mt-2">
                        {module.parts.length} parts / {module.finalExam.length} exam items / {module.isPublished ? 'Published' : 'Draft'}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-4 shadow-sm">
              <div className="flex items-center gap-2 text-primary text-xs font-black uppercase tracking-widest mb-3">
                <Bot size={16} />
                AI module helper
              </div>
              <textarea
                value={assistantPrompt}
                onChange={(event) => setAssistantPrompt(event.target.value)}
                rows={4}
                placeholder="Describe the module you want, e.g. assessment validity with 2 parts and LET-style quiz questions."
                className="w-full bg-surface-container border border-transparent rounded-xl px-4 py-3 text-sm font-medium resize-none outline-none focus:border-primary/30"
              />
              <button
                onClick={generateAIDraft}
                disabled={isDrafting}
                className="w-full mt-3 inline-flex items-center justify-center gap-2 rounded-xl bg-primary text-on-primary px-4 py-3 font-bold text-sm disabled:opacity-50"
              >
                <Sparkles size={16} />
                {isDrafting ? 'Drafting...' : 'Draft editable module'}
              </button>
            </div>
          </aside>

          <main className="bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-sm overflow-hidden">
            <div className="border-b border-outline-variant p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="flex flex-wrap gap-2">
                {builderSteps.map((step, index) => (
                  <button
                    key={step.id}
                    onClick={() => setActiveStep(step.id)}
                    className={`rounded-xl px-4 py-2 text-xs font-black uppercase tracking-widest border transition-colors ${
                      activeStep === step.id ? 'bg-primary text-on-primary border-primary' : 'bg-surface-container text-on-surface-variant border-outline-variant/30'
                    }`}
                  >
                    {index + 1}. {step.label}
                  </button>
                ))}
              </div>
              <button onClick={saveModule} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary text-on-primary px-5 py-3 font-bold text-sm shadow-sm">
                <Save size={16} />
                Save module
              </button>
            </div>

            <div className="p-5 md:p-6">
              {activeStep === 'outline' && (
                <OutlineStep draft={draft} selectedSubject={selectedSubject} updateDraft={updateDraft} />
              )}

              {activeStep === 'parts' && (
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

              {activeStep === 'assessments' && (
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

              {activeStep === 'publish' && (
                <PublishStep draft={draft} updateDraft={updateDraft} saveModule={saveModule} />
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
  updateDraft,
  saveModule,
}: {
  draft: BuilderModule;
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
