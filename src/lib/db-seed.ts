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
          await setDoc(doc(db, 'questions', stableId), {
            ...quest,
            id: stableId,
            version: 1,
            aiGenerated: false,
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
        await setDoc(doc(db, 'modules', mod.id), mod, { merge: true });
        console.log(`Seeded module: ${mod.title}`);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `modules/${mod.id}`);
      }
    }

    // 7. Seed Demo Accounts
    const demoAccounts = [
      {
        uid: 'demo-student',
        email: 'student@letmastery.com',
        role: 'student',
        fullName: 'Demo Student',
        onboarded: true,
        learningMode: 'class_based',
        activeClassId: 'class_let_foundations',
        selectedFocus: 'profed',
        diagnosticCompleted: true,
        streak: 5,
        xp: 1250,
        level: 2,
        earnedBadges: ['badge_pioneer']
      },
      {
        uid: 'demo-instructor',
        email: 'instructor@letmastery.com',
        role: 'instructor',
        fullName: 'Dr. Jane Teacher',
        onboarded: true,
        diagnosticCompleted: false
      },
      {
        uid: 'demo-admin',
        email: 'admin@letmastery.com',
        role: 'admin',
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

    // 8. Seed Demo Class, Enrollment, and Learner Profile
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
      learningMode: 'class_based',
      activeClassId: 'class_let_foundations',
      selectedFocus: 'profed',
      currentLevel: 2,
      overallScore: 64,
      masteryBySkill: {
        gened_english_inference: 58,
        profed_assessment_formative: 46,
        profed_assessment_summative: 39,
        major_math_ratio: 18
      },
      masteryByTopic: {
        gened_english: 58,
        profed_assessment: 46,
        profed_childdev: 51,
        major_math: 18
      },
      masteryByCategory: {
        gened: 52,
        profed: 48,
        major: 18
      },
      weakSkills: ['profed_assessment_summative', 'major_math_ratio'],
      strongSkills: ['gened_english_inference'],
      weakTopics: ['major_math', 'profed_assessment'],
      strongTopics: ['gened_english'],
      recommendedModuleIds: ['profed-assessment-alignment', 'major-math-problem-solving'],
      nextRecommendedModuleId: 'profed-assessment-alignment',
      streak: 5,
      badges: ['badge_pioneer'],
      lastUpdatedAt: serverTimestamp()
    }, { merge: true });

    console.log('Standardized seeding completed');

    return true;
  } catch (error) {
    console.error('Seeding process failed:', error);
    throw error;
  }
}
