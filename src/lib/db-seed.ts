import { collection, doc, setDoc, serverTimestamp, getDocs, query, where } from 'firebase/firestore';
import { db } from './firebase';
import {
  REVIEW_TRACKS as SEED_REVIEW_TRACKS,
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

function getSeedDistributionTargets(distribution: Record<string, number> | undefined, count: number) {
  const entries = Object.entries(distribution || {})
    .map(([key, value]) => [key, Math.max(0, Number(value) || 0)] as const)
    .filter(([, value]) => value > 0);
  if (entries.length === 0 || count <= 0) return [] as { key: string; count: number }[];

  const totalWeight = entries.reduce((sum, [, value]) => sum + value, 0);
  const rows = entries.map(([key, value]) => {
    const exact = (value / totalWeight) * count;
    return { key, count: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });

  let assigned = rows.reduce((sum, row) => sum + row.count, 0);
  [...rows].sort((a, b) => b.remainder - a.remainder).forEach((row) => {
    if (assigned >= count) return;
    row.count += 1;
    assigned += 1;
  });

  return rows.filter((row) => row.count > 0).map(({ key, count: target }) => ({ key, count: target }));
}

export async function seedDatabase(options: { includeDemo?: boolean } = {}) {
  const includeDemo = options.includeDemo ?? true;
  console.log('Starting standardized database seed...');
  
  try {
    // 0. Seed LET Review Tracks
    for (const track of SEED_REVIEW_TRACKS) {
      try {
        await setDoc(doc(db, 'reviewTracks', track.id), {
          ...track,
          trackId: track.id,
          isPublished: track.isPublished ?? true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }, { merge: true });
        console.log(`Seeded review track: ${track.title}`);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `reviewTracks/${track.id}`);
      }
    }

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

    const topicById = SEED_TOPICS.reduce<Record<string, any>>((acc, topic) => {
      acc[topic.id] = topic;
      return acc;
    }, {});

    // 3. Seed Skills and Competencies
    for (const skill of SEED_SKILLS) {
       try {
         const topic = topicById[skill.topicId];
         const competency = {
           ...skill,
           title: skill.name,
           categoryId: (skill as any).categoryId || topic?.categoryId || '',
           competencyId: skill.id,
           topicId: skill.topicId,
           reviewTracks: (skill as any).reviewTracks || topic?.reviewTracks || [],
           specialization: (skill as any).specialization || topic?.specialization || '',
           isPublished: true,
           createdAt: serverTimestamp(),
           updatedAt: serverTimestamp()
         };
         await setDoc(doc(db, 'skills', skill.id), competency, { merge: true });
         await setDoc(doc(db, 'competencies', skill.id), {
           ...competency,
           sourceCollection: 'skills',
         }, { merge: true });
         console.log(`Seeded skill: ${skill.name}`);
       } catch (err) {
         handleFirestoreError(err, OperationType.WRITE, `skills/${skill.id}`);
       }
    }

    const reviewTracksForCategory = (categoryId: string) => {
      if (categoryId === 'major') return ['secondary', 'specialization'];
      if (categoryId === 'gened' || categoryId === 'profed') return ['elementary', 'secondary'];
      return ['elementary', 'secondary'];
    };

    const relatedModuleByTopic: Record<string, string> = {
      gened_english: 'gened-critical-reading',
      gened_math: 'gened-math-foundations',
      gened_socsci: 'gened-critical-reading',
      profed_assessment: 'profed-assessment-alignment',
      profed_childdev: 'profed-childdev-foundations',
      profed_principles: 'profed-childdev-foundations',
      profed_curriculum: 'profed-assessment-alignment',
      major_math: 'major-math-problem-solving',
    };

    const misconceptionTagsByTopic: Record<string, string[]> = {
      gened_english: ['literal-reading', 'grammar-trap', 'evidence-selection'],
      gened_math: ['number-property-confusion', 'operation-choice'],
      gened_socsci: ['civic-fact-confusion', 'historical-identity'],
      profed_assessment: ['assessment-purpose-confusion', 'validity-reliability', 'formative-vs-summative'],
      profed_childdev: ['development-stage-confusion', 'theory-application'],
      profed_principles: ['motivation-source-confusion', 'teaching-principle-application'],
      profed_curriculum: ['curriculum-goal-confusion', 'outcome-alignment'],
      major_math: ['ratio-setup', 'unit-labeling'],
    };

    // 4. Seed Questions with Stable IDs
    for (const quest of SEED_QUESTIONS) {
        try {
          const stableId = generateStableId(quest.stem);
          const competencyId = (quest as any).competencyId || quest.skillIds?.[0] || quest.topicId;
          const wrongChoiceExplanations = Object.fromEntries((quest.options || [])
            .filter((option: any) => option.id !== quest.correctOptionId)
            .map((option: any) => [option.id, `${option.text} is not the best answer because it does not match ${competencyId}. Compare it with the rationalization and review the related module.`]));
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
            competencyId,
            familyId: `${stableId}_family`,
            reviewTracks: (quest as any).reviewTracks || reviewTracksForCategory(quest.categoryId),
            specialization: (quest as any).specialization || (quest.categoryId === 'major' ? 'Mathematics' : ''),
            wrongChoiceExplanations,
            misconceptionTags: (quest as any).misconceptionTags || misconceptionTagsByTopic[quest.topicId] || [],
            relatedModuleId: (quest as any).relatedModuleId || relatedModuleByTopic[quest.topicId] || '',
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
        reviewTracks: ['elementary', 'secondary'],
        specialization: '',
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
        skillIds: ['profed_assessment_formative', 'profed_assessment_summative', 'profed_assessment_validity_reliability'],
        reviewTracks: ['elementary', 'secondary'],
        specialization: '',
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
        id: 'gened-math-foundations',
        title: 'General Education Math Foundations',
        description: 'Review prime numbers, number properties, and operation choice for LET General Education math.',
        subjectId: 'gened',
        categoryId: 'gened',
        topicId: 'gened_math',
        skillIds: ['gened_math_algebra'],
        reviewTracks: ['elementary', 'secondary'],
        specialization: '',
        level: 1,
        duration: '30 min',
        lessonBlocks: [
          { type: 'heading', content: 'Understand the number before solving' },
          { type: 'text', content: 'General Education math items often test whether you know basic properties and can identify the correct operation. A prime number has exactly two factors: 1 and itself.' },
          { type: 'callout', content: 'Do not memorize only the answer. Ask what property is being tested, then eliminate choices that violate that property.' }
        ],
        textbookIds: ['book_gened_math_foundations'],
        checkQuestionIds: [
          questionIdByStem['The smallest prime number is ________.']
        ],
        challengeQuestionIds: [],
        resources: [
          { type: 'textbook', title: 'General Education Reviewer: Math Foundations', meta: 'Chapter 3', targetId: 'book_gened_math_foundations' },
          { type: 'quiz', title: 'Number properties drill', meta: '5 items' },
          { type: 'exam', title: 'Gen Ed math mastery check', meta: 'Core' }
        ],
        prerequisiteModuleIds: [],
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
        skillIds: ['profed_childdev_stage_theory'],
        reviewTracks: ['elementary', 'secondary'],
        specialization: '',
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
        skillIds: ['major_math_ratio', 'major_math_number_sense'],
        reviewTracks: ['secondary', 'specialization'],
        specialization: 'Mathematics',
        level: 3,
        duration: '50 min',
        lessonBlocks: [
          { type: 'heading', content: 'Name the quantities before solving' },
          { type: 'text', content: 'Most ratio problems become easier when you label what each number represents. Build the proportion only after the relationship is clear.' },
          { type: 'callout', content: 'Check the unit. A correct-looking equation can still answer the wrong quantity.' }
        ],
        textbookIds: ['book_major_math_number_sense'],
        checkQuestionIds: [
          questionIdByStem['A class has 18 boys and 12 girls. What is the ratio of boys to girls in simplest form?']
        ],
        challengeQuestionIds: [
          questionIdByStem['If 5 notebooks cost 150 pesos, how much will 8 notebooks cost at the same rate?'],
          questionIdByStem['Which number is both a factor of 24 and a multiple of 3?']
        ],
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
              id: `${mod.id}-part-1:textbook`,
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
              id: `${mod.id}-part-2:textbook`,
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
        id: 'blueprint-public-let-diagnostic',
        title: 'Public LET Baseline Diagnostic',
        description: 'Baseline diagnostic used to create a learner profile before public self-study or class review.',
        examMode: 'diagnostic',
        questionCount: 8,
        timeLimitMinutes: 25,
        passingScore: 0,
        difficultyMix: { easy: 60, medium: 40 },
        categoryDistribution: { gened: 50, profed: 50 },
        reviewTracks: ['elementary', 'secondary'],
        integrityLevel: 'light_protection',
      },
      {
        id: 'blueprint-public-let-diagnostic-secondary-math',
        title: 'Secondary LET Mathematics Baseline Diagnostic',
        description: 'Baseline diagnostic for Secondary LET students with Mathematics specialization coverage.',
        examMode: 'diagnostic',
        questionCount: 7,
        timeLimitMinutes: 25,
        passingScore: 0,
        difficultyMix: { easy: 60, medium: 40 },
        categoryDistribution: { gened: 43, profed: 43, major: 14 },
        reviewTracks: ['secondary'],
        specialization: 'Mathematics',
        integrityLevel: 'light_protection',
      },
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
        reviewTracks: ['elementary', 'secondary'],
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
        reviewTracks: ['elementary', 'secondary'],
        integrityLevel: 'open_practice',
      },
      {
        id: 'blueprint-public-major-math-practice',
        title: 'Mathematics Specialization Practice Drill',
        description: 'Short public practice set for Secondary LET Mathematics specialization review.',
        examMode: 'practice_drill',
        categoryId: 'major',
        topicId: 'major_math',
        specialization: 'Mathematics',
        questionCount: 3,
        timeLimitMinutes: 15,
        passingScore: 70,
        difficultyMix: { easy: 65, medium: 35 },
        categoryDistribution: { major: 100 },
        reviewTracks: ['secondary', 'specialization'],
        integrityLevel: 'open_practice',
      },
      {
        id: 'blueprint-public-full-let-elementary',
        title: 'Elementary LET Full Simulation Blueprint',
        description: 'Seeded Elementary LET blueprint using General Education and Professional Education approved questions.',
        examMode: 'full_mock',
        questionCount: 8,
        timeLimitMinutes: 80,
        passingScore: 75,
        difficultyMix: { easy: 35, medium: 45, hard: 20 },
        categoryDistribution: { gened: 50, profed: 50 },
        reviewTracks: ['elementary'],
        integrityLevel: 'strict_exam_mode',
      },
      {
        id: 'blueprint-public-full-let-secondary-math',
        title: 'Secondary LET Mathematics Full Simulation Blueprint',
        description: 'Seeded Secondary LET blueprint with General Education, Professional Education, and Mathematics specialization coverage.',
        examMode: 'full_mock',
        questionCount: 9,
        timeLimitMinutes: 90,
        passingScore: 75,
        difficultyMix: { easy: 35, medium: 45, hard: 20 },
        categoryDistribution: { gened: 34, profed: 33, major: 33 },
        reviewTracks: ['secondary'],
        specialization: 'Mathematics',
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

    if (includeDemo) {
      await seedDemoFixtures();
    }

    console.log('Standardized seeding completed');

    return true;
  } catch (error) {
    console.error('Seeding process failed:', error);
    throw error;
  }
}

export async function seedPublicCurriculum() {
  return seedDatabase({ includeDemo: false });
}

export async function seedDemoFixtures() {
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

  console.log('Demo fixtures seeded with zero student progress.');
  return true;
}

export interface SeedHealthReport {
  counts: Record<string, number>;
  warnings: string[];
  blueprintCoverage: Array<{
    id: string;
    title: string;
    required: number;
    available: number;
    categoryShortfalls?: string[];
    status: 'ready' | 'needs_questions';
  }>;
}

export async function getSeedHealth(): Promise<SeedHealthReport> {
  const [
    reviewTracksSnap,
    categoriesSnap,
    topicsSnap,
    skillsSnap,
    competenciesSnap,
    textbooksSnap,
    modulesSnap,
    questionsSnap,
    blueprintsSnap,
  ] = await Promise.all([
    getDocs(collection(db, 'reviewTracks')),
    getDocs(collection(db, 'categories')),
    getDocs(collection(db, 'topics')),
    getDocs(collection(db, 'skills')),
    getDocs(collection(db, 'competencies')),
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
    const categoryShortfalls = getSeedDistributionTargets(categoryDistribution, required)
      .map(({ key, count }) => {
        const categoryPool = approvedQuestions.filter((question) => (
          question.categoryId === key &&
          (!blueprint.specialization || !question.specialization || question.specialization === blueprint.specialization)
        ));
        return categoryPool.length < count ? `${key}: needs ${count}, has ${categoryPool.length}` : '';
      })
      .filter(Boolean);
    return {
      id: blueprintDoc.id,
      title: blueprint.title || blueprintDoc.id,
      required,
      available,
      categoryShortfalls,
      status: available >= required && required > 0 && categoryShortfalls.length === 0 ? 'ready' as const : 'needs_questions' as const,
    };
  });

  const counts = {
    reviewTracks: reviewTracksSnap.size,
    categories: categoriesSnap.size,
    topics: topicsSnap.size,
    skills: skillsSnap.size,
    competencies: competenciesSnap.size,
    textbooks: textbooksSnap.size,
    publishedModules: modulesSnap.size,
    approvedQuestions: questionsSnap.size,
    activeBlueprints: blueprintsSnap.size,
  };

  const warnings = [
    counts.reviewTracks === 0 ? 'No LET review tracks exist yet.' : '',
    counts.categories === 0 ? 'No public categories exist yet.' : '',
    counts.topics === 0 ? 'No public topics exist yet.' : '',
    counts.competencies === 0 ? 'No competency records exist yet.' : '',
    counts.textbooks === 0 ? 'No public textbooks exist yet.' : '',
    counts.publishedModules === 0 ? 'No published public modules exist yet.' : '',
    counts.approvedQuestions === 0 ? 'No approved public questions exist yet.' : '',
    counts.activeBlueprints === 0 ? 'No active public exam blueprints exist yet.' : '',
    ...blueprintCoverage
      .filter((blueprint) => blueprint.status === 'needs_questions')
      .map((blueprint) => (
        blueprint.categoryShortfalls?.length
          ? `${blueprint.title} category shortage: ${blueprint.categoryShortfalls.join('; ')}.`
          : `${blueprint.title} needs ${blueprint.required} approved questions but only ${blueprint.available} are available.`
      )),
  ].filter(Boolean);

  return { counts, warnings, blueprintCoverage };
}
