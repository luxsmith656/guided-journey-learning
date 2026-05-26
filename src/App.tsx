import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate, useLocation } from 'react-router-dom';
import AdminDashboard from './pages/AdminDashboard';
import CategoryManagement from './pages/CategoryManagement';
import QuestionBank from './pages/QuestionBank';
import EditQuestion from './pages/EditQuestion';
import QuestionDetail from './pages/QuestionDetail';
import CurriculumSettings from './pages/CurriculumSettings';
import Analytics from './pages/Analytics';
import Users from './pages/Users';
import Notifications from './pages/Notifications';
import ActivityLogs from './pages/ActivityLogs';
import BulkUpload from './pages/BulkUpload';
import SyncCenter from './pages/SyncCenter';
import Settings from './pages/Settings';
import SignIn from './pages/SignIn';
import ForgotPassword from './pages/ForgotPassword';
import Loading from './pages/Loading';
import Onboarding from './pages/Onboarding';
import Focus from './pages/Focus';
import QuizResults from './pages/QuizResults';
import ExamSimulation from './pages/ExamSimulation';
import StudentDashboard from './pages/StudentDashboard';
import StudentCourses from './pages/StudentCourses';
import InstructorDashboard from './pages/InstructorDashboard';
import InstructorModules from './pages/InstructorModules';
import DiagnosticAssessment from './pages/DiagnosticAssessment';
import AIDrafts from './pages/AIDrafts';
import LearningQuest from './pages/LearningQuest';
import AdminClasses from './pages/AdminClasses';
import InstructorClasses from './pages/InstructorClasses';
import InstructorGradebook from './pages/InstructorGradebook';
import AdminCertificates from './pages/AdminCertificates';
import InstructorCertificates from './pages/InstructorCertificates';
import CertificateVerify from './pages/CertificateVerify';
import TextbookLibrary from './pages/TextbookLibrary';
import ChooseLearningMode from './pages/ChooseLearningMode';
import ChooseFocus from './pages/ChooseFocus';
import JoinClass from './pages/JoinClass';
import Flashcards from './pages/Flashcards';
import ProfileSettings from './pages/ProfileSettings';
import StudentTodo from './pages/StudentTodo';
import { SidebarProvider } from './context/SidebarContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { BrandingProvider, useBranding } from './context/BrandingContext';
import { SyncProvider } from './context/SyncContext';

function ProtectedRoute({ children, role, requireOnboarded = true }: { children: React.ReactNode, role?: 'admin' | 'instructor' | 'student', requireOnboarded?: boolean }) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <Loading />;
  }

  if (!user) {
    return <Navigate to="/sign-in" state={{ from: location }} replace />;
  }

  // Handle onboarding for students
  if (requireOnboarded && !user.onboarded && location.pathname !== '/onboarding' && user.role === 'student' && location.pathname !== '/sign-in') {
    return <Navigate to="/onboarding" state={{ from: location }} replace />;
  }

  if (role && user.role !== role) {
    if (user.role === 'admin') return <Navigate to="/admin/dashboard" replace />;
    if (user.role === 'instructor') return <Navigate to="/instructor/dashboard" replace />;
    return <Navigate to="/student/dashboard" replace />;
  }

  return <>{children}</>;
}

