import { collection, doc, setDoc, serverTimestamp, getDocs, query, where } from 'firebase/firestore';
import { db } from './firebase';
import {
  CATEGORIES as SEED_CATEGORIES,
  TOPICS as SEED_TOPICS,
  SKILLS as SEED_SKILLS,
  INITIAL_QUESTIONS as SEED_QUESTIONS,
  TEXTBOOKS as SEED_TEXTBOOKS,
} from './seedData';
import { handleFirestoreError, OperationType } from './firestoreUtils';

// Simple hash function for stable IDs
function generateStableId(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return 'q_' + Math.abs(hash).toString(36);
}

export async function seedDatabase() {
  console.log('Starting standardized database seed...');
  
  try {
    // 1. Seed Categories
    for (const cat of SEED_CATEGORIES) {
      try {
        await setDoc(doc(db, 'categories', cat.id), { 
          ...cat, 
          title: cat.name,
          isPublished: true,
          questionCount: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        }, { merge: true });
        console.log(`Seeded category: ${cat.name}`);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `categories/${cat.id}`);
      }
    }

    // 2. Seed Topics
    for (const topic of SEED_TOPICS) {
       try {
         await setDoc(doc(db, 'topics', topic.id), { 
           ...topic,
           title: topic.name,
           isPublished: topic.isPublished ?? true,
           createdAt: serverTimestamp(),
           updatedAt: serverTimestamp()
         }, { merge: true });
         console.log(`Seeded topic: ${topic.name}`);
       } catch (err) {
         handleFirestoreError(err, OperationType.WRITE, `topics/${topic.id}`);
       }
    }

    // 3. Seed Skills
    for (const skill of SEED_SKILLS) {
       try {
         await setDoc(doc(db, 'skills', skill.id), { 
           ...skill,
           title: skill.name,
           isPublished: true,
           createdAt: serverTimestamp(),
           updatedAt: serverTimestamp()
         }, { merge: true });
         console.log(`Seeded skill: ${skill.name}`);
       } catch (err) {
         handleFirestoreError(err, OperationType.WRITE, `skills/${skill.id}`);
       }
    }

    // 4. Seed Questions with Stable IDs
    for (const quest of SEED_QUESTIONS) {
        try {
          const stableId = generateStableId(quest.stem);
          const wrongChoiceExplanations = Object.fromEntries((quest.options || [])
            .filter((option: any) => option.id !== quest.correctOptionId)
            .map((option: any) => [option.id, `${option.text} is a distractor. Review the rationalization before approving this item for high-stakes exams.`]));
          await setDoc(doc(db, 'questions', stableId), {
            ...quest,
            id: stableId,
            version: 1,
            aiGenerated: false,
            status: 'approved',
            approvalStatus: 'approved',
            approved: true,
            isPublished: true,
            examType: quest.type,
            familyId: `${stableId}_family`,
            wrongChoiceExplanations,
            sourceNote: 'Seeded public LET reviewer question',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            createdBy: 'system-seed'
          }, { merge: true });
          console.log(`Seeded question (${stableId}): ${quest.stem.substring(0, 30)}...`);
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, 'questions');
        }
    }

    // 5. Seed Textbooks
    for (const textbook of SEED_TEXTBOOKS) {
      try {
        await setDoc(doc(db, 'textbooks', textbook.id), {
          ...textbook,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          createdBy: 'system-seed'
        }, { merge: true });
        console.log(`Seeded textbook: ${textbook.title}`);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `textbooks/${textbook.id}`);
      }
    }

    const questionIdByStem = SEED_QUESTIONS.reduce<Record<string, string>>((acc, question) => {
      acc[question.stem] = generateStableId(question.stem);
      return acc;
    }, {});
    const questionById = SEED_QUESTIONS.reduce<Record<string, any>>((acc, question) => {
      const id = generateStableId(question.stem);
      acc[id] = { ...question, id };
      return acc;
    }, {});

    // 6. Seed Starter Modules
    const starterModules = [
      {
        id: 'gened-critical-reading',
        title: 'Reading Comprehension and Evidence',
        description: 'Learn how to identify claims, evidence, and distractors in LET-style passages.',
        subjectId: 'gened',
        categoryId: 'gened',
        topicId: 'gened_english',
        skillIds: ['gened_english_inference', 'gened_english_grammar'],
        level: 1,
        duration: '35 min',
        lessonBlocks: [
          { type: 'heading', content: 'Read for the question, then the passage' },
          { type: 'text', content: 'Start by identifying what the item is asking: main idea, inference, vocabulary, tone, or evidence. This keeps your attention on useful details.' },
          { type: 'callout', content: 'LET items often hide a correct answer behind plain wording. Prefer the option supported by the passage over the option that sounds impressive.' }
        ],
        textbookIds: ['book_gened_communication_foundations'],
        checkQuestionIds: [
          questionIdByStem["In the sentence 'She is a shining star', what figure of speech is used?"]
        ],
        challengeQuestionIds: [
          questionIdByStem['A word that has the same or nearly the same meaning as another word is called a ________.']
        ],
        resources: [
          { type: 'textbook', title: 'General Education Reviewer: Communication Foundations', meta: 'Chapter 2', targetId: 'book_gened_communication_foundations' },
          { type: 'quiz', title: '10-item quick quiz', meta: 'Adaptive' },
          { type: 'exam', title: 'Communication practice set', meta: '20 items' }
        ],
        prerequisiteModuleIds: [],
        isPublished: true,
        createdBy: 'system-seed',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      },
      {
        id: 'profed-assessment-alignment',
        title: 'Constructive Alignment in Assessment',
        description: 'Connect learning outcomes, instruction, and assessment so tests measure what was taught.',
        subjectId: 'profed',
        categoryId: 'profed',
        topicId: 'profed_assessment',
        skillIds: ['profed_assessment_formative', 'profed_assessment_summative'],
        level: 2,
        duration: '45 min',
        lessonBlocks: [
          { type: 'heading', content: 'Begin with the learning outcome' },
          { type: 'text', content: 'A good assessment starts with the target competency. The activity and test item should ask learners to show the same kind of thinking named in the outcome.' },
          { type: 'callout', content: 'If the outcome says analyze, avoid an item that only asks learners to recall a definition.' }
        ],
        textbookIds: ['book_profed_assessment_alignment'],
        checkQuestionIds: [
          questionIdByStem['What type of assessment is given before instruction to determine students\' entry knowledge?']
        ],
        challengeQuestionIds: [
          questionIdByStem['Which of the following is a formative assessment technique?'],
          questionIdByStem['In a frequency distribution, what is the score that occurs most frequently?']
        ],
        resources: [
          { type: 'textbook', title: 'Professional Education Reviewer: Assessment and Alignment', meta: 'Chapter 5', targetId: 'book_profed_assessment_alignment' },
          { type: 'quiz', title: 'Alignment drill', meta: '12 items' },
          { type: 'exam', title: 'Prof Ed assessment set', meta: '30 items' }
        ],
        prerequisiteModuleIds: ['gened-critical-reading'],
        isPublished: true,
        createdBy: 'system-seed',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      },
      {
        id: 'profed-childdev-foundations',
        title: 'Learner Development Foundations',
        description: 'Review major development theories and how they shape classroom decisions.',
        subjectId: 'profed',
        categoryId: 'profed',
        topicId: 'profed_childdev',
        skillIds: [],
        level: 2,
        duration: '40 min',
        lessonBlocks: [
          { type: 'heading', content: 'Match theory to classroom evidence' },
          { type: 'text', content: 'Development theories help teachers interpret learner behavior. The board exam often asks which theory best explains a classroom situation.' },
          { type: 'callout', content: 'Piaget focuses on cognitive structures, Erikson on psychosocial tasks, and Vygotsky on social learning and scaffolding.' }
        ],
        textbookIds: ['book_profed_child_development'],
        checkQuestionIds: [
          questionIdByStem['According to Piaget, in which stage do children begin to think logically about concrete events?']
        ],
        challengeQuestionIds: [
          questionIdByStem['What is the primary psychosocial crisis of adolescence according to Erikson?'],
          questionIdByStem['Which of the following is an example of an extrinsic motivation?']
        ],
        resources: [
          { type: 'textbook', title: 'Child and Adolescent Development Quick Textbook', meta: 'Chapter 3', targetId: 'book_profed_child_development' },
          { type: 'quiz', title: 'Development theories quiz', meta: 'Adaptive' },
          { type: 'activity', title: 'Scenario sort', meta: 'Practice' }
        ],
        prerequisiteModuleIds: [],
        isPublished: true,
        createdBy: 'system-seed',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      },
      {
        id: 'major-math-problem-solving',
        title: 'Problem Solving with Ratios and Proportion',
        description: 'Practice translating word problems into proportional relationships.',
        subjectId: 'major',
        categoryId: 'major',
        topicId: 'major_math',
        skillIds: ['major_math_ratio'],
        level: 3,
        duration: '50 min',
        lessonBlocks: [
          { type: 'heading', content: 'Name the quantities before solving' },
          { type: 'text', content: 'Most ratio problems become easier when you label what each number represents. Build the proportion only after the relationship is clear.' },
          { type: 'callout', content: 'Check the unit. A correct-looking equation can still answer the wrong quantity.' }
        ],
        textbookIds: ['book_major_math_number_sense'],
        checkQuestionIds: [
          questionIdByStem['The smallest prime number is ________.']
        ],
        challengeQuestionIds: [],
        resources: [
          { type: 'textbook', title: 'Mathematics Major Reviewer: Number Sense', meta: 'Chapter 1', targetId: 'book_major_math_number_sense' },
          { type: 'quiz', title: 'Ratio warm-up', meta: '15 items' },
          { type: 'exam', title: 'Major practice set', meta: '25 items' }
        ],
        prerequisiteModuleIds: [],
        isPublished: true,
        createdBy: 'system-seed',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }
    ];

    for (const mod of starterModules) {
      try {
        const linkedQuestions = [
          ...(mod.checkQuestionIds || []),
          ...(mod.challengeQuestionIds || [])
        ].map((questionId) => questionById[questionId]).filter(Boolean);

        const seededParts = [
          {
            id: `${mod.id}-part-1`,
            title: 'Part 1: Read and learn',
            objective: mod.description,
            textbookSection: {
              title: mod.resources.find((resource: any) => resource.type === 'textbook')?.title || `${mod.title} textbook reading`,
              body: mod.lessonBlocks.map((block: any) => block.content).join('\n\n'),
              estimatedReadMinutes: 8
            },
            lessonBlocks: mod.lessonBlocks,
            miniQuiz: linkedQuestions.slice(0, 1)
          },
          {
            id: `${mod.id}-part-2`,
            title: 'Part 2: Apply and check',
            objective: `Apply ${mod.title} to LET-style decisions.`,
            textbookSection: {
              title: `${mod.title}: applied reading`,
              body: 'Use the concept in a realistic board-exam situation. First, identify the skill being tested. Next, remove answers that are unrelated, too broad, or unsupported. Finally, choose the option that best matches the principle from the lesson.',
              estimatedReadMinutes: 7
            },
            lessonBlocks: [
              { type: 'heading', content: 'Apply the idea before taking the final exam' },
              { type: 'text', content: 'This part turns the reading into practice. Learners should explain why the correct answer fits and why each distractor fails.' },
              { type: 'callout', content: 'A module should not unlock completion until the learner passes the final exam gate.' }
            ],
            miniQuiz: linkedQuestions.slice(1, 2),
            activity: {
              title: 'Explain the distractor',
              prompt: 'Choose one wrong option and write why it is tempting but incorrect.'
            }
          }
        ];

        const finalExam = linkedQuestions.slice(1).length ? linkedQuestions.slice(1) : linkedQuestions;
        const competencies = mod.skillIds.map((skillId: string) => {
          const skill = SEED_SKILLS.find((row) => row.id === skillId);
          return {
            id: skillId,
            label: skill?.name || skillId,
            topicId: skill?.topicId || mod.topicId,
          };
        });
        const flowItems = seededParts.flatMap((part, index) => {
          const rows = [
            {
              id: `${part.id}-textbook`,
              type: 'textbook',
              partId: part.id,
              title: part.textbookSection.title,
              order: index * 3,
              required: true,
            },
            {
              id: `${part.id}-lesson`,
              type: 'lesson',
              partId: part.id,
              title: part.title,
              order: index * 3 + 1,
              required: true,
            },
          ];
          if (part.miniQuiz?.length) {
            rows.push({
              id: `${part.id}-mini-quiz`,
              type: 'quiz',
              partId: part.id,
              title: `${part.title} mini quiz`,
              order: index * 3 + 2,
              required: true,
            });
          }
          return rows;
        });

        await setDoc(doc(db, 'modules', mod.id), {
          ...mod,
          publishScope: 'public',
          classIds: [],
          status: 'published',
          authorId: 'system-seed',
          authorName: 'Let Mastery Editorial Team',
          approved: true,
          approvalStatus: 'approved',
          competencies,
          flowItems,
          unlockRules: {
            requiresFinalExamPass: true,
            passingScore: 85,
            unlocksNextModuleIds: [],
          },
          attemptPolicy: {
            miniQuiz: {
              maxAttempts: 1,
              scoreMode: 'first_attempt',
              showAnswersAfterSubmission: true,
              randomizeQuestions: false,
            },
            finalExam: {
              maxAttempts: 1,
              scoreMode: 'first_attempt',
              showAnswersAfterSubmission: true,
              randomizeQuestions: true,
              passingScore: 85,
            },
          },
          parts: seededParts,
          finalExam: finalExam.map((question: any) => ({
            ...question,
            partId: seededParts[0]?.id,
            competencyId: question.skillIds?.[0] || competencies[0]?.id || mod.topicId,
          })),
          examBlueprint: {
            questionCount: Math.max(1, finalExam.length),
            passingScore: 85,
            difficultyMix: { easy: 50, medium: 40, hard: 10 },
            topicDistribution: { [mod.topicId]: 100 },
          },
        }, { merge: true });
        console.log(`Seeded module: ${mod.title}`);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `modules/${mod.id}`);
      }
    }

    // 7. Seed Public Exam Blueprints
    const examBlueprints = [
      {
        id: 'blueprint-public-gened-practice',
        title: 'General Education Public Practice Drill',
        description: 'Short public practice set for General Education review.',
        examMode: 'practice_drill',
        categoryId: 'gened',
        questionCount: 5,
        timeLimitMinutes: 15,
        passingScore: 70,
        difficultyMix: { easy: 60, medium: 40 },
        categoryDistribution: { gened: 100 },
        integrityLevel: 'open_practice',
      },
      {
        id: 'blueprint-public-profed-practice',
        title: 'Professional Education Public Practice Drill',
        description: 'Short public practice set for Professional Education review.',
        examMode: 'practice_drill',
        categoryId: 'profed',
        questionCount: 5,
        timeLimitMinutes: 15,
        passingScore: 70,
        difficultyMix: { easy: 50, medium: 40, hard: 10 },
        categoryDistribution: { profed: 100 },
        integrityLevel: 'open_practice',
      },
      {
        id: 'blueprint-public-full-let-core',
        title: 'Public Full LET Simulation Blueprint',
        description: 'Seeded full-review blueprint using only approved public questions. Increase item count as the official bank grows.',
        examMode: 'full_mock',
        questionCount: 8,
        timeLimitMinutes: 80,
        passingScore: 75,
        difficultyMix: { easy: 35, medium: 45, hard: 20 },
        categoryDistribution: { gened: 50, profed: 50 },
        integrityLevel: 'strict_exam_mode',
      },
    ];

    for (const blueprint of examBlueprints) {
      await setDoc(doc(db, 'examBlueprints', blueprint.id), {
        ...blueprint,
        status: 'active',
        isPublished: true,
        createdBy: 'system-seed',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }, { merge: true });
      console.log(`Seeded exam blueprint: ${blueprint.title}`);
    }

    // 8. Seed Demo Accounts
    const demoAccounts = [
      {
        uid: 'demo-student',
        email: 'student@letmastery.com',
        role: 'student',
        isDemo: true,
        fullName: 'Demo Student',
        onboarded: false,
        learningMode: 'self_review',
        activeClassId: null,
        selectedFocus: null,
        reviewTrack: null,
        specialization: '',
        diagnosticCompleted: false,
        diagnosticSkipped: false,
        streak: 0,
        xp: 0,
        level: 1,
        earnedBadges: []
      },
      {
        uid: 'demo-instructor',
        email: 'instructor@letmastery.com',
        role: 'instructor',
        isDemo: true,
        fullName: 'Dr. Jane Teacher',
        onboarded: true,
        diagnosticCompleted: false
      },
      {
        uid: 'demo-admin',
        email: 'admin@letmastery.com',
        role: 'admin',
        isDemo: true,
        fullName: 'System Administrator',
        onboarded: true,
        diagnosticCompleted: false
      }
    ];

    for (const acct of demoAccounts) {
      try {
        await setDoc(doc(db, 'users', acct.uid), {
          ...acct,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        }, { merge: true });
        console.log(`Seeded demo account: ${acct.email}`);
      } catch (err) {
         console.error(`Failed to seed demo account ${acct.email}`, err);
      }
    }

    // 9. Seed Demo Class, Enrollment, and Learner Profile
    await setDoc(doc(db, 'classes', 'class_let_foundations'), {
      id: 'class_let_foundations',
      className: 'LET Foundations Journey',
      classCode: 'LET2026',
      description: 'Guided LET review class with modules, textbook readings, quizzes, and mock exam practice.',
      instructorId: 'demo-instructor',
      instructorEmail: 'instructor@letmastery.com',
      instructorName: 'Dr. Jane Teacher',
      status: 'active',
      focus: 'full_let_review',
      studentCount: 1,
      inviteLink: '/join/LET2026',
      assignedModuleIds: ['gened-critical-reading', 'profed-assessment-alignment', 'profed-childdev-foundations'],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }, { merge: true });

    await setDoc(doc(db, 'classEnrollments', 'class_let_foundations_demo-student'), {
      id: 'class_let_foundations_demo-student',
      classId: 'class_let_foundations',
      studentId: 'demo-student',
      studentName: 'Demo Student',
      status: 'active',
      joinedAt: serverTimestamp()
    }, { merge: true });

    await setDoc(doc(db, 'learnerProfiles', 'demo-student'), {
      userId: 'demo-student',
      learningMode: 'self_review',
      activeClassId: null,
      selectedFocus: null,
      currentLevel: 0,
      overallScore: 0,
      masteryBySkill: {},
      masteryByTopic: {},
      masteryByCategory: {},
      weakSkills: [],
      strongSkills: [],
      weakTopics: [],
      strongTopics: [],
      recommendedModuleIds: [],
      nextRecommendedModuleId: null,
      badges: [],
      lastUpdatedAt: serverTimestamp()
    }, { merge: true });

    console.log('Standardized seeding completed');

    return true;
  } catch (error) {
    console.error('Seeding process failed:', error);
    throw error;
  }
}

