import React, { useState, useEffect } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import { collection, onSnapshot, query, orderBy, deleteDoc, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import DeleteConfirmModal from '../components/DeleteConfirmModal';
import Toast from '../components/Toast';
import { FixedSizeList as List } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';

interface Question {
  id: string;
  stem: string;
  categoryId: string;
  correctOptionId: string;
  difficulty: string;
  topicId?: string;
  competencyId?: string;
  specialization?: string;
  familyId?: string;
  questionFamilyId?: string;
  rationalization?: string;
  explanation?: string;
  wrongChoiceExplanations?: Record<string, string>;
  status?: string;
  approvalStatus?: string;
  approved?: boolean;
  isPublished?: boolean;
  aiGenerated?: boolean;
}

interface Category {
  id: string;
  name: string;
}

export default function QuestionBank() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const navigate = useNavigate();
  const { user } = useAuth();

  const getEditPath = (id?: string) => {
    const base = user?.role === 'instructor' ? '/instructor' : '/admin';
    return id ? `${base}/question/edit/${id}` : `${base}/question/new`;
  };

  // Deletion state
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMsg, setToastMsg] = useState('');

  useEffect(() => {
    // Categories for mapping names
    const unsubCats = onSnapshot(collection(db, 'categories'), (snapshot) => {
      setCategories(snapshot.docs.map(d => ({ id: d.id, name: d.data().name })));
    });

    // Questions list
    const q = query(collection(db, 'questions'), orderBy('stem', 'asc'));
    const unsubQs = onSnapshot(q, (snapshot) => {
      setQuestions(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Question)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'questions');
    });

    return () => { unsubCats(); unsubQs(); };
  }, []);

  const confirmDelete = async () => {
    if (!deleteId) return;
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, 'questions', deleteId));
      setDeleteId(null);
      setToastMsg('Question deleted successfully');
      setShowToast(true);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `questions/${deleteId}`);
      setToastMsg('Failed to delete question');
      setShowToast(true);
    } finally {
      setIsDeleting(false);
    }
  };

  const getCategoryName = (id: string) => categories.find(c => c.id === id)?.name || 'Unknown';
  const getQuestionStatus = (question: Question) => (
    question.approvalStatus || question.status || (question.approved && question.isPublished ? 'approved' : 'draft')
  );
  const hasCompleteRationalization = (question: Question) => Boolean(question.rationalization || question.explanation);
  const hasWrongChoiceExplanations = (question: Question) => {
    const explanations = question.wrongChoiceExplanations || {};
    return ['A', 'B', 'C', 'D'].every((optionId) => String(explanations[optionId] || '').trim().length > 0);
  };
  const isBlueprintReady = (question: Question) => Boolean(
    question.categoryId &&
    question.topicId &&
    question.competencyId &&
    question.difficulty &&
    hasCompleteRationalization(question) &&
    hasWrongChoiceExplanations(question)
  );

  const filteredQuestions = questions.filter(q => {
    const matchesSearch = q.stem.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || q.categoryId === selectedCategory;
    const matchesStatus = selectedStatus === 'all' || getQuestionStatus(q) === selectedStatus;
    return matchesSearch && matchesCategory && matchesStatus;
  });
  const statusCounts = questions.reduce<Record<string, number>>((counts, question) => {
    const status = getQuestionStatus(question);
    counts[status] = (counts[status] || 0) + 1;
    return counts;
  }, {});
  const blueprintReadyCount = questions.filter(isBlueprintReady).length;

  const updateQuestionReview = async (question: Question, action: 'approve' | 'review' | 'archive') => {
    try {
      const patch = action === 'approve'
        ? {
            status: 'approved',
            approvalStatus: 'approved',
            approved: true,
            isPublished: true,
            approvedBy: user?.uid || '',
            approvedByName: user?.fullName || user?.email || 'Reviewer',
            approvedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }
        : action === 'archive'
          ? {
              status: 'archived',
              approvalStatus: 'archived',
              approved: false,
              isPublished: false,
              archivedBy: user?.uid || '',
              archivedAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            }
          : {
              status: 'draft',
              approvalStatus: 'for_review',
              approved: false,
              isPublished: false,
              updatedAt: serverTimestamp(),
            };
      await updateDoc(doc(db, 'questions', question.id), patch);
      setToastMsg(action === 'approve' ? 'Question approved for live exams' : action === 'archive' ? 'Question archived' : 'Question sent for review');
      setShowToast(true);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `questions/${question.id}`);
      setToastMsg('Failed to update question status');
      setShowToast(true);
    }
  };

  const Row = ({ index, style }: { index: number; style: React.CSSProperties }) => {
    const q = filteredQuestions[index];
    return (
      <div style={style} className="border-b border-outline-variant/10 hover:bg-surface-container/20 transition-colors group flex items-center">
        <div className="flex-1 px-4 min-w-0">
          <p className="text-sm font-bold text-on-surface truncate">{q.stem}</p>
        </div>
        <div className="w-[200px] px-4 shrink-0">
          <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-lg truncate block whitespace-nowrap overflow-hidden text-ellipsis border border-primary/10">
            {getCategoryName(q.categoryId)}
          </span>
        </div>
        <div className="w-[120px] px-4 shrink-0">
          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-lg border ${
            String(q.difficulty).toLowerCase() === 'easy' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/10' :
            String(q.difficulty).toLowerCase() === 'medium' ? 'bg-amber-500/10 text-amber-500 border-amber-500/10' :
            'bg-error/10 text-error border-error/10'
          }`}>
            {q.difficulty}
          </span>
        </div>
        <div className="w-[150px] px-4 shrink-0">
          <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-lg border ${statusTone(getQuestionStatus(q))}`}>
            {getQuestionStatus(q).replace(/_/g, ' ')}
          </span>
          <p className={`mt-1 text-[10px] font-bold ${isBlueprintReady(q) ? 'text-emerald-600' : 'text-amber-600'}`}>
            {isBlueprintReady(q) ? 'Blueprint ready' : 'Needs tags'}
          </p>
        </div>
        <div className="w-[190px] px-4 text-right shrink-0">
          <div className="flex justify-end gap-2">
            {getQuestionStatus(q) !== 'approved' && (
              <button
                onClick={() => updateQuestionReview(q, 'approve')}
                className="p-1.5 text-on-surface-variant/40 hover:text-emerald-600 hover:bg-emerald-500/10 rounded-lg transition-all"
                title="Approve for live exams"
              >
                <span className="material-symbols-outlined text-[18px]">verified</span>
              </button>
            )}
            {getQuestionStatus(q) !== 'archived' && (
              <button
                onClick={() => updateQuestionReview(q, 'archive')}
                className="p-1.5 text-on-surface-variant/40 hover:text-amber-600 hover:bg-amber-500/10 rounded-lg transition-all"
                title="Archive question"
              >
                <span className="material-symbols-outlined text-[18px]">archive</span>
              </button>
            )}
            <button 
              onClick={() => navigate(getEditPath(q.id))}
              className="p-1.5 text-on-surface-variant/40 hover:text-primary hover:bg-primary/10 rounded-lg transition-all"
            >
              <span className="material-symbols-outlined text-[18px]">edit</span>
            </button>
            <button 
              onClick={() => setDeleteId(q.id)}
              className="p-1.5 text-on-surface-variant/40 hover:text-error hover:bg-error-container/20 rounded-lg transition-all"
            >
              <span className="material-symbols-outlined text-[18px]">delete</span>
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <DashboardLayout title="Question Bank">
      <div className="max-w-6xl mx-auto w-full text-on-surface flex flex-col h-[calc(100vh-64px)] p-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 shrink-0">
          <div>
            <h2 className="text-4xl font-extrabold text-primary font-headline tracking-tight mb-2">Question Bank</h2>
            <p className="text-on-surface-variant/60 font-medium">Manage board exam multiple choice questions.</p>
          </div>
          <button 
            onClick={() => navigate(getEditPath())}
            className="px-6 py-2.5 rounded-xl bg-primary text-on-primary font-bold text-sm flex items-center gap-2 shadow-lg shadow-primary/20"
          >
            <span className="material-symbols-outlined text-[18px]">add</span> Add Question
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5 shrink-0">
          <Metric label="For review" value={statusCounts.for_review || statusCounts.draft || 0} />
          <Metric label="Approved" value={statusCounts.approved || 0} />
          <Metric label="Archived" value={statusCounts.archived || 0} />
          <Metric label="Blueprint ready" value={blueprintReadyCount} />
        </div>

        <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant shadow-sm overflow-hidden flex flex-col flex-1 min-h-0">
          <div className="p-4 border-b border-outline-variant bg-surface-container/30 flex flex-col md:flex-row items-stretch md:items-center gap-3 shrink-0">
             <div className="flex-1 flex items-center gap-3 bg-surface-container-lowest border border-outline-variant rounded-xl px-4 py-2 focus-within:border-primary/20 transition-all">
                <span className="material-symbols-outlined text-on-surface-variant/40">search</span>
                <input 
                   type="text" 
                   placeholder="Search by keyword or stem..." 
                   className="bg-transparent border-none outline-none text-sm w-full font-medium text-on-surface placeholder:text-on-surface-variant/30"
                   value={searchTerm}
                   onChange={(e) => setSearchTerm(e.target.value)}
                />
             </div>
             
             <div className="flex items-center gap-2 bg-surface-container-lowest border border-outline-variant rounded-xl px-4 py-2 min-w-[200px]">
                <span className="material-symbols-outlined text-on-surface-variant/40 text-[20px]">filter_list</span>
                <select 
                   value={selectedCategory}
                   onChange={(e) => setSelectedCategory(e.target.value)}
                   className="bg-transparent border-none outline-none text-xs font-bold uppercase tracking-widest text-primary w-full appearance-none"
                >
                   <option value="all">All Subjects</option>
                   {categories.map(cat => (
                     <option key={cat.id} value={cat.id}>{cat.name}</option>
                   ))}
                </select>
             </div>
             <div className="flex items-center gap-2 bg-surface-container-lowest border border-outline-variant rounded-xl px-4 py-2 min-w-[190px]">
                <span className="material-symbols-outlined text-on-surface-variant/40 text-[20px]">rule</span>
                <select
                   value={selectedStatus}
                   onChange={(e) => setSelectedStatus(e.target.value)}
                   className="bg-transparent border-none outline-none text-xs font-bold uppercase tracking-widest text-primary w-full appearance-none"
                >
                   <option value="all">All Status</option>
                   <option value="for_review">For Review</option>
                   <option value="draft">Draft</option>
                   <option value="approved">Approved</option>
                   <option value="archived">Archived</option>
                </select>
             </div>
          </div>

          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
            {/* Header */}
            <div className="flex items-center bg-surface-container/20 border-b border-outline-variant shrink-0">
              <div className="flex-1 p-4 text-[10px] font-bold text-on-surface-variant/40 uppercase tracking-widest shrink-0">Question Stem</div>
              <div className="w-[200px] p-4 text-[10px] font-bold text-on-surface-variant/40 uppercase tracking-widest shrink-0">Subject</div>
              <div className="w-[120px] p-4 text-[10px] font-bold text-on-surface-variant/40 uppercase tracking-widest shrink-0">Difficulty</div>
              <div className="w-[150px] p-4 text-[10px] font-bold text-on-surface-variant/40 uppercase tracking-widest shrink-0">Review</div>
              <div className="w-[190px] p-4 text-[10px] font-bold text-on-surface-variant/40 uppercase tracking-widest text-right shrink-0">Actions</div>
            </div>

            {/* List */}
            <div className="flex-1">
              {filteredQuestions.length === 0 ? (
                <div className="p-12 text-center text-on-surface-variant/40 italic">No questions found.</div>
              ) : (
                <AutoSizer>
                  {({ height, width }) => (
                    <List
                      height={height}
                      itemCount={filteredQuestions.length}
                      itemSize={72}
                      width={width}
                    >
                      {Row}
                    </List>
                  )}
                </AutoSizer>
              )}
            </div>
          </div>
        </div>
      </div>

      <DeleteConfirmModal 
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={confirmDelete}
        title="Delete Question?"
        message="Are you sure you want to permanently remove this question from the bank? This action cannot be undone."
        isDeleting={isDeleting}
      />

      <Toast 
        isVisible={showToast}
        message={toastMsg}
        onClose={() => setShowToast(false)}
        type={toastMsg.includes('failed') ? 'error' : 'success'}
      />
    </DashboardLayout>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-4 shadow-sm">
      <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/50">{label}</p>
      <p className="mt-1 font-headline text-2xl font-black text-on-surface">{value}</p>
    </div>
  );
}

function statusTone(status: string) {
  if (status === 'approved') return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20';
  if (status === 'archived') return 'bg-surface-container text-on-surface-variant border-outline-variant/40';
  if (status === 'for_review') return 'bg-primary/10 text-primary border-primary/20';
  return 'bg-amber-500/10 text-amber-600 border-amber-500/20';
}