function DevIndex() {
  return (
    <div className="p-8 max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold font-headline">Let Mastery Pro App Navigation</h1>
      <p className="text-on-surface-variant font-body mb-4 shrink-0">Development index mapping early routes.</p>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col gap-2">
          <h2 className="font-bold text-primary mb-2">Admin Panel</h2>
          <Link to="/admin/dashboard" className="text-blue-600 hover:underline">1. Dashboard</Link>
          <Link to="/admin/categories" className="text-blue-600 hover:underline">2. Category Management</Link>
          <Link to="/admin/question/edit" className="text-blue-600 hover:underline">3. Edit Question</Link>
          <Link to="/admin/question/detail" className="text-blue-600 hover:underline">4. Question Detail</Link>
          <Link to="/admin/curriculum-settings" className="text-blue-600 hover:underline">5. Curriculum Settings</Link>
          <Link to="/admin/analytics" className="text-blue-600 hover:underline">6. Student Analytics</Link>
          <Link to="/admin/users" className="text-blue-600 hover:underline">7. User & Role Management</Link>
          <Link to="/admin/bulk-upload" className="text-blue-600 hover:underline">8. Roster Upload</Link>
          <Link to="/admin/sync" className="text-blue-600 hover:underline">9. Sync Control Center</Link>
          <Link to="/admin/settings" className="text-blue-600 hover:underline">10. System Settings</Link>
        </div>
        
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col gap-2">
          <h2 className="font-bold text-secondary mb-2">Client Experience</h2>
          <Link to="/student/dashboard" className="text-teal-600 hover:underline">11. Dashboard</Link>
          <Link to="/loading" className="text-teal-600 hover:underline">12. Loading Screen</Link>
          <Link to="/onboarding" className="text-teal-600 hover:underline">13. Onboarding</Link>
          <Link to="/sign-in" className="text-teal-600 hover:underline">14. Sign In</Link>
          <Link to="/focus" className="text-teal-600 hover:underline">15. Choose Focus</Link>
          <Link to="/exam" className="text-teal-600 hover:underline">16. Exam Simulation</Link>
          <Link to="/quiz-results" className="text-teal-600 hover:underline">17. Quiz Results</Link>
        </div>
      </div>
    </div>
  );
}

