export const CATEGORIES = [
  { id: 'gened', name: 'General Education', description: 'Core subjects including English, Math, Science, and Social Sciences.' },
  { id: 'profed', name: 'Professional Education', description: 'Teaching profession, child development, and pedagogy.' },
  { id: 'major', name: 'Major / Specialization', description: 'Specialized content.' }
];

export const TOPICS = [
  { id: 'gened_english', categoryId: 'gened', name: 'English Communication', isPublished: true },
  { id: 'gened_math', categoryId: 'gened', name: 'Mathematics', isPublished: true },
  { id: 'gened_science', categoryId: 'gened', name: 'Science', isPublished: true },
  { id: 'gened_socsci', categoryId: 'gened', name: 'Social Science', isPublished: true },
  { id: 'profed_assessment', categoryId: 'profed', name: 'Assessment of Learning', isPublished: true },
  { id: 'profed_principles', categoryId: 'profed', name: 'Principles of Teaching', isPublished: true },
  { id: 'profed_childdev', categoryId: 'profed', name: 'Child and Adolescent Development', isPublished: true },
  { id: 'profed_curriculum', categoryId: 'profed', name: 'Curriculum Development', isPublished: true },
  { id: 'major_math', categoryId: 'major', name: 'Mathematics: Number Sense and Problem Solving', isPublished: true }
];

export const SKILLS = [
  { id: 'profed_assessment_summative', topicId: 'profed_assessment', name: 'Summative Assessment' },
  { id: 'profed_assessment_formative', topicId: 'profed_assessment', name: 'Formative Assessment' },
  { id: 'gened_math_algebra', topicId: 'gened_math', name: 'Algebra' },
  { id: 'gened_english_grammar', topicId: 'gened_english', name: 'Grammar' },
  { id: 'gened_english_inference', topicId: 'gened_english', name: 'Inference and Evidence' },
  { id: 'major_math_ratio', topicId: 'major_math', name: 'Ratios and Proportion' }
];

export const TEXTBOOKS = [
  {
    id: 'book_gened_communication_foundations',
    title: 'General Education Reviewer: Communication Foundations',
    author: 'Let Mastery Editorial Team',
    categoryId: 'gened',
    topicId: 'gened_english',
    description: 'Evidence-based reading, grammar traps, vocabulary, and LET-style passage strategies.',
    pages: 86,
    readTime: '2h 10m',
    level: 'Core',
    chapter: 'Chapter 2',
    isPublished: true,
    offlineReady: true
  },
  {
    id: 'book_profed_assessment_alignment',
    title: 'Professional Education Reviewer: Assessment and Alignment',
    author: 'Prof. Reyes',
    categoryId: 'profed',
    topicId: 'profed_assessment',
    description: 'Formative assessment, constructive alignment, rubrics, validity, reliability, and feedback.',
    pages: 112,
    readTime: '3h',
    level: 'Teaching Practice',
    chapter: 'Chapter 5',
    isPublished: true,
    offlineReady: true
  },
  {
    id: 'book_profed_child_development',
    title: 'Child and Adolescent Development Quick Textbook',
    author: 'Dr. Jane Teacher',
    categoryId: 'profed',
    topicId: 'profed_childdev',
    description: 'Piaget, Erikson, Vygotsky, motivation, individual differences, and learner-centered decisions.',
    pages: 74,
    readTime: '1h 45m',
    level: 'Teaching Practice',
    chapter: 'Chapter 3',
    isPublished: true,
    offlineReady: true
  },
  {
    id: 'book_major_math_number_sense',
    title: 'Mathematics Major Reviewer: Number Sense',
    author: 'Ms. Dela Cruz',
    categoryId: 'major',
    topicId: 'major_math',
    description: 'Ratios, proportion, estimation, operations, and translating word problems into equations.',
    pages: 98,
    readTime: '2h 30m',
    level: 'Specialization',
    chapter: 'Chapter 1',
    isPublished: true,
    offlineReady: true
  }
];