export interface SeedHealthReport {
  counts: Record<string, number>;
  warnings: string[];
  blueprintCoverage: Array<{
    id: string;
    title: string;
    required: number;
    available: number;
    status: 'ready' | 'needs_questions';
  }>;
}

export async function getSeedHealth(): Promise<SeedHealthReport> {
  const [
    categoriesSnap,
    topicsSnap,
    skillsSnap,
    textbooksSnap,
    modulesSnap,
    questionsSnap,
    blueprintsSnap,
  ] = await Promise.all([
    getDocs(collection(db, 'categories')),
    getDocs(collection(db, 'topics')),
    getDocs(collection(db, 'skills')),
    getDocs(collection(db, 'textbooks')),
    getDocs(query(collection(db, 'modules'), where('isPublished', '==', true))),
    getDocs(query(collection(db, 'questions'), where('approved', '==', true), where('isPublished', '==', true))),
    getDocs(query(collection(db, 'examBlueprints'), where('isPublished', '==', true))),
  ]);

  const approvedQuestions = questionsSnap.docs.map((questionDoc) => ({ id: questionDoc.id, ...questionDoc.data() } as any));
  const blueprintCoverage = blueprintsSnap.docs.map((blueprintDoc) => {
    const blueprint = blueprintDoc.data() as any;
    const categoryDistribution = blueprint.categoryDistribution || blueprint.sectionDistribution || {};
    const allowedCategoryIds = Object.keys(categoryDistribution);
    const available = allowedCategoryIds.length
      ? approvedQuestions.filter((question) => allowedCategoryIds.includes(question.categoryId)).length
      : approvedQuestions.length;
    const required = Number(blueprint.questionCount || 0);
    return {
      id: blueprintDoc.id,
      title: blueprint.title || blueprintDoc.id,
      required,
      available,
      status: available >= required && required > 0 ? 'ready' as const : 'needs_questions' as const,
    };
  });

  const counts = {
    categories: categoriesSnap.size,
    topics: topicsSnap.size,
    skills: skillsSnap.size,
    textbooks: textbooksSnap.size,
    publishedModules: modulesSnap.size,
    approvedQuestions: questionsSnap.size,
    activeBlueprints: blueprintsSnap.size,
  };

  const warnings = [
    counts.categories === 0 ? 'No public categories exist yet.' : '',
    counts.topics === 0 ? 'No public topics exist yet.' : '',
    counts.textbooks === 0 ? 'No public textbooks exist yet.' : '',
    counts.publishedModules === 0 ? 'No published public modules exist yet.' : '',
    counts.approvedQuestions === 0 ? 'No approved public questions exist yet.' : '',
    counts.activeBlueprints === 0 ? 'No active public exam blueprints exist yet.' : '',
    ...blueprintCoverage
      .filter((blueprint) => blueprint.status === 'needs_questions')
      .map((blueprint) => `${blueprint.title} needs ${blueprint.required} approved questions but only ${blueprint.available} are available.`),
  ].filter(Boolean);

  return { counts, warnings, blueprintCoverage };
}
