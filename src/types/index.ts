export type Role = 'student' | 'instructor' | 'admin';
export type LearningMode = 'class_based' | 'self_review';
export type QuestionDifficulty = 'easy' | 'medium' | 'hard';
export type QuestionKind = 'multiple_choice' | 'true_false' | 'enumeration' | 'short_answer' | 'essay';
export type ModuleLearningState =
  | 'locked'
  | 'available'
  | 'in_progress'
  | 'paused'
  | 'ready_for_final_exam'
  | 'review_required'
  | 'completed'
  | 'mastered';

export interface UserProfile {
  uid: string;
  email: string;
  role: Role;
  fullName: string;
  age?: number;
  onboarded: boolean;
  learningMode?: LearningMode;
  activeClassId?: string;
  instructorId?: string;
  selectedFocus?: string;
  diagnosticCompleted: boolean;
  streak: number;
  lastLoginDate: string;
  earnedBadges: string[];
  xp: number;
  level: number;
  archivedModuleIds?: string[];
  archivedClassIds?: string[];
  createdAt: any;
  updatedAt: any;
}

export interface MasteryRecord {
  [key: string]: number;
}

export interface LearnerProfile {
  userId: string;
  learningMode: LearningMode;
  activeClassId?: string;
  selectedFocus?: string;
  currentLevel: number;
  masteryBySkill: MasteryRecord;
  masteryByTopic: MasteryRecord;
  masteryByCategory: MasteryRecord;
  masteryFreshnessByTopic?: Record<string, {
    lastReviewedAt?: any;
    lastMasteredAt?: any;
    decayedMastery?: number;
    recallDueAt?: string;
  }>;
  weakSkills: string[];
  strongSkills: string[];
  weakTopics: string[];
  strongTopics: string[];
  recommendedModuleIds: string[];
  nextRecommendedModuleId?: string;
  diagnosticAttemptId?: string;
  streak: number;
  badges: string[];
  lastUnlockedModuleId?: string;
  lastUpdatedAt: any;
}

export interface JourneyQuestion {
  id: string;
  stem: string;
  type: QuestionKind;
  partId?: string;
  topicId?: string;
  competencyId?: string;
  difficulty?: QuestionDifficulty;
  options: { id: string; text: string }[];
  correctOptionId: string;
  explanation: string;
  acceptedAnswers?: string[];
  expectedAnswer?: string;
  points?: number;
}

export interface SourceDocumentChunk {
  id: string;
  sourcePage?: number;
  sourceSlide?: number;
  sourcePart?: string;
  text: string;
  sourceTextSnippet: string;
}

export interface SourceDocumentMeta {
  sourceDocumentId: string;
  fileName: string;
  fileType?: string;
  confidence: 'high' | 'medium' | 'needs_review';
  reviewRequired: boolean;
  warnings?: string[];
  wordCount?: number;
  chunks?: SourceDocumentChunk[];
}

export interface JourneyModulePart {
  id: string;
  title: string;
  objective: string;
  textbookSection: {
    id?: string;
    title: string;
    body: string;
    estimatedReadMinutes: number;
    mediaUrl?: string;
    sourceDocumentId?: string;
    sourcePage?: number;
    sourceSlide?: number;
    sourceTextSnippet?: string;
    aiConfidence?: 'high' | 'medium' | 'needs_review';
  };
  lessonBlocks: { type: 'heading' | 'text' | 'callout'; content: string }[];
  miniQuiz: JourneyQuestion[];
  activity?: {
    title: string;
    prompt: string;
  };
}

export interface AttemptPolicy {
  maxAttempts: number;
  scoreMode: 'first' | 'highest' | 'latest';
  showAnswersAfterSubmit: boolean;
  answerRevealMode?: 'immediate' | 'after_deadline' | 'never';
  timeLimitMinutes: number;
  randomizeQuestions: boolean;
  randomizeChoices?: boolean;
  questionPoolSize?: number;
  attemptLogs?: boolean;
  integrityLevel?: 'open_practice' | 'light_protection' | 'standard_protection' | 'strict_exam_mode' | 'basic' | 'advanced';
}

export interface ExamBlueprint {
  questionCount: number;
  sectionDistribution: Record<string, number>;
  competencyDistribution: Record<string, number>;
  difficultyMix: Record<QuestionDifficulty, number>;
}

export interface Module {
  id: string;
  title: string;
  description: string;
  subjectId: string;
  categoryId?: string;
  topicId: string;
  skillIds?: string[];
  level: number;
  duration: string;
  isPublished: boolean;
  publishScope?: 'public' | 'classes';
  classIds?: string[];
  dueAt?: string;
  parts: JourneyModulePart[];
  finalExam: JourneyQuestion[];
  flowItems: { id: string; type: 'textbook' | 'lesson' | 'quiz' | 'activity' | 'exam'; refId: string; title: string }[];
  competencies: { id: string; label: string; description?: string }[];
  rubric: { criterion: string; points: number; description: string }[];
  unlockRules: { minScorePercent: number; requireAllParts: boolean; motivationalQuote?: string };
  attemptPolicy: AttemptPolicy;
  examBlueprint: ExamBlueprint;
  prerequisiteModuleIds: string[];
  certificateEnabled?: boolean;
  certificateTemplateId?: string;
  certificateRequirementNote?: string;
  sourceDocument?: SourceDocumentMeta;
  sourceDocumentId?: string;
  sourceDocumentName?: string;
  sourceConfidence?: 'high' | 'medium' | 'needs_review';
  sourceReviewRequired?: boolean;
  authorId?: string;
  authorName?: string;
  authorEmail?: string;
  createdAt: any;
  updatedAt: any;
}

export interface AnswerRecord {
  questionId: string;
  selectedOptionId?: string;
  writtenAnswer?: string;
  correctOptionId?: string;
  isCorrect: boolean;
  categoryId?: string;
  topicId?: string;
  skillIds?: string[];
  timeSpentSeconds: number;
}

export interface Attempt {
  id: string;
  userId: string;
  type: 'diagnostic' | 'quiz' | 'mock_exam' | 'module_check' | 'module_final';
  mode: LearningMode;
  classId?: string;
  moduleId?: string;
  scorePercent: number;
  totalQuestions: number;
  correctCount: number;
  answers: AnswerRecord[];
  completedAt: any;
}

export interface ModuleProgress {
  userId: string;
  moduleId: string;
  status: ModuleLearningState;
  moduleState: ModuleLearningState;
  currentPartIndex: number;
  phase?: 'intro' | 'read' | 'lesson' | 'miniQuiz' | 'activity' | 'finalExam' | 'complete';
  progressPercent: number;
  partScores: Record<string, number>;
  finalScore?: number | null;
  firstFinalScore?: number | null;
  latestFinalScore?: number | null;
  finalAttemptCount?: number;
  failedAttempts?: number;
  weakPartIds?: string[];
  proctorWarnings?: number;
  timeSpentSeconds?: number;
  unlockedByModuleId?: string;
  lastAccessedAt: any;
  completedAt?: any;
}
