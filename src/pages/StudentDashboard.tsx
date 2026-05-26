import React, { useState, useEffect } from 'react';
import StudentLayout from '../components/StudentLayout';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { 
  BookOpen, 
  Trophy, 
  Clock, 
  BarChart, 
  Target,
  ChevronRight,
  Brain, Award, Users, BookMarked,
  PlayCircle, FileText
} from 'lucide-react';
import { motion } from 'motion/react';
import { journeyModules } from '../lib/learningJourney';
import { buildStudyPlan, getRecallInsights } from '../lib/learningInsights';

export default function StudentDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [profile, setProfile] = useState<any>(null);
  const [classData, setClassData] = useState<any>(null);
  const [assignedModules, setAssignedModules] = useState<any[]>([]);
  const [progressByModuleState, setProgressByModuleState] = useState<Record<string, any>>({});
  const [gradeSummary, setGradeSummary] = useState({ avgScore: 0, completed: 0, rank: 0 });
  const [analytics, setAnalytics] = useState({
    mastery: 0,
    timeSpent: '0 hrs',
    streak: 0,
    completedLessons: 0
  });

  useEffect(() => {
    const fetchData = async () => {
      if (!user) return;
      try {
        const profileSnap = await getDoc(doc(db, 'learnerProfiles', user.uid));
        if (profileSnap.exists()) {
          const p = profileSnap.data();
          setProfile(p);
          
          setAnalytics(prev => ({
             ...prev,
             mastery: p.overallScore || 0,
             streak: user.streak || 0,
          }));
        }

        // Simulating fetching active courses/modules workflow
        const progressSnap = await getDocs(query(collection(db, 'moduleProgress'), where('userId', '==', user.uid)));
        const progressByModule = new Map(progressSnap.docs.map((progressDoc) => [progressDoc.data().moduleId, progressDoc.data()]));
        setProgressByModuleState(Object.fromEntries(progressByModule));
        const scoredRows = progressSnap.docs.map((progressDoc) => progressDoc.data()).filter((row) => row.finalScore != null);
        setGradeSummary({
          avgScore: scoredRows.length ? Math.round(scoredRows.reduce((sum, row) => sum + (row.finalScore || 0), 0) / scoredRows.length) : 0,
          completed: scoredRows.filter((row) => row.status === 'completed' && (row.finalScore ?? 0) >= 85).length,
          rank: 0,
        });

        if (user.learningMode === 'class_based' && user.activeClassId) {
          const classRef = await getDoc(doc(db, 'classes', user.activeClassId));
          if (classRef.exists()) {
            const data = classRef.data();
            setClassData(data);
            
            if (data.assignedModuleIds && data.assignedModuleIds.length > 0) {
              const mods: any[] = [];
              for (const mid of data.assignedModuleIds) {
                 const localModule = journeyModules.find(module => module.id === mid);
                 try {
                   const modSnap = await getDoc(doc(db, 'modules', mid));
                   const moduleData = modSnap.exists() ? modSnap.data() : localModule;
                   mods.push({
                     id: mid,
                     title: moduleData?.title || localModule?.title || `Module ${mid.substring(0,4)}`,
                     duration: moduleData?.duration || localModule?.duration,
                     dueAt: moduleData?.dueAt || '',
                     parts: moduleData?.parts || localModule?.parts || [],
                     examBlueprint: moduleData?.examBlueprint || localModule?.examBlueprint,
                     status: progressByModule.get(mid)?.status === 'completed' && (progressByModule.get(mid)?.finalScore ?? 0) >= 85 ? 'Completed' : progressByModule.get(mid)?.phase === 'finalExam' ? 'Final Exam' : 'In Progress',
                     progress: progressByModule.get(mid)?.progressPercent ?? localModule?.progress ?? 0
                   });
                 } catch {
                   mods.push({
                     id: mid,
                     title: localModule?.title || `Module ${mid.substring(0,4)}`,
                     status: progressByModule.get(mid)?.status === 'completed' ? 'Completed' : 'In Progress',
                     progress: progressByModule.get(mid)?.progressPercent ?? localModule?.progress ?? 0
                   });
                 }
              }
              setAssignedModules(mods);
            }
          }
        } else {
           // Self study fallback mock modules
           setAssignedModules(journeyModules.slice(0, 3).map(module => ({
             id: module.id,
             title: module.title,
             status: progressByModule.get(module.id)?.status === 'completed' && (progressByModule.get(module.id)?.finalScore ?? 0) >= 85 ? 'Completed' : module.status === 'available' ? 'Ready' : 'In Progress',
             duration: module.duration,
             dueAt: (module as any).dueAt || '',
             parts: module.parts || [],
             examBlueprint: (module as any).examBlueprint,
             progress: progressByModule.get(module.id)?.progressPercent ?? module.progress
           })));
        }
      } catch (e) {
        console.error('Failed to fetch dashboard data', e);
      }
    };
    fetchData();
  }, [user]);

  const weakTopicLabel = profile?.weakTopics?.[0]
    || Object.entries(profile?.masteryByTopic || {}).sort((a: any, b: any) => a[1] - b[1])[0]?.[0]
    || 'your weakest topic';
  const nextModule = assignedModules.find((module) => module.progress < 100) || assignedModules[0];
  const recallInsights = getRecallInsights(profile);
  const studyPlan = buildStudyPlan({ modules: assignedModules, recallInsights, weakTopicLabel, progressByModule: progressByModuleState });

  return (
    <StudentLayout title="Dashboard">
      <div className="space-y-8">
        
        {/* Welcome & Overview Banner */}
        <div className="relative overflow-hidden bg-surface-container-lowest border border-outline-variant rounded-3xl p-8 flex flex-col md:flex-row items-center justify-between shadow-sm">
           <div className="z-10 w-full md:w-2/3">
              <h1 className="text-3xl font-extrabold font-headline text-on-surface mb-2">Welcome back, {user?.fullName?.split(' ')[0] || 'Learner'}! 👋</h1>
              <p className="text-on-surface-variant font-medium text-sm max-w-xl leading-relaxed mb-6">
                 You are currently on a <span className="font-bold text-amber-500">{analytics.streak} day learning streak</span>. 
                 Your next assigned task is waiting. Let's continue mastering your curriculum.
              </p>
              <button 
                 onClick={() => navigate('/student/courses')}
                 className="bg-primary text-on-primary px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:opacity-90 active:scale-95 transition-all shadow-md shadow-primary/20 text-sm"
              >
                 Resume Course <ChevronRight size={16} />
              </button>
           </div>
           
           <div className="hidden md:flex gap-6 z-10 shrink-0">
              <div className="bg-surface-container rounded-2xl p-5 border border-outline-variant shadow-sm w-36 flex flex-col items-center justify-center text-center">
                 <div className="w-12 h-12 bg-indigo-500/10 text-indigo-500 rounded-full flex items-center justify-center mb-3">
                    <Target size={24} />
                 </div>
                 <p className="text-2xl font-extrabold font-headline leading-none">{analytics.mastery}%</p>
                 <p className="text-[10px] font-bold text-on-surface-variant/50 uppercase tracking-widest mt-1">Mastery</p>
              </div>
              <div className="bg-surface-container rounded-2xl p-5 border border-outline-variant shadow-sm w-36 flex flex-col items-center justify-center text-center">
                 <div className="w-12 h-12 bg-amber-500/10 text-amber-500 rounded-full flex items-center justify-center mb-3">
                    <Trophy size={24} />
                 </div>
                 <p className="text-2xl font-extrabold font-headline leading-none">{analytics.streak}</p>
                 <p className="text-[10px] font-bold text-on-surface-variant/50 uppercase tracking-widest mt-1">Day Streak</p>
              </div>
           </div>
           
           {/* Decorative Background */}
           <div className="absolute right-0 top-0 w-1/2 h-full opacity-5 pointer-events-none overflow-hidden">
              <BookOpen className="absolute -right-10 -top-10 w-64 h-64 text-on-surface rotate-12" />
           </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
           {/* Left Column: Active Modules & Path */}
           <div className="lg:col-span-2 space-y-8">
              
              {/* Active Courses / Modules */}
              <section>
                 <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-extrabold font-headline text-on-surface flex items-center gap-2">
                       <BookMarked className="text-primary" size={22} />
                       My Active Courses
                    </h2>
                    <button onClick={() => navigate('/student/courses')} className="text-primary text-xs font-bold uppercase tracking-widest hover:underline">View All</button>
                 </div>
                 
                 <div className="space-y-4">
                    {assignedModules.map((module, idx) => (
                       <div key={idx} className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-5 shadow-sm group hover:border-primary/40 transition-colors">
                          <div className="flex items-start justify-between mb-4">
                             <div>
                                <span className="inline-block px-2.5 py-1 bg-surface-container text-[10px] font-bold uppercase tracking-widest rounded-md text-on-surface-variant mb-2">Module</span>
                                <h3 className="font-bold text-lg text-on-surface leading-tight mb-1">{module.title}</h3>
                                <p className="text-xs font-medium text-on-surface-variant flex items-center gap-1.5">
                                   <Clock size={12} /> {module.status} • 3 Lessons left
                                </p>
                             </div>
                             <button
                               onClick={() => navigate(`/quest?moduleId=${module.id}`)}
                               className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center group-hover:bg-primary group-hover:text-on-primary transition-colors shrink-0"
                             >
                                <PlayCircle size={20} style={{ fontVariationSettings: "'FILL' 1" }} />
                             </button>
                          </div>
                          
                          <div className="flex items-center gap-3">
                             <div className="flex-1 h-2 bg-surface-container rounded-full overflow-hidden">
                                <div className="h-full bg-primary rounded-full transition-all duration-1000" style={{ width: `${module.progress}%` }}></div>
                             </div>
                             <span className="text-xs font-bold text-on-surface">{module.progress}%</span>
                          </div>
                          
                          {module.progress > 0 && module.progress < 100 && (
                             <div className="mt-4 pt-4 border-t border-outline-variant flex items-center gap-2 text-xs font-medium text-on-surface-variant">
                                <FileText size={14} className="text-tertiary" /> Up next: <span className="text-on-surface font-bold truncate max-w-[200px]">Historical Foundations</span>
                             </div>
                          )}
                       </div>
                    ))}
                 </div>
              </section>

              {/* AI Study Recommendations */}
              <section className="bg-secondary-container/20 border border-secondary-container/30 rounded-2xl p-6 shadow-sm">
                 <div className="flex items-center gap-3 mb-5">
                    <div className="w-10 h-10 bg-surface-container rounded-xl flex items-center justify-center text-primary shadow-sm border border-outline-variant/30">
                       <Brain size={20} />
                    </div>
                    <div>
                       <h2 className="text-lg font-extrabold font-headline text-on-surface leading-tight">AI Study Assistant</h2>
                       <p className="text-xs text-on-surface-variant font-medium">Personalized recommendations based on your progress</p>
                    </div>
                 </div>
                 
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {recallInsights[0] && (
                      <div className="bg-surface-container-lowest rounded-xl p-4 border border-outline-variant shadow-sm hover:border-primary/30 transition-colors cursor-pointer md:col-span-2" onClick={() => navigate('/flashcards')}>
                         <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-bold bg-primary/10 text-primary px-2 py-0.5 rounded uppercase tracking-widest">Recall Due</span>
                            <Clock size={14} className="text-primary" />
                         </div>
                         <h4 className="font-bold text-sm text-on-surface mb-1">Your mastery in {recallInsights[0].topicId} is getting weaker.</h4>
                         <p className="text-[11px] text-on-surface-variant leading-relaxed">Mastery faded from {recallInsights[0].mastery}% to about {recallInsights[0].decayedMastery}% after {recallInsights[0].daysSinceReview} days without review. Take a quick recall challenge.</p>
                      </div>
                    )}
                    <div className="bg-surface-container-lowest rounded-xl p-4 border border-outline-variant shadow-sm hover:border-amber-500/30 transition-colors cursor-pointer" onClick={() => navigate('/flashcards')}>
                       <div className="flex items-center justify-between mb-2">
                          <span className="text-[10px] font-bold bg-amber-500/10 text-amber-600 px-2 py-0.5 rounded uppercase tracking-widest">Review Needed</span>
                          <Brain size={14} className="text-amber-500" />
                       </div>
                       <h4 className="font-bold text-sm text-on-surface mb-1">{weakTopicLabel}</h4>
                       <p className="text-[11px] text-on-surface-variant leading-relaxed">Based on your diagnostic and module scores, review flashcards tied to your class modules and weak topics.</p>
                    </div>
                    <div className="bg-surface-container-lowest rounded-xl p-4 border border-outline-variant shadow-sm hover:border-emerald-500/30 transition-colors cursor-pointer" onClick={() => navigate(nextModule ? `/quest?moduleId=${nextModule.id}` : '/student/courses')}>
                       <div className="flex items-center justify-between mb-2">
                          <span className="text-[10px] font-bold bg-emerald-500/10 text-emerald-600 px-2 py-0.5 rounded uppercase tracking-widest">Next Best Step</span>
                          <Target size={14} className="text-emerald-500" />
                       </div>
                       <h4 className="font-bold text-sm text-on-surface mb-1">{nextModule?.title || 'Continue your learning journey'}</h4>
                       <p className="text-[11px] text-on-surface-variant leading-relaxed">Continue the module that best matches your current class path and progress.</p>
                    </div>
                 </div>
              </section>

           </div>

           {/* Right Column: Deadlines, Activity, Quick Actions */}
           <div className="space-y-6">
              {(classData?.showGradesToStudents || classData?.leaderboardEnabled) && (
                <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 shadow-sm">
                  <h3 className="font-extrabold font-headline text-on-surface mb-4 flex items-center gap-2">
                    <Award size={18} className="text-primary" /> Class Grade View
                  </h3>
                  {classData?.showGradesToStudents && (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-surface-container rounded-xl p-4 border border-outline-variant/30">
                        <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/50">Avg Score</p>
                        <p className="text-2xl font-black text-on-surface mt-1">{gradeSummary.avgScore}%</p>
                      </div>
                      <div className="bg-surface-container rounded-xl p-4 border border-outline-variant/30">
                        <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/50">Passed</p>
                        <p className="text-2xl font-black text-on-surface mt-1">{gradeSummary.completed}</p>
                      </div>
                    </div>
                  )}
                  {classData?.leaderboardEnabled && (
                    <div className="mt-3 rounded-xl bg-primary/10 text-primary border border-primary/20 p-3 text-xs font-bold">
                      Leaderboard is enabled for this class. Rankings are managed by your instructor.
                    </div>
                  )}
                </div>
              )}
              
              {/* Personal Study Planner */}
              <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 shadow-sm">
                 <h3 className="font-extrabold font-headline text-on-surface mb-4 flex items-center gap-2">
                    <Clock size={18} className="text-on-surface-variant/60" /> Weekly study plan
                 </h3>
                 <p className="text-xs text-on-surface-variant/60 mb-4">Built from deadlines, module length, quiz difficulty, weak areas, and your current pace.</p>
                 <div className="space-y-4">
                    {studyPlan.map((item, index) => (
                      <button key={`${item.title}-${index}`} onClick={() => navigate(item.targetLink)} className="w-full flex gap-4 text-left">
                         <div className="flex flex-col items-center min-w-10">
                            <span className={`text-[10px] font-bold uppercase tracking-widest ${item.priority === 'high' ? 'text-error' : item.priority === 'medium' ? 'text-primary' : 'text-on-surface-variant/50'}`}>{item.dayLabel || (index === 0 ? 'Today' : index === 1 ? 'Next' : 'Later')}</span>
                            <span className="text-xl font-extrabold text-on-surface">{index + 1}</span>
                         </div>
                         <div className="bg-surface-container border border-outline-variant/40 p-3 rounded-xl flex-1 hover:border-primary/40 transition-colors">
                            <p className="text-xs font-bold text-on-surface leading-tight mb-1">{item.title}</p>
                            <p className="text-[10px] text-on-surface-variant font-medium">{item.body}</p>
                            {item.minutes && <p className="text-[10px] text-primary font-black uppercase tracking-widest mt-2">{item.minutes} min</p>}
                         </div>
                      </button>
                    ))}
                 </div>
              </div>

              {/* Performance Stats */}
              <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 shadow-sm">
                 <h3 className="font-extrabold font-headline text-on-surface mb-5 flex items-center gap-2">
                    <BarChart size={18} className="text-on-surface-variant/60" /> Performance
                 </h3>
                 <div className="space-y-4">
                    {[{ label: 'Assessment Avg', val: '84%', color: 'bg-primary' }, { label: 'Flashcard Retention', val: '92%', color: 'bg-tertiary' }, { label: 'Completion Rate', val: '45%', color: 'bg-indigo-500' }].map((stat, i) => (
                       <div key={i}>
                          <div className="flex justify-between text-xs font-bold mb-2">
                             <span className="text-on-surface-variant uppercase tracking-widest">{stat.label}</span>
                             <span className="text-on-surface">{stat.val}</span>
                          </div>
                          <div className="h-1.5 w-full bg-surface-container rounded-full overflow-hidden">
                             <div className={`h-full ${stat.color} rounded-full`} style={{ width: stat.val }}></div>
                          </div>
                       </div>
                    ))}
                 </div>
                 <button onClick={() => navigate('/quiz-results')} className="w-full mt-6 text-center text-xs font-bold text-primary bg-primary/5 hover:bg-primary/10 py-2.5 rounded-xl transition-colors">
                    View Advanced Analytics
                 </button>
              </div>

           </div>
        </div>
      </div>
    </StudentLayout>
  );
}
