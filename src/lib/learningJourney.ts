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
  options: { id: string; text: string }[];
  correctOptionId: string;
  explanation: string;
}

export interface JourneyModule {
  id: string;
  title: string;
  description: string;
  subjectId: string;
  topicId: string;
  level: number;
  duration: string;
  status: 'locked' | 'available' | 'in_progress' | 'completed';
  progress: number;
  lessonBlocks: { type: 'heading' | 'text' | 'callout'; content: string }[];
  resources: JourneyResource[];
  questions: JourneyQuestion[];
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
