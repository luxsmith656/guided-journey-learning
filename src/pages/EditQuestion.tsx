import React, { useEffect, useMemo, useState } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import { useParams, useNavigate } from 'react-router-dom';
import { collection, doc, getDoc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';

interface Option {
  id: string;
  text: string;
}

interface Category {
  id: string;
  name: string;
}

interface Topic {
  id: string;
  title: string;
  categoryId: string;
}

interface Competency {
  id: string;
  title: string;
  topicId?: string;
  categoryId?: string;
}

const DEFAULT_OPTIONS: Option[] = [
  { id: 'A', text: '' },
  { id: 'B', text: '' },
  { id: 'C', text: '' },
  { id: 'D', text: '' },
];

const OPTION_IDS = ['A', 'B', 'C', 'D'];

export default function EditQuestion() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isNew = !id || id === 'new';
  const bankPath = user?.role === 'instructor' ? '/instructor/questions' : '/admin/question/bank';

  const [stem, setStem] = useState('');
  const [options, setOptions] = useState<Option[]>(DEFAULT_OPTIONS);
  const [correctOptionId, setCorrectOptionId] = useState('A');
  const [categoryId, setCategoryId] = useState('');
  const [topicId, setTopicId] = useState('');
  const [competencyId, setCompetencyId] = useState('');
  const [difficulty, setDifficulty] = useState('medium');
  const [rationalization, setRationalization] = useState('');
  const [wrongChoiceExplanations, setWrongChoiceExplanations] = useState<Record<string, string>>({ A: '', B: '', C: '', D: '' });
  const [familyId, setFamilyId] = useState('');
  const [variantId, setVariantId] = useState('');
  const [specialization, setSpecialization] = useState('');
  const [sourceNote, setSourceNote] = useState('');
  const [misconceptionTags, setMisconceptionTags] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [competencies, setCompetencies] = useState<Competency[]>([]);
  const [isLoading, setIsLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const unsubCats = onSnapshot(collection(db, 'categories'), (snapshot) => {
      const rows = snapshot.docs.map((categoryDoc) => ({
        id: categoryDoc.id,
        name: categoryDoc.data().title || categoryDoc.data().name || categoryDoc.id,
      }));
      setCategories(rows);
      if (!categoryId && rows[0]) setCategoryId(rows[0].id);
    });

    const unsubTopics = onSnapshot(collection(db, 'topics'), (snapshot) => {
      setTopics(snapshot.docs.map((topicDoc) => ({
        id: topicDoc.id,
        title: topicDoc.data().title || topicDoc.data().name || topicDoc.id,
        categoryId: topicDoc.data().categoryId || topicDoc.data().subjectId || '',
      })));
    });

    const unsubCompetencies = onSnapshot(collection(db, 'competencies'), (snapshot) => {
      setCompetencies(snapshot.docs.map((competencyDoc) => ({
        id: competencyDoc.id,
        title: competencyDoc.data().title || competencyDoc.data().name || competencyDoc.id,
        topicId: competencyDoc.data().topicId,
        categoryId: competencyDoc.data().categoryId,
      })));
    });

    if (!isNew && id) {
      const fetchQuestion = async () => {
        try {
          const questionDoc = await getDoc(doc(db, 'questions', id));
          if (questionDoc.exists()) {
            const data = questionDoc.data();
            setStem(data.stem || '');
            setOptions(data.options?.length ? data.options : DEFAULT_OPTIONS);
            setCorrectOptionId(data.correctOptionId || 'A');
            setCategoryId(data.categoryId || '');
            setTopicId(data.topicId || '');
            setCompetencyId(data.competencyId || data.skillIds?.[0] || '');
            setDifficulty(normalizeDifficulty(data.difficulty || 'medium'));
            setRationalization(data.rationalization || data.explanation || '');
            setWrongChoiceExplanations({ A: '', B: '', C: '', D: '', ...(data.wrongChoiceExplanations || {}) });
            setFamilyId(data.familyId || data.questionFamilyId || '');
            setVariantId(data.variantId || '');
            setSpecialization(data.specialization || '');
            setSourceNote(data.sourceNote || '');
            setMisconceptionTags((data.misconceptionTags || []).join(', '));
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, `questions/${id}`);
        } finally {
          setIsLoading(false);
        }
      };
      void fetchQuestion();
    }

    return () => {
      unsubCats();
      unsubTopics();
      unsubCompetencies();
    };
  }, [id, isNew]);

  const filteredTopics = useMemo(() => topics.filter((topic) => !categoryId || topic.categoryId === categoryId), [topics, categoryId]);
  const filteredCompetencies = useMemo(() => competencies.filter((competency) => (
    (!topicId || competency.topicId === topicId) &&
    (!categoryId || !competency.categoryId || competency.categoryId === categoryId)
  )), [competencies, topicId, categoryId]);

  const handleSave = async () => {
    const cleanOptions = options.map((option) => ({ ...option, text: option.text.trim() }));
    const optionTexts = cleanOptions.map((option) => option.text.toLowerCase());
    const missingWrongExplanations = OPTION_IDS.filter((optionId) => !String(wrongChoiceExplanations[optionId] || '').trim());

    if (!stem.trim() || !categoryId || !topicId || !competencyId || !rationalization.trim()) {
      setNotice('Complete stem, category, topic, competency, and rationalization before saving.');
      return;
    }
    if (cleanOptions.some((option) => !option.text)) {
      setNotice('Complete all four options before saving.');
      return;
    }
    if (new Set(optionTexts).size !== optionTexts.length) {
      setNotice('Options must be distinct so students are not graded on duplicated choices.');
      return;
    }
    if (missingWrongExplanations.length > 0) {
      setNotice(`Add explanations for choices ${missingWrongExplanations.join(', ')}.`);
      return;
    }

    setSaving(true);
    setNotice('');
    const questionRef = isNew ? doc(collection(db, 'questions')) : doc(db, 'questions', id!);
    const nextFamilyId = familyId.trim() || `${questionRef.id}_family`;
    const nextVariantId = variantId.trim() || `${nextFamilyId}_v1`;
    const tags = misconceptionTags.split(',').map((tag) => tag.trim()).filter(Boolean);
    const questionData = {
      stem: stem.trim(),
      options: cleanOptions,
      correctOptionId,
      categoryId,
      topicId,
      competencyId,
      skillIds: [competencyId],
      difficulty: normalizeDifficulty(difficulty),
      explanation: rationalization.trim(),
      rationalization: rationalization.trim(),
      wrongChoiceExplanations: {
        A: wrongChoiceExplanations.A.trim(),
        B: wrongChoiceExplanations.B.trim(),
        C: wrongChoiceExplanations.C.trim(),
        D: wrongChoiceExplanations.D.trim(),
      },
      specialization: specialization.trim(),
      familyId: nextFamilyId,
      questionFamilyId: nextFamilyId,
      variantId: nextVariantId,
      sourceNote: sourceNote.trim(),
      misconceptionTags: tags,
      type: 'multiple_choice',
      status: 'draft',
      approvalStatus: 'for_review',
      approved: false,
      isPublished: false,
      editedRequiresApproval: true,
      approvalRequiredReason: isNew ? 'new_question' : 'edited_question',
      aiGenerated: false,
      createdBy: user?.uid || '',
      author: user?.fullName || user?.email || 'Question author',
      updatedAt: serverTimestamp(),
      ...(isNew ? { createdAt: serverTimestamp(), version: 1 } : {}),
    };

    try {
      await setDoc(questionRef, questionData, { merge: true });
      setNotice('Question saved as for-review. It will not appear in live exams until approved in the Question Bank.');
      window.setTimeout(() => navigate(bankPath), 900);
    } catch (error) {
      handleFirestoreError(error, isNew ? OperationType.CREATE : OperationType.UPDATE, 'questions');
      setNotice('Unable to save question. Please check the required fields and try again.');
    } finally {
      setSaving(false);
    }
  };

  const updateOptionText = (idx: number, text: string) => {
    setOptions((rows) => rows.map((option, optionIndex) => optionIndex === idx ? { ...option, text } : option));
  };

  const updateWrongExplanation = (optionId: string, value: string) => {
    setWrongChoiceExplanations((rows) => ({ ...rows, [optionId]: value }));
  };

  if (isLoading) return <div className="p-8 text-center">Loading...</div>;

  return (
    <DashboardLayout title={isNew ? 'New Question' : 'Edit Question'}>
      <div className="mt-8 p-8 max-w-6xl mx-auto w-full flex-1 text-on-surface">
        <nav className="flex items-center gap-2 text-xs text-on-surface-variant/50 font-bold uppercase tracking-widest mb-6">
          <span className="cursor-pointer hover:text-primary" onClick={() => navigate(bankPath)}>Question Bank</span>
          <span className="material-symbols-outlined text-sm">chevron_right</span>
          <span className="text-primary">{isNew ? 'New Question' : 'Edit Question'}</span>
        </nav>

        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 mb-8">
          <div>
            <h2 className="text-3xl font-headline font-extrabold text-primary mb-2">{isNew ? 'Create LET Question' : 'Edit LET Question'}</h2>
            <p className="text-on-surface-variant text-sm font-medium">
              Questions are saved for review first. Live mock exams only use approved, published, blueprint-ready items.
            </p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => navigate(bankPath)} className="px-6 py-2.5 rounded-xl bg-surface-container text-on-surface font-bold text-sm border border-outline-variant">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="px-8 py-2.5 rounded-xl text-on-primary bg-primary font-bold text-sm shadow-lg shadow-primary/20 disabled:opacity-50">
              {saving ? 'Saving...' : 'Save for Review'}
            </button>
          </div>
        </div>

        {notice && (
          <div className={`mb-6 rounded-2xl border p-4 text-sm font-bold ${notice.includes('saved') ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700' : 'border-amber-500/20 bg-amber-500/10 text-amber-700'}`}>
            {notice}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 pb-10">
          <div className="lg:col-span-8 space-y-8">
            <Panel title="Question Stem" icon="edit_note">
              <textarea
                className="w-full h-32 bg-surface-container border border-outline-variant/30 rounded-xl resize-none p-4 text-sm font-medium focus:border-primary/40 outline-none transition-all"
                placeholder="Type the LET-style question stem here..."
                value={stem}
                onChange={(event) => setStem(event.target.value)}
              />
            </Panel>

            <Panel title="Answer Options" icon="checklist">
              <div className="space-y-4">
                {options.map((option, idx) => (
                  <div key={option.id} className={`flex items-start gap-4 p-4 rounded-xl border transition-all ${correctOptionId === option.id ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-surface-container border-outline-variant/20'}`}>
                    <input
                      type="radio"
                      name="answer"
                      checked={correctOptionId === option.id}
                      onChange={() => setCorrectOptionId(option.id)}
                      className="mt-1 w-5 h-5 accent-emerald-600"
                    />
                    <div className="flex-1">
                      <span className="block font-bold text-[10px] uppercase tracking-widest text-on-surface-variant/50 mb-1">Option {option.id} {correctOptionId === option.id && <span className="ml-2 text-emerald-600">(Correct)</span>}</span>
                      <textarea
                        className="w-full h-12 bg-transparent border-none p-0 text-sm font-medium resize-none outline-none"
                        placeholder={`Enter text for option ${option.id}...`}
                        value={option.text}
                        onChange={(event) => updateOptionText(idx, event.target.value)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="Teaching Rationalization" icon="psychology_alt">
              <textarea
                className="w-full h-28 bg-surface-container border border-outline-variant/30 rounded-xl resize-none p-4 text-sm font-medium focus:border-primary/40 outline-none transition-all"
                placeholder="Explain why the correct answer is right, using LET review language."
                value={rationalization}
                onChange={(event) => setRationalization(event.target.value)}
              />
            </Panel>

            <Panel title="Wrong-Choice Explanations" icon="rule">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {OPTION_IDS.map((optionId) => (
                  <div key={optionId}>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-on-surface-variant/50 mb-2">
                      Choice {optionId} explanation
                    </label>
                    <textarea
                      value={wrongChoiceExplanations[optionId] || ''}
                      onChange={(event) => updateWrongExplanation(optionId, event.target.value)}
                      rows={3}
                      placeholder={optionId === correctOptionId ? 'Explain why this is the best answer.' : 'Explain the misconception or trap in this option.'}
                      className="w-full bg-surface-container border border-outline-variant/30 rounded-xl p-3 text-sm resize-none outline-none focus:border-primary/40"
                    />
                  </div>
                ))}
              </div>
            </Panel>
          </div>

          <div className="lg:col-span-4 space-y-8">
            <Panel title="LET Mapping" icon="account_tree">
              <div className="space-y-5">
                <SelectField label="Category" value={categoryId} onChange={(value) => { setCategoryId(value); setTopicId(''); setCompetencyId(''); }} options={categories.map((category) => ({ value: category.id, label: category.name }))} />
                <SelectField label="Topic" value={topicId} onChange={(value) => { setTopicId(value); setCompetencyId(''); }} options={filteredTopics.map((topic) => ({ value: topic.id, label: topic.title }))} />
                <SelectField label="Competency" value={competencyId} onChange={setCompetencyId} options={filteredCompetencies.map((competency) => ({ value: competency.id, label: competency.title }))} />
                <div>
                  <label className="block text-[10px] font-bold text-on-surface-variant/50 uppercase tracking-widest mb-2">Difficulty</label>
                  <div className="grid grid-cols-3 gap-2">
                    {['easy', 'medium', 'hard'].map((level) => (
                      <button
                        key={level}
                        onClick={() => setDifficulty(level)}
                        className={`py-2 text-[10px] font-bold uppercase tracking-widest rounded-xl transition-all border ${difficulty === level ? 'bg-primary text-on-primary border-primary' : 'bg-surface-container text-on-surface-variant border-outline-variant/20 hover:border-primary/40'}`}
                      >
                        {level}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </Panel>

            <Panel title="Variant Tracking" icon="hub">
              <div className="space-y-4">
                <InputField label="Question family" value={familyId} onChange={setFamilyId} placeholder="e.g. fam_validity_reliability" />
                <InputField label="Variant ID" value={variantId} onChange={setVariantId} placeholder="Leave blank to auto-create" />
                <InputField label="Specialization" value={specialization} onChange={setSpecialization} placeholder="e.g. Mathematics" />
                <InputField label="Misconception tags" value={misconceptionTags} onChange={setMisconceptionTags} placeholder="validity, reliability, assessment trap" />
                <InputField label="Source note" value={sourceNote} onChange={setSourceNote} placeholder="Reviewer, page, instructor source, etc." />
              </div>
            </Panel>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

function Panel({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface-container-lowest rounded-2xl p-6 border border-outline-variant shadow-sm">
      <h3 className="font-headline font-bold text-lg text-on-surface mb-4 flex items-center gap-2">
        <span className="material-symbols-outlined text-primary">{icon}</span> {title}
      </h3>
      {children}
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div>
      <label className="block text-[10px] font-bold text-on-surface-variant/50 uppercase tracking-widest mb-2">{label}</label>
      <select
        className="w-full bg-surface-container border border-outline-variant/30 rounded-xl text-sm font-bold py-3 px-4 outline-none focus:border-primary/40 transition-all"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Select {label}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </div>
  );
}

function InputField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div>
      <label className="block text-[10px] font-bold text-on-surface-variant/50 uppercase tracking-widest mb-2">{label}</label>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full bg-surface-container border border-outline-variant/30 rounded-xl text-sm font-medium py-3 px-4 outline-none focus:border-primary/40 transition-all"
      />
    </div>
  );
}

function normalizeDifficulty(value: string) {
  const normalized = String(value || '').toLowerCase();
  if (normalized === 'average' || normalized === 'normal') return 'medium';
  if (['easy', 'medium', 'hard'].includes(normalized)) return normalized;
  return 'medium';
}