function AppContent() {
  const { settings } = useBranding();

  React.useEffect(() => {
    if (settings.siteName) {
      document.title = settings.siteName;
    }
  }, [settings.siteName]);

  return (
    <Router>
        <Routes>
            <Route path="/" element={<Navigate to="/sign-in" replace />} />
            <Route path="/sign-in" element={<SignIn />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/verify/:certificateId" element={<CertificateVerify />} />
            <Route path="/debug" element={<DevIndex />} />
            
            {/* Admin Routes */}
            <Route path="/admin/dashboard" element={<ProtectedRoute role="admin"><AdminDashboard /></ProtectedRoute>} />
            <Route path="/admin/categories" element={<ProtectedRoute role="admin"><Navigate to="/admin/modules" replace /></ProtectedRoute>} />
            <Route path="/admin/question/bank" element={<ProtectedRoute role="admin"><Navigate to="/admin/modules" replace /></ProtectedRoute>} />
            <Route path="/admin/question/new" element={<ProtectedRoute role="admin"><Navigate to="/admin/modules" replace /></ProtectedRoute>} />
            <Route path="/admin/question/edit/:id" element={<ProtectedRoute role="admin"><Navigate to="/admin/modules" replace /></ProtectedRoute>} />
            <Route path="/admin/bulk-upload" element={<ProtectedRoute role="admin"><Navigate to="/admin/modules" replace /></ProtectedRoute>} />
            <Route path="/admin/question/detail" element={<ProtectedRoute role="admin"><Navigate to="/admin/modules" replace /></ProtectedRoute>} />
            <Route path="/admin/curriculum-settings" element={<ProtectedRoute role="admin"><CurriculumSettings /></ProtectedRoute>} />
            <Route path="/admin/analytics" element={<ProtectedRoute role="admin"><Analytics /></ProtectedRoute>} />
            <Route path="/admin/users" element={<ProtectedRoute role="admin"><Users /></ProtectedRoute>} />
            <Route path="/admin/classes" element={<ProtectedRoute role="admin"><AdminClasses /></ProtectedRoute>} />
            <Route path="/admin/modules" element={<ProtectedRoute role="admin"><InstructorModules /></ProtectedRoute>} />
            <Route path="/admin/certificates" element={<ProtectedRoute role="admin"><AdminCertificates /></ProtectedRoute>} />
            <Route path="/admin/notifications" element={<ProtectedRoute role="admin"><Notifications /></ProtectedRoute>} />
            <Route path="/admin/activity-logs" element={<ProtectedRoute role="admin"><ActivityLogs /></ProtectedRoute>} />
            <Route path="/admin/bulk-upload" element={<ProtectedRoute role="admin"><Navigate to="/admin/modules" replace /></ProtectedRoute>} />
            <Route path="/admin/sync" element={<ProtectedRoute role="admin"><SyncCenter /></ProtectedRoute>} />
            <Route path="/admin/settings" element={<ProtectedRoute role="admin"><Settings /></ProtectedRoute>} />

            {/* Instructor Routes */}
            <Route path="/instructor/dashboard" element={<ProtectedRoute role="instructor"><InstructorDashboard /></ProtectedRoute>} />
            <Route path="/instructor/questions" element={<ProtectedRoute role="instructor"><Navigate to="/instructor/modules" replace /></ProtectedRoute>} />
            <Route path="/instructor/question/new" element={<ProtectedRoute role="instructor"><Navigate to="/instructor/modules" replace /></ProtectedRoute>} />
            <Route path="/instructor/question/edit/:id" element={<ProtectedRoute role="instructor"><Navigate to="/instructor/modules" replace /></ProtectedRoute>} />
            <Route path="/instructor/bulk-upload" element={<ProtectedRoute role="instructor"><Navigate to="/instructor/modules" replace /></ProtectedRoute>} />
            <Route path="/instructor/modules" element={<ProtectedRoute role="instructor"><InstructorModules /></ProtectedRoute>} />
            <Route path="/instructor/grades" element={<ProtectedRoute role="instructor"><InstructorGradebook /></ProtectedRoute>} />
            <Route path="/instructor/certificates" element={<ProtectedRoute role="instructor"><InstructorCertificates /></ProtectedRoute>} />
            <Route path="/instructor/students" element={<ProtectedRoute role="instructor"><Users /></ProtectedRoute>} />
            <Route path="/instructor/ai-drafts" element={<ProtectedRoute role="instructor"><AIDrafts /></ProtectedRoute>} />
            <Route path="/instructor/analytics" element={<ProtectedRoute role="instructor"><Analytics /></ProtectedRoute>} />
            <Route path="/instructor/classes" element={<ProtectedRoute role="instructor"><InstructorClasses /></ProtectedRoute>} />

            {/* Mobile / App Routes */}
            <Route path="/loading" element={<Loading />} />
            <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
            <Route path="/student/dashboard" element={<ProtectedRoute role="student"><StudentDashboard /></ProtectedRoute>} />
            <Route path="/student/courses" element={<ProtectedRoute role="student"><StudentCourses /></ProtectedRoute>} />
            <Route path="/student/todo" element={<ProtectedRoute role="student"><StudentTodo /></ProtectedRoute>} />
            <Route path="/onboarding" element={<ProtectedRoute role="student"><Onboarding /></ProtectedRoute>} />
            <Route path="/choose-learning-mode" element={<ProtectedRoute role="student"><ChooseLearningMode /></ProtectedRoute>} />
            <Route path="/choose-focus" element={<ProtectedRoute role="student"><ChooseFocus /></ProtectedRoute>} />
            <Route path="/join-class" element={<ProtectedRoute role="student"><JoinClass /></ProtectedRoute>} />
            <Route path="/join/:classCodeFromUrl" element={<ProtectedRoute role="student" requireOnboarded={false}><JoinClass /></ProtectedRoute>} />
            <Route path="/quest" element={<ProtectedRoute role="student"><LearningQuest /></ProtectedRoute>} />
            <Route path="/library" element={<ProtectedRoute role="student"><TextbookLibrary /></ProtectedRoute>} />
            <Route path="/diagnostic" element={<ProtectedRoute role="student"><DiagnosticAssessment /></ProtectedRoute>} />
            <Route path="/focus" element={<ProtectedRoute role="student"><Focus /></ProtectedRoute>} />
            <Route path="/quiz-results" element={<ProtectedRoute role="student"><QuizResults /></ProtectedRoute>} />
            <Route path="/exam" element={<ProtectedRoute role="student"><ExamSimulation /></ProtectedRoute>} />
            <Route path="/flashcards" element={<ProtectedRoute role="student"><Flashcards /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><ProfileSettings /></ProtectedRoute>} />
            <Route path="/profile" element={<ProtectedRoute><ProfileSettings /></ProtectedRoute>} />
            
            <Route path="*" element={<Navigate to="/sign-in" replace />} />
        </Routes>
    </Router>
  );
}

import { ThemeProvider } from './context/ThemeContext';

export default function App() {
  return (
    <ThemeProvider>
      <BrandingProvider>
        <AuthProvider>
          <SyncProvider>
            <SidebarProvider>
              <AppContent />
            </SidebarProvider>
          </SyncProvider>
        </AuthProvider>
      </BrandingProvider>
    </ThemeProvider>
  );
}