export const INITIAL_QUESTIONS = [
  // --- DIAGNOSTIC (General Education) ---
  {
    stem: "Which philosophy of education strongly emphasizes the back-to-basics curriculum?",
    options: [{id: 'A', text: 'Essentialism'}, {id: 'B', text: 'Progressivism'}, {id: 'C', text: 'Existentialism'}, {id: 'D', text: 'Perennialism'}],
    correctOptionId: 'A',
    explanation: 'Essentialism focuses on core skills and academic knowledge that all students should possess.',
    categoryId: 'gened',
    categoryName: 'General Education',
    topicId: 'gened_socsci',
    skillIds: [],
    difficulty: 'easy',
    type: 'diagnostic',
    isPublished: true,
    approved: true
  },
  {
    stem: "The smallest prime number is ________.",
    options: [{id: 'A', text: '0'}, {id: 'B', text: '1'}, {id: 'C', text: '2'}, {id: 'D', text: '3'}],
    correctOptionId: 'C',
    explanation: '2 is the only even prime number and the smallest prime number.',
    categoryId: 'gened',
    categoryName: 'General Education',
    topicId: 'gened_math',
    skillIds: [],
    difficulty: 'easy',
    type: 'diagnostic',
    isPublished: true,
    approved: true
  },
  {
    stem: "Who was the Filipino hero known as the 'Sublime Paralytic'?",
    options: [{id: 'A', text: 'Jose Rizal'}, {id: 'B', text: 'Andres Bonifacio'}, {id: 'C', text: 'Apolinario Mabini'}, {id: 'D', text: 'Emilio Aguinaldo'}],
    correctOptionId: 'C',
    explanation: 'Apolinario Mabini was a key revolutionary leader despite his physical disability.',
    categoryId: 'gened',
    categoryName: 'General Education',
    topicId: 'gened_socsci',
    skillIds: [],
    difficulty: 'easy',
    type: 'diagnostic',
    isPublished: true,
    approved: true
  },
  {
    stem: "In the sentence 'She is a shining star', what figure of speech is used?",
    options: [{id: 'A', text: 'Simile'}, {id: 'B', text: 'Metaphor'}, {id: 'C', text: 'Hyperbole'}, {id: 'D', text: 'Oxymoron'}],
    correctOptionId: 'B',
    explanation: 'A metaphor makes a direct comparison without using \"like\" or \"as\".',
    categoryId: 'gened',
    categoryName: 'General Education',
    topicId: 'gened_english',
    skillIds: ['gened_english_grammar'],
    difficulty: 'easy',
    type: 'diagnostic',
    isPublished: true,
    approved: true
  },
  // --- DIAGNOSTIC (Professional Education) ---
  {
    stem: "According to Piaget, in which stage do children begin to think logically about concrete events?",
    options: [{id: 'A', text: 'Sensorimotor'}, {id: 'B', text: 'Pre-operational'}, {id: 'C', text: 'Concrete Operational'}, {id: 'D', text: 'Formal Operational'}],
    correctOptionId: 'C',
    explanation: 'The Concrete Operational stage (7-11 years) is characterized by logical thinking about tangible items.',
    categoryId: 'profed',
    categoryName: 'Professional Education',
    topicId: 'profed_childdev',
    skillIds: [],
    difficulty: 'medium',
    type: 'diagnostic',
    isPublished: true,
    approved: true
  },
  {
    stem: "What is the primary psychosocial crisis of adolescence according to Erikson?",
    options: [{id: 'A', text: 'Trust vs. Mistrust'}, {id: 'B', text: 'Identity vs. Role Confusion'}, {id: 'C', text: 'Intimacy vs. Isolation'}, {id: 'D', text: 'Industry vs. Inferiority'}],
    correctOptionId: 'B',
    explanation: 'Adolescents struggle with developing a sense of self and personal identity.',
    categoryId: 'profed',
    categoryName: 'Professional Education',
    topicId: 'profed_childdev',
    skillIds: [],
    difficulty: 'medium',
    type: 'diagnostic',
    isPublished: true,
    approved: true
  },
  {
    stem: "Which of the following is an example of an extrinsic motivation?",
    options: [{id: 'A', text: 'Learning for the joy of it'}, {id: 'B', text: 'Studying to get a high grade'}, {id: 'C', text: 'Reading a book out of curiosity'}, {id: 'D', text: 'Solving puzzles for fun'}],
    correctOptionId: 'B',
    explanation: 'Extrinsic motivation comes from outside rewards rather than internal satisfaction.',
    categoryId: 'profed',
    categoryName: 'Professional Education',
    topicId: 'profed_principles',
    skillIds: [],
    difficulty: 'easy',
    type: 'diagnostic',
    isPublished: true,
    approved: true
  },
  {
    stem: "What type of assessment is given before instruction to determine students' entry knowledge?",
    options: [{id: 'A', text: 'Formative'}, {id: 'B', text: 'Summative'}, {id: 'C', text: 'Diagnostic'}, {id: 'D', text: 'Placement'}],
    correctOptionId: 'C',
    explanation: 'Diagnostic assessments identify strengths and weaknesses before teaching starts.',
    categoryId: 'profed',
    categoryName: 'Professional Education',
    topicId: 'profed_assessment',
    skillIds: [],
    difficulty: 'easy',
    type: 'diagnostic',
    isPublished: true,
    approved: true
  },
  {
    stem: "Which of the following is a formative assessment technique?",
    options: [{id: 'A', text: 'Final exam'}, {id: 'B', text: 'Midterm paper'}, {id: 'C', text: 'Exit ticket'}, {id: 'D', text: 'Standardized test'}],
    correctOptionId: 'C',
    explanation: 'Exit tickets are used to check understanding during the lesson to inform instruction.',
    categoryId: 'profed',
    categoryName: 'Professional Education',
    topicId: 'profed_assessment',
    skillIds: ['profed_assessment_formative'],
    difficulty: 'easy',
    type: 'diagnostic',
    isPublished: true,
    approved: true
  },
  // --- PRACTICE ---
  {
    stem: "A word that has the same or nearly the same meaning as another word is called a ________.",
    options: [{id: 'A', text: 'Antonym'}, {id: 'B', text: 'Synonym'}, {id: 'C', text: 'Homonym'}, {id: 'D', text: 'Acronym'}],
    correctOptionId: 'B',
    explanation: 'Synonyms are words with similar meanings.',
    categoryId: 'gened',
    categoryName: 'General Education',
    topicId: 'gened_english',
    skillIds: ['gened_english_grammar'],
    difficulty: 'easy',
    type: 'practice',
    isPublished: true,
    approved: true
  },
  {
    stem: "In Bloom's Taxonomy, which level involves the ability to break down information into its component parts?",
    options: [{id: 'A', text: 'Knowledge'}, {id: 'B', text: 'Application'}, {id: 'C', text: 'Analysis'}, {id: 'D', text: 'Synthesis'}],
    correctOptionId: 'C',
    explanation: 'Analysis involves breaking down complex info into manageable parts.',
    categoryId: 'profed',
    categoryName: 'Professional Education',
    topicId: 'profed_principles',
    skillIds: [],
    difficulty: 'medium',
    type: 'practice',
    isPublished: true,
    approved: true
  },
  // --- MOCK EXAM ---
  {
    stem: "Which of the following is the ultimate goal of the K-12 Curriculum in the Philippines?",
    options: [{id: 'A', text: 'Global competitiveness'}, {id: 'B', text: 'Holistic development'}, {id: 'C', text: 'College readiness'}, {id: 'D', text: 'Employment'}],
    correctOptionId: 'B',
    explanation: 'The K-12 program aims to produce holistically developed Filpinos with 21st-century skills.',
    categoryId: 'profed',
    categoryName: 'Professional Education',
    topicId: 'profed_curriculum',
    skillIds: [],
    difficulty: 'hard',
    type: 'mock_exam',
    isPublished: true,
    approved: true
  },
  {
    stem: "In a frequency distribution, what is the score that occurs most frequently?",
    options: [{id: 'A', text: 'Mean'}, {id: 'B', text: 'Median'}, {id: 'C', text: 'Mode'}, {id: 'D', text: 'Range'}],
    correctOptionId: 'C',
    explanation: 'The mode is the value that appears most often in a data set.',
    categoryId: 'profed',
    categoryName: 'Professional Education',
    topicId: 'profed_assessment',
    skillIds: ['profed_assessment_summative'],
    difficulty: 'easy',
    type: 'mock_exam',
    isPublished: true,
    approved: true
  },
  {
    stem: "Which of the following is a direct tax?",
    options: [{id: 'A', text: 'Value Added Tax'}, {id: 'B', text: 'Excise Tax'}, {id: 'C', text: 'Income Tax'}, {id: 'D', text: 'Customs Duty'}],
    correctOptionId: 'C',
    explanation: 'Income tax is paid directly by an individual to the government.',
    categoryId: 'gened',
    categoryName: 'General Education',
    topicId: 'gened_socsci',
    skillIds: [],
    difficulty: 'medium',
    type: 'mock_exam',
    isPublished: true,
    approved: true
  },
  {
    stem: "The fundamental law of the land in the Philippines is the ________.",
    options: [{id: 'A', text: 'Civil Code'}, {id: 'B', text: 'Constitution'}, {id: 'C', text: 'Penal Code'}, {id: 'D', text: 'Family Code'}],
    correctOptionId: 'B',
    explanation: 'The Constitution is the supreme law of the Philippines.',
    categoryId: 'gened',
    categoryName: 'General Education',
    topicId: 'gened_socsci',
    skillIds: [],
    difficulty: 'easy',
    type: 'mock_exam',
    isPublished: true,
    approved: true
  }
];
