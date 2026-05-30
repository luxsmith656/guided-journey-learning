export type JourneyResourceType = 'textbook' | 'quiz' | 'exam' | 'activity';

export interface JourneyResource {
  id: string;
  type: JourneyResourceType;
  title: string;
  meta: string;
}

export interface JourneyQuestion {
  id: string;
  stem: string;
  type?: 'multiple_choice' | 'true_false' | 'enumeration' | 'short_answer' | 'essay';
  partId?: string;
  topicId?: string;
  competencyId?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  options: { id: string; text: string }[];
  correctOptionId: string;
  explanation: string;
  acceptedAnswers?: string[];
  expectedAnswer?: string;
  points?: number;
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

export interface JourneyModule {
  id: string;
  title: string;
  description: string;
  subjectId: string;
  topicId: string;
  level: number;
  duration: string;
  status: ModuleLearningState;
  progress: number;
  lessonBlocks: { type: 'heading' | 'text' | 'callout'; content: string }[];
  resources: JourneyResource[];
  flowItems?: { id: string; type: 'textbook' | 'lesson' | 'quiz' | 'activity' | 'exam'; refId: string; title: string }[];
  questions: JourneyQuestion[];
  parts?: JourneyModulePart[];
  finalExam?: JourneyQuestion[];
  examBlueprint?: {
    questionCount: number;
    sectionDistribution: Record<string, number>;
    competencyDistribution: Record<string, number>;
    difficultyMix: Record<'easy' | 'medium' | 'hard', number>;
  };
  competencies?: { id: string; label: string; description?: string }[];
  rubric?: { criterion: string; points: number; description: string }[];
  unlockRules?: { minScorePercent?: number; requireAllParts?: boolean; motivationalQuote?: string };
  templateSourceId?: string;
  certificateEnabled?: boolean;
  certificateTemplateId?: string;
  certificateRequirementNote?: string;
  sourceDocument?: SourceDocumentMeta;
  sourceDocumentId?: string;
  sourceDocumentName?: string;
  sourceConfidence?: 'high' | 'medium' | 'needs_review';
  sourceReviewRequired?: boolean;
  prerequisiteModuleIds?: string[];
  publishScope?: 'public' | 'classes';
  classIds?: string[];
  reviewTrack?: 'elementary' | 'secondary' | 'specialization' | 'all' | string;
  reviewTracks?: string[];
  specialization?: string;
  dueAt?: string;
  antiCheatEnabled?: boolean;
  recordFirstAttemptOnly?: boolean;
  attemptPolicy?: {
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
  };
  authorName?: string;
  authorEmail?: string;
}

export type ModuleLearningState =
  | 'locked'
  | 'available'
  | 'in_progress'
  | 'paused'
  | 'ready_for_final_exam'
  | 'review_required'
  | 'completed'
  | 'mastered';

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

export interface JourneyTopic {
  id: string;
  title: string;
  description: string;
  moduleIds: string[];
  mastery: number;
}

export interface JourneySubject {
  id: string;
  title: string;
  description: string;
  instructor: string;
  levelLabel: string;
  accent: string;
  topics: JourneyTopic[];
}

export const journeyModules: JourneyModule[] = [
  {
    id: 'gened-critical-reading',
    title: 'Reading Comprehension and Evidence',
    description: 'Learn how to identify claims, evidence, and distractors in LET-style passages.',
    subjectId: 'gened',
    topicId: 'gened_english',
    level: 1,
    duration: '35 min',
    status: 'in_progress',
    progress: 55,
    lessonBlocks: [
      { type: 'heading', content: 'Read for the question, then the passage' },
      { type: 'text', content: 'Start by identifying what the item is asking: main idea, inference, vocabulary, tone, or evidence. This keeps your attention on useful details.' },
      { type: 'callout', content: 'LET items often hide a correct answer behind plain wording. Prefer the option supported by the passage over the option that sounds impressive.' },
      { type: 'text', content: 'When two options seem close, locate the exact line or idea that proves one of them. If the passage does not support it, it is not the answer.' },
    ],
    resources: [
      { id: 'book-gened-reading', type: 'textbook', title: 'General Education Reviewer: Communication', meta: 'Chapter 2' },
      { id: 'quiz-gened-reading', type: 'quiz', title: '10-item quick quiz', meta: 'Adaptive' },
      { id: 'exam-gened-reading', type: 'exam', title: 'Communication practice set', meta: '20 items' },
    ],
    questions: [
      {
        id: 'gened-reading-q1',
        stem: 'A student chooses an answer because it repeats words from the passage, but the idea is not supported. What should the student check first?',
        options: [
          { id: 'A', text: 'Whether the wording sounds formal' },
          { id: 'B', text: 'Whether the passage directly supports the idea' },
          { id: 'C', text: 'Whether the answer is the longest option' },
          { id: 'D', text: 'Whether the option uses technical vocabulary' },
        ],
        correctOptionId: 'B',
        explanation: 'Evidence from the passage matters more than matching words or impressive phrasing.',
      },
      {
        id: 'gened-reading-q2',
        stem: 'Which strategy best helps with inference questions?',
        options: [
          { id: 'A', text: 'Ignore details and rely on common knowledge' },
          { id: 'B', text: 'Choose the option with the broadest conclusion' },
          { id: 'C', text: 'Combine stated clues without adding unsupported ideas' },
          { id: 'D', text: 'Pick the option that introduces a new explanation' },
        ],
        correctOptionId: 'C',
        explanation: 'Inference is grounded reasoning from clues, not guessing beyond the text.',
      },
    ],
    parts: [
      {
        id: 'reading-purpose',
        title: 'Part 1: Set the reading purpose',
        objective: 'Identify exactly what a LET passage question is asking before reading.',
        textbookSection: {
          title: 'Communication Foundations: Reading for Purpose',
          estimatedReadMinutes: 8,
          body: 'A passage item becomes easier when the learner first names the task. Main idea questions ask for the controlling thought. Inference questions ask for a supported conclusion. Vocabulary questions ask how a word functions in context. Evidence questions ask which detail proves a claim. Read the question first, then scan the passage for the kind of evidence needed.',
        },
        lessonBlocks: [
          { type: 'heading', content: 'Read the question before the passage' },
          { type: 'text', content: 'Name the task: main idea, inference, vocabulary, tone, or evidence. This narrows your attention and reduces guessing.' },
          { type: 'callout', content: 'A correct answer must be supported by the passage, not just by common sense.' },
        ],
        miniQuiz: [
          {
            id: 'gened-reading-part1-q1',
            stem: 'What should a learner identify first when answering a passage item?',
            options: [
              { id: 'A', text: 'The longest answer' },
              { id: 'B', text: 'The exact task asked by the question' },
              { id: 'C', text: 'The most technical word' },
              { id: 'D', text: 'The final sentence only' },
            ],
            correctOptionId: 'B',
            explanation: 'Knowing the task guides what evidence to look for in the passage.',
          },
        ],
      },
      {
        id: 'evidence-check',
        title: 'Part 2: Check every option against evidence',
        objective: 'Eliminate distractors that sound familiar but are unsupported.',
        textbookSection: {
          title: 'Communication Foundations: Evidence Beats Familiarity',
          estimatedReadMinutes: 10,
          body: 'Distractors often repeat words from the passage while changing the idea. A strong reader asks: Where is this supported? If the passage does not prove the option, the option is unsafe. When two choices feel close, choose the one with direct textual support and reject the one that adds a new or exaggerated claim.',
        },
        lessonBlocks: [
          { type: 'heading', content: 'Evidence beats familiar words' },
          { type: 'text', content: 'Do not choose an option only because it repeats a phrase from the passage. Check whether the idea is actually supported.' },
          { type: 'callout', content: 'The board exam often rewards plain, precise answers over dramatic-sounding answers.' },
        ],
        miniQuiz: [
          {
            id: 'gened-reading-part2-q1',
            stem: 'A student chooses an answer because it repeats words from the passage, but the idea is not supported. What should the student check first?',
            options: [
              { id: 'A', text: 'Whether the wording sounds formal' },
              { id: 'B', text: 'Whether the passage directly supports the idea' },
              { id: 'C', text: 'Whether the answer is the longest option' },
              { id: 'D', text: 'Whether the option uses technical vocabulary' },
            ],
            correctOptionId: 'B',
            explanation: 'Evidence from the passage matters more than matching words or impressive phrasing.',
          },
        ],
        activity: {
          title: 'Distractor Sort',
          prompt: 'Mark each option as supported, exaggerated, unrelated, or too broad before choosing the answer.',
        },
      },
    ],
    finalExam: [
      {
        id: 'gened-reading-final-q1',
        stem: 'Which strategy best helps with inference questions?',
        options: [
          { id: 'A', text: 'Ignore details and rely on common knowledge' },
          { id: 'B', text: 'Choose the option with the broadest conclusion' },
          { id: 'C', text: 'Combine stated clues without adding unsupported ideas' },
          { id: 'D', text: 'Pick the option that introduces a new explanation' },
        ],
        correctOptionId: 'C',
        explanation: 'Inference is grounded reasoning from clues, not guessing beyond the text.',
      },
      {
        id: 'gened-reading-final-q2',
        stem: 'What is the safest reason to reject a distractor?',
        options: [
          { id: 'A', text: 'It is shorter than the others' },
          { id: 'B', text: 'It is not supported by the passage' },
          { id: 'C', text: 'It uses simple language' },
          { id: 'D', text: 'It appears near the end of the list' },
        ],
        correctOptionId: 'B',
        explanation: 'Unsupported claims should be rejected even when they sound familiar.',
      },
      {
        id: 'gened-reading-final-q3',
        type: 'short_answer',
        stem: 'In one sentence, explain why a familiar phrase from the passage is not enough proof that an option is correct.',
        options: [],
        correctOptionId: '',
        acceptedAnswers: ['the idea must be supported', 'passage evidence matters', 'words can repeat but change meaning'],
        expectedAnswer: 'A repeated phrase is not enough because the option must match the supported idea in the passage.',
        explanation: 'The answer should mention support, evidence, or matching the passage idea.',
      },
    ],
  },
  {
    id: 'profed-assessment-alignment',
    title: 'Constructive Alignment in Assessment',
    description: 'Connect learning outcomes, instruction, and assessment so tests measure what was taught.',
    subjectId: 'profed',
    topicId: 'profed_assessment',
    level: 2,
    duration: '45 min',
    status: 'available',
    progress: 0,
    lessonBlocks: [
      { type: 'heading', content: 'Begin with the learning outcome' },
      { type: 'text', content: 'A good assessment starts with the target competency. The activity and test item should ask learners to show the same kind of thinking named in the outcome.' },
      { type: 'callout', content: 'If the outcome says analyze, avoid an item that only asks learners to recall a definition.' },
      { type: 'text', content: 'Alignment improves fairness because students are assessed on practiced skills instead of surprise tasks.' },
    ],
    resources: [
      { id: 'book-profed-assessment', type: 'textbook', title: 'Professional Education Reviewer: Assessment', meta: 'Chapter 5' },
      { id: 'quiz-profed-assessment', type: 'quiz', title: 'Alignment drill', meta: '12 items' },
      { id: 'exam-profed-assessment', type: 'exam', title: 'Prof Ed assessment set', meta: '30 items' },
    ],
    questions: [
      {
        id: 'profed-assessment-q1',
        stem: 'An outcome asks learners to critique teaching strategies. Which assessment is most aligned?',
        options: [
          { id: 'A', text: 'Define teaching strategy' },
          { id: 'B', text: 'List five classroom activities' },
          { id: 'C', text: 'Evaluate a sample lesson and justify improvements' },
          { id: 'D', text: 'Copy the steps of lesson planning' },
        ],
        correctOptionId: 'C',
        explanation: 'Critique requires evaluation and justification, so the assessment should require those actions.',
      },
      {
        id: 'profed-assessment-q2',
        stem: 'Why is constructive alignment important?',
        options: [
          { id: 'A', text: 'It makes tests longer' },
          { id: 'B', text: 'It keeps objectives, activities, and assessments consistent' },
          { id: 'C', text: 'It removes the need for feedback' },
          { id: 'D', text: 'It focuses only on memorization' },
        ],
        correctOptionId: 'B',
        explanation: 'Alignment keeps the learning target, learning work, and evidence of learning connected.',
      },
    ],
    parts: [
      {
        id: 'outcome-match',
        title: 'Part 1: Match assessment to outcomes',
        objective: 'Choose assessment tasks that require the same thinking named in the outcome.',
        textbookSection: {
          title: 'Assessment and Alignment: Outcomes First',
          estimatedReadMinutes: 9,
          body: 'Constructive alignment begins with the learning outcome. If the outcome asks learners to analyze, the assessment must require analysis. If the outcome asks learners to perform, the assessment must include performance evidence. A mismatch makes the assessment unfair because it measures a different skill from the one taught.',
        },
        lessonBlocks: [
          { type: 'heading', content: 'Begin with the learning outcome' },
          { type: 'text', content: 'A good assessment asks learners to show the same kind of thinking named in the objective.' },
          { type: 'callout', content: 'If the outcome says analyze, avoid an item that only asks students to recall a definition.' },
        ],
        miniQuiz: [
          {
            id: 'profed-assessment-part1-q1',
            stem: 'An outcome asks learners to critique teaching strategies. Which assessment is most aligned?',
            options: [
              { id: 'A', text: 'Define teaching strategy' },
              { id: 'B', text: 'List five classroom activities' },
              { id: 'C', text: 'Evaluate a sample lesson and justify improvements' },
              { id: 'D', text: 'Copy the steps of lesson planning' },
            ],
            correctOptionId: 'C',
            explanation: 'Critique requires evaluation and justification, so the assessment should require those actions.',
          },
        ],
      },
      {
        id: 'feedback-loop',
        title: 'Part 2: Use checks as feedback loops',
        objective: 'Separate formative checks from final grading decisions.',
        textbookSection: {
          title: 'Assessment and Alignment: Formative Evidence',
          estimatedReadMinutes: 7,
          body: 'Formative assessment happens during learning. It helps the teacher adjust instruction and helps learners see what to improve. Summative assessment happens after instruction and supports a judgment about achievement. A module should include small checks before the final exam so learners can recover before the gate.',
        },
        lessonBlocks: [
          { type: 'heading', content: 'Mini checks should teach, not only score' },
          { type: 'text', content: 'A mini quiz gives immediate feedback. It should reveal misconceptions before the learner reaches the final assessment.' },
        ],
        miniQuiz: [
          {
            id: 'profed-assessment-part2-q1',
            stem: 'Which of the following is a formative assessment technique?',
            options: [
              { id: 'A', text: 'Final exam' },
              { id: 'B', text: 'Midterm paper' },
              { id: 'C', text: 'Exit ticket' },
              { id: 'D', text: 'Standardized test' },
            ],
            correctOptionId: 'C',
            explanation: 'Exit tickets check understanding during learning and help adjust instruction.',
          },
        ],
      },
    ],
    finalExam: [
      {
        id: 'profed-assessment-final-q1',
        stem: 'Why is constructive alignment important?',
        options: [
          { id: 'A', text: 'It makes tests longer' },
          { id: 'B', text: 'It keeps objectives, activities, and assessments consistent' },
          { id: 'C', text: 'It removes the need for feedback' },
          { id: 'D', text: 'It focuses only on memorization' },
        ],
        correctOptionId: 'B',
        explanation: 'Alignment keeps the learning target, learning work, and evidence of learning connected.',
      },
      {
        id: 'profed-assessment-final-q2',
        type: 'enumeration',
        stem: 'Enumerate the three elements that must align in constructive alignment.',
        options: [],
        correctOptionId: '',
        acceptedAnswers: ['objectives', 'learning activities', 'assessment', 'outcomes', 'instruction'],
        expectedAnswer: 'Learning outcomes or objectives, teaching-learning activities or instruction, and assessment tasks.',
        explanation: 'The three aligned elements are outcomes/objectives, instruction/activities, and assessment.',
      },
    ],
  },
  {
    id: 'major-math-problem-solving',
    title: 'Problem Solving with Ratios and Proportion',
    description: 'Practice translating word problems into proportional relationships.',
    subjectId: 'major',
    topicId: 'major_math',
    level: 3,
    duration: '50 min',
    status: 'locked',
    progress: 0,
    lessonBlocks: [
      { type: 'heading', content: 'Name the quantities before solving' },
      { type: 'text', content: 'Most ratio problems become easier when you label what each number represents. Build the proportion only after the relationship is clear.' },
      { type: 'callout', content: 'Check the unit. A correct-looking equation can still answer the wrong quantity.' },
      { type: 'text', content: 'Use estimation before computing to catch answers that are too large or too small.' },
    ],
    resources: [
      { id: 'book-major-math', type: 'textbook', title: 'Mathematics Major Reviewer: Number Sense', meta: 'Chapter 1' },
      { id: 'quiz-major-math', type: 'quiz', title: 'Ratio warm-up', meta: '15 items' },
      { id: 'exam-major-math', type: 'exam', title: 'Major practice set', meta: '25 items' },
    ],
    questions: [
      {
        id: 'major-math-q1',
        stem: 'If 3 notebooks cost 90 pesos, what is the cost of 5 notebooks at the same rate?',
        options: [
          { id: 'A', text: '120 pesos' },
          { id: 'B', text: '150 pesos' },
          { id: 'C', text: '180 pesos' },
          { id: 'D', text: '210 pesos' },
        ],
        correctOptionId: 'B',
        explanation: 'Each notebook costs 30 pesos, so 5 notebooks cost 150 pesos.',
      },
      {
        id: 'major-math-q2',
        stem: 'A proportion is most useful when two quantities have what kind of relationship?',
        options: [
          { id: 'A', text: 'A constant multiplicative relationship' },
          { id: 'B', text: 'No relationship' },
          { id: 'C', text: 'Only an alphabetical relationship' },
          { id: 'D', text: 'A random relationship' },
        ],
        correctOptionId: 'A',
        explanation: 'Proportions compare equal ratios, which means the relationship scales consistently.',
      },
    ],
    parts: [
      {
        id: 'label-quantities',
        title: 'Part 1: Label the quantities',
        objective: 'Translate word problems into known and unknown quantities before solving.',
        textbookSection: {
          title: 'Number Sense: Ratios in Context',
          estimatedReadMinutes: 8,
          body: 'Ratio problems compare quantities. Before writing a proportion, name each quantity and its unit. This avoids solving for the wrong value. Estimation is also useful: before calculating, predict whether the answer should be larger or smaller than the given value.',
        },
        lessonBlocks: [
          { type: 'heading', content: 'Name the quantities before solving' },
          { type: 'text', content: 'Label what each number represents. Then build the proportion from matching units.' },
        ],
        miniQuiz: [
          {
            id: 'major-math-part1-q1',
            stem: 'If 3 notebooks cost 90 pesos, what is the cost of 5 notebooks at the same rate?',
            options: [
              { id: 'A', text: '120 pesos' },
              { id: 'B', text: '150 pesos' },
              { id: 'C', text: '180 pesos' },
              { id: 'D', text: '210 pesos' },
            ],
            correctOptionId: 'B',
            explanation: 'Each notebook costs 30 pesos, so 5 notebooks cost 150 pesos.',
          },
        ],
      },
    ],
    finalExam: [
      {
        id: 'major-math-final-q1',
        stem: 'A proportion is most useful when two quantities have what kind of relationship?',
        options: [
          { id: 'A', text: 'A constant multiplicative relationship' },
          { id: 'B', text: 'No relationship' },
          { id: 'C', text: 'Only an alphabetical relationship' },
          { id: 'D', text: 'A random relationship' },
        ],
        correctOptionId: 'A',
        explanation: 'Proportions compare equal ratios, which means the relationship scales consistently.',
      },
      {
        id: 'major-math-final-q2',
        type: 'true_false',
        stem: 'True or False: A correct-looking proportion can still answer the wrong quantity if the units were mislabeled.',
        options: [
          { id: 'A', text: 'True' },
          { id: 'B', text: 'False' },
        ],
        correctOptionId: 'A',
        explanation: 'Unit labels matter because they tell you what quantity the answer represents.',
      },
    ],
  },
];

export const journeySubjects: JourneySubject[] = [
  {
    id: 'gened',
    title: 'General Education',
    description: 'Core communication, science, Filipino, social science, and reasoning skills.',
    instructor: 'Dr. Santos',
    levelLabel: 'LET Core',
    accent: 'bg-blue-500',
    topics: [
      {
        id: 'gened_english',
        title: 'Communication and Critical Reading',
        description: 'Passages, inference, vocabulary, grammar, and evidence-based answers.',
        moduleIds: ['gened-critical-reading'],
        mastery: 58,
      },
      {
        id: 'gened_science',
        title: 'Science, Technology, and Society',
        description: 'Scientific literacy, health, environment, and practical applications.',
        moduleIds: [],
        mastery: 34,
      },
      {
        id: 'gened_socsci',
        title: 'Social Science and Values',
        description: 'History, governance, culture, ethics, and citizenship.',
        moduleIds: [],
        mastery: 42,
      },
    ],
  },
  {
    id: 'profed',
    title: 'Professional Education',
    description: 'Teaching principles, assessment, curriculum, classroom management, and child development.',
    instructor: 'Prof. Reyes',
    levelLabel: 'Teaching Practice',
    accent: 'bg-emerald-500',
    topics: [
      {
        id: 'profed_assessment',
        title: 'Assessment of Learning',
        description: 'Test construction, feedback, rubrics, validity, reliability, and grading.',
        moduleIds: ['profed-assessment-alignment'],
        mastery: 46,
      },
      {
        id: 'profed_childdev',
        title: 'Learner Development',
        description: 'Cognitive, social, emotional, and moral development across ages.',
        moduleIds: [],
        mastery: 51,
      },
      {
        id: 'profed_curriculum',
        title: 'Curriculum and Instruction',
        description: 'Curriculum models, lesson design, strategies, and learning resources.',
        moduleIds: [],
        mastery: 29,
      },
    ],
  },
  {
    id: 'major',
    title: 'Major in Mathematics',
    description: 'Number sense, algebra, geometry, statistics, and mathematical teaching practice.',
    instructor: 'Ms. Dela Cruz',
    levelLabel: 'Specialization',
    accent: 'bg-amber-500',
    topics: [
      {
        id: 'major_math',
        title: 'Number Sense and Problem Solving',
        description: 'Ratios, proportions, operations, estimation, and word problem translation.',
        moduleIds: ['major-math-problem-solving'],
        mastery: 18,
      },
      {
        id: 'algebra',
        title: 'Algebraic Thinking',
        description: 'Equations, inequalities, functions, patterns, and representations.',
        moduleIds: [],
        mastery: 24,
      },
      {
        id: 'statistics',
        title: 'Statistics and Probability',
        description: 'Data interpretation, measures, probability, and classroom applications.',
        moduleIds: [],
        mastery: 31,
      },
    ],
  },
];

export function getSubjectModules(subjectId: string, source: JourneyModule[] = journeyModules) {
  return source.filter((module) => module.subjectId === subjectId || (module as any).categoryId === subjectId);
}

export function getTopicModules(topicId: string, source: JourneyModule[] = journeyModules) {
  return source.filter((module) => module.topicId === topicId);
}

export function findJourneyModule(moduleId?: string | null) {
  if (!moduleId) return journeyModules[0];
  return journeyModules.find((module) => module.id === moduleId) || journeyModules[0];
}

export function getModuleParts(module: JourneyModule): JourneyModulePart[] {
  if (module.parts?.length) return module.parts;

  return [
    {
      id: 'part-1',
      title: 'Part 1: Learn the core idea',
      objective: module.description,
      textbookSection: {
        title: `${module.title} textbook reading`,
        body: module.lessonBlocks.map((block) => block.content).join('\n\n'),
        estimatedReadMinutes: 8,
      },
      lessonBlocks: module.lessonBlocks,
      miniQuiz: module.questions.slice(0, 1),
    },
  ];
}

export function getModuleFinalExam(module: JourneyModule): JourneyQuestion[] {
  if (module.finalExam?.length) return module.finalExam;
  return module.questions.slice(1).length ? module.questions.slice(1) : module.questions;
}
