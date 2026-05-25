# Let Mastery Pro

Let Mastery Pro is a web-based PWA for LET review, adaptive learning, and role-based course management. It turns instructor materials into guided learning journeys: document upload or AI draft, instructor review, publish to class or self-study, student learning part by part, mini quizzes, final exam gating, progress tracking, and certificate eligibility.

## Roles

- Student: offline-friendly module reading, notes, highlights, quizzes, final exams, study planner, reminders, progress, and certificates.
- Instructor: Instructor Studio, AI document-to-module converter, editable module builder, assignments, gradebook, class monitoring, certificate templates, and AI review tools.
- Admin: user/class oversight, certificates, analytics, settings, activity logs, and content visibility.

## Main Features

- Instructor Studio with editable outline, parts, textbook sections, mini quizzes, activities, final exam, competencies, rubrics, unlock rules, attempt controls, and certificate settings.
- AI Document-to-Digital-Module Converter for PDF, DOCX, PPTX, TXT, and Markdown.
- Source-grounded AI output with `sourceDocumentId`, page/slide references, snippets, confidence flags, and review-required warnings.
- Student Learning Quest flow: intro, reading, lesson, mini quiz, activity, final exam, complete.
- Explicit module states: locked, available, in progress, paused, ready for final exam, review required, completed, mastered.
- Cross-module unlock logic after passing a final exam.
- Notifications, study planner, reminders, draft autosave, notes, highlights, low-bandwidth mode, and PWA support.
- Firestore-backed progress, gradebook, submissions, attempts, certificates, and notifications.

## Tech Stack

- React 19, Vite, TypeScript, Tailwind CSS
- Firebase Auth and Firestore
- Express server for AI and document extraction endpoints
- PWA via `vite-plugin-pwa`
- Document extraction with `pdf-parse` and `jszip`
- AI gateway endpoint for course building, grading, rewriting, explanations, and adaptive recommendations

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create environment variables:

```bash
LOVABLE_API_KEY=your_ai_gateway_key
VITE_FIREBASE_API_KEY=your_firebase_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

3. Run locally:

```bash
npm run dev -- --host 127.0.0.1 --port 5173
```

4. Build:

```bash
npm run build
```

5. Start production bundle:

```bash
npm run start
```

## AI Endpoints

- `POST /api/extract-document`: extracts text and chunks from PDF, DOCX, PPTX, TXT, or Markdown.
- `POST /api/course-builder`: turns topic/source text/source chunks into an editable module draft.
- `POST /api/generate-module-exam`: generates fresh final exam questions from module text.
- `POST /api/grade-answer`: grades written answers with spelling and meaning tolerance.
- `POST /api/rewrite-text`: proofreads or paraphrases instructor text.
- `POST /api/explain-answer`: explains quiz answers for students.
- `POST /api/adaptive-recommend`: generates adaptive study recommendations.

## Firestore Collections

Core collections include:

- `users`
- `classes`
- `classEnrollments`
- `modules`
- `moduleProgress`
- `learningNotes`
- `assignments`
- `assignmentSubmissions`
- `notifications`
- `examAttemptLogs`
- `learnerProfiles`
- `diagnosticAttempts`
- `quizAttempts`
- `mockExamAttempts`
- `certificateTemplates`
- `certificates`
- `contentVersions`
- `activityLogs`

## Module Schema

The current module model is journey-first:

- `parts[]`
- `parts[].textbookSection`
- `parts[].miniQuiz`
- `parts[].activity`
- `finalExam[]`
- `flowItems[]`
- `competencies[]`
- `rubric[]`
- `unlockRules`
- `attemptPolicy`
- `examBlueprint`
- `sourceDocument`

Older fields such as `lessonBlocks`, `checkQuestionIds`, and `challengeQuestionIds` may still appear for backwards compatibility, but new features should use the journey-first schema.

## Screenshots

Add product screenshots after deployment:

- Student dashboard and planner
- Learning Quest reader and final exam
- Instructor Studio document converter
- Instructor gradebook
- Certificate verification

## Deployment

1. Set the environment variables in your hosting provider.
2. Run `npm run build`.
3. Deploy the generated `dist` app and `dist/server.cjs` server bundle.
4. Deploy Firestore rules from `firestore.rules`.
5. Verify `/api/extract-document`, `/api/course-builder`, and the role dashboards after deploy.

## Safety Notes

- AI drafts never publish directly. Instructors must review, edit, save, and publish.
- Uploaded documents are extracted into text/chunks for conversion; files are not stored in Firestore.
- Source references and confidence flags are kept so instructors can verify AI-generated sections.
