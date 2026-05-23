import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import AdminLayout from '../components/AdminLayout';
import { collection, onSnapshot, query, orderBy, limit, doc, getDocFromServer } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { seedDatabase } from '../lib/db-seed';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

export default function Dashboard() {
  const [counts, setCounts] = useState({
    users: 0,
    questions: 0,
    categories: 0,
    modules: 0,
    textbooks: 0,
    avgProgress: 0,
    completedModules: 0,
    recentActivity: [] as any[],
    usageData: [] as any[]
  });
  const [systemHealth, setSystemHealth] = useState<'Optimal' | 'Degraded' | 'Checking'>('Checking');
  const [healthError, setHealthError] = useState<string | null>(null);

  const [pendingUsers, setPendingUsers] = useState<any[]>([]);
  const [pendingDrafts, setPendingDrafts] = useState<any[]>([]);

  useEffect(() => {
    // Check system health
    const checkHealth = async () => {
      try {
        await getDocFromServer(doc(db, 'system', 'health'));
        setSystemHealth('Optimal');
      } catch (e: any) {
        setSystemHealth('Degraded');
        setHealthError(e.message || 'Unknown error');
      }
    };
    checkHealth();

    const unsubUsers = onSnapshot(collection(db, 'users'), (s) => {
      setCounts(prev => ({ ...prev, users: s.size }));
      // In a real app with approval, we might have a status field. 
      // For now, we show recent users as "pending" if they have no role yet? 
      // Or just actual instructors registered but not yet assigned to classes?
      // Since we don't have a specific 'pending' status yet, let's just 
      // show the most recent signups that might need review.
      const recent = s.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter((u: any) => u.role !== 'admin')
        .slice(0, 3);
      setPendingUsers(recent);
    });

    const unsubQs = onSnapshot(collection(db, 'questions'), (s) => {
      setCounts(prev => ({ ...prev, questions: s.size }));
    });

    const unsubDrafts = onSnapshot(query(collection(db, 'aiDrafts'), limit(3)), (s) => {
       setPendingDrafts(s.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const unsubCats = onSnapshot(collection(db, 'categories'), (s) => {
      setCounts(prev => ({ ...prev, categories: s.size }));
    });

    const unsubModules = onSnapshot(collection(db, 'modules'), (s) => {
      setCounts(prev => ({ ...prev, modules: s.size }));
    });

    const unsubTextbooks = onSnapshot(collection(db, 'textbooks'), (s) => {
      setCounts(prev => ({ ...prev, textbooks: s.size }));
    });

    const unsubProgress = onSnapshot(collection(db, 'moduleProgress'), (s) => {
      const progressRows = s.docs.map((doc) => doc.data());
      const avgProgress = progressRows.length
        ? Math.round(progressRows.reduce((sum, row) => sum + (row.progressPercent || 0), 0) / progressRows.length)
        : 0;
      const completedModules = progressRows.filter((row) => row.status === 'completed').length;
      setCounts(prev => ({ ...prev, avgProgress, completedModules }));
    });
    
    const unsubActivity = onSnapshot(query(collection(db, 'activityLogs'), orderBy('createdAt', 'desc'), limit(5)), (s) => {
      const activities = s.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        text: `${doc.data().action}: ${doc.data().description}`,
        time: doc.data().createdAt?.toDate().toLocaleTimeString(),
        color: 'bg-primary'
      }));
      setCounts(prev => ({ ...prev, recentActivity: activities }));
    });
    
    // Recent Usage (last 7 days based on real module progress updates)
    const usageQuery = query(collection(db, 'moduleProgress'), orderBy('lastAccessedAt', 'desc'), limit(50));
    const unsubUsage = onSnapshot(usageQuery, (s) => {
      const data: { [key: string]: number } = {};
      const now = new Date();
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        data[d.toLocaleDateString('en-US', { weekday: 'short' })] = 0;
      }
      s.docs.forEach(doc => {
        const attempt = doc.data();
        const date = attempt.lastAccessedAt?.toDate?.() || new Date(attempt.lastAccessedAt);
        const day = date.toLocaleDateString('en-US', { weekday: 'short' });
        if (data.hasOwnProperty(day)) {
          data[day]++;
        }
      });
      const chartData = Object.keys(data).map(day => ({ name: day, count: data[day] }));
      setCounts(prev => ({ ...prev, usageData: chartData }));
    });
      
    return () => { unsubUsers(); unsubQs(); unsubCats(); unsubModules(); unsubTextbooks(); unsubProgress(); unsubActivity(); unsubUsage(); unsubDrafts(); };
  }, []);

  return (
    <AdminLayout>
      <div className="p-4 md:p-6 flex-1 overflow-y-auto space-y-6 max-w-[1400px] mx-auto w-full relative z-10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-surface-container py-4">
            <div>
              <h1 className="font-headline text-2xl font-extrabold text-on-surface tracking-tight">System Overview</h1>
              <div className="flex items-center gap-2">
                <p className="font-body text-[11px] font-bold text-on-surface-variant/60 uppercase tracking-widest">Real-time Platform Monitoring</p>
              </div>
            </div>
            <div className="flex gap-3">
                <button 
                  onClick={async () => {
                    const confirmed = window.confirm('Are you sure you want to seed the database? This might take a while.');
                    if (confirmed) {
                       try {
                         await seedDatabase();
                         alert('Seeding successful!');
                       } catch (e: any) {
                         alert('Seeding failed: ' + e.message);
                       }
                    }
                  }}
                  className="bg-primary/5 px-6 py-2.5 rounded-2xl text-xs font-bold text-primary shadow-sm hover:bg-primary/10 transition-all"
                >
                  Seed Initial Content
                </button>
                <button className="bg-primary px-6 py-2.5 rounded-2xl text-xs font-bold text-on-primary shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all">Export Reports</button>
             </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pb-2">
            <div className="bg-primary rounded-3xl p-5 text-on-primary relative overflow-hidden flex flex-col justify-between min-h-[140px] shadow-2xl shadow-primary/20">
              <div className="absolute -top-6 -right-6 w-24 h-24 bg-white/10 rounded-full blur-3xl"></div>
              <p className="font-body text-[10px] font-bold uppercase tracking-[0.2em] text-on-primary/70">Users Registered</p>
              <div className="relative z-10 flex items-end justify-between">
                <div className="font-headline text-4xl font-extrabold tracking-tighter">{counts.users}</div>
                <div className="bg-white/10 rounded-full px-3 py-1 backdrop-blur-md flex items-center gap-1.5 border border-white/10">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></div>
                  <span className="text-[10px] font-bold text-on-primary uppercase tracking-widest">Live</span>
                </div>
              </div>
            </div>

            <div className="bg-surface-container-lowest rounded-3xl p-5 relative overflow-hidden flex flex-col justify-between min-h-[140px] border border-outline-variant/30 shadow-sm transition-all hover:border-primary/50 group">
              <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                <span className="material-symbols-outlined text-4xl text-primary">quiz</span>
              </div>
              <p className="font-body text-[10px] font-bold text-on-surface-variant/60 uppercase tracking-[0.2em]">Questions Bank</p>
              <div className="relative z-10 flex items-end justify-between">
                <div className="font-headline text-4xl font-extrabold text-on-surface tracking-tighter">{counts.questions}</div>
                <div className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-primary/40 group-hover:text-primary transition-colors">
                  <span className="material-symbols-outlined text-[18px]">trending_up</span>
                </div>
              </div>
            </div>

            <div className="bg-surface-container-lowest rounded-3xl p-5 relative flex flex-col justify-between min-h-[140px] border border-outline-variant/30 shadow-sm transition-all hover:border-primary/50 group">
              <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                <span className="material-symbols-outlined text-4xl text-primary">book</span>
              </div>
              <p className="font-body text-[10px] font-bold text-on-surface-variant/60 uppercase tracking-[0.2em]">Journey Modules</p>
              <div className="relative z-10">
                <div className="font-headline text-4xl font-extrabold text-on-surface tracking-tighter">{counts.modules}</div>
                <p className="text-[10px] font-bold text-on-surface-variant/50 uppercase tracking-widest mt-1">
                  {counts.textbooks} textbooks / {counts.categories} domains
                </p>
              </div>
            </div>

            <div 
              className="bg-surface-container-lowest rounded-3xl p-5 relative flex flex-col justify-between min-h-[140px] border border-outline-variant/30 shadow-sm transition-all hover:border-primary/50 group cursor-pointer"
              onClick={() => {
                if (systemHealth === 'Degraded' && healthError) {
                  console.error('System Health Detail:', healthError);
                  alert(`System Error Details: ${healthError}`);
                }
              }}
            >
              <p className="font-body text-[10px] font-bold text-on-surface-variant/60 uppercase tracking-[0.2em]">Learner Progress</p>
              <div className="relative z-10 flex items-end justify-between">
                <div>
                  <div className="font-headline text-4xl font-extrabold text-emerald-500 tracking-tighter">{counts.avgProgress}%</div>
                  <p className="text-[10px] font-bold text-on-surface-variant/50 uppercase tracking-widest mt-1">{counts.completedModules} completed modules</p>
                </div>
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[24px]">monitoring</span>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-surface-container-lowest rounded-3xl p-6 shadow-sm border border-outline-variant/30">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h2 className="font-headline text-lg font-extrabold text-on-surface tracking-tight">Active Usage</h2>
                  <p className="text-[11px] text-on-surface-variant/40 font-bold uppercase tracking-widest">Module progress updates</p>
                </div>
              </div>
              <div className="h-[250px] min-h-[250px] w-full relative">
                {counts.usageData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={counts.usageData}>
                      <XAxis dataKey="name" fontSize={10} tickLine={false} axisLine={false} />
                      <YAxis hide />
                      <Tooltip cursor={{fill: 'transparent'}} />
                      <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                        {counts.usageData.map((_entry: any, index: number) => (
                          <Cell key={`cell-${index}`} fill={index === counts.usageData.length - 1 ? '#1b366a' : '#f1f5f9'}/>
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-on-surface-variant/40 font-bold text-sm">No usage data</div>
                )}
              </div>
            </div>

            <div className="bg-surface-container-lowest rounded-3xl p-6 shadow-sm border border-outline-variant/30">
              <div className="flex justify-between items-center mb-6">
                <h2 className="font-headline text-lg font-extrabold text-on-surface tracking-tight">Recent Activity</h2>
                <Link to="/admin/activity-logs" className="text-primary font-bold text-[11px] uppercase tracking-widest hover:underline">View All</Link>
              </div>
              <div className="space-y-5">
                {counts.recentActivity.map((act, i) => (
                  <div key={i} className="flex gap-4 items-center">
                    <div className={`w-1.5 h-6 rounded-full ${act.color}`}></div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-bold text-on-surface truncate leading-tight mb-0.5">{act.text}</p>
                      <p className="text-[10px] text-on-surface-variant/40 font-medium tracking-tight leading-none">{act.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6 pb-20">
            <div className="bg-surface-container-lowest rounded-3xl p-6 shadow-sm border border-outline-variant/30">
              <div className="flex justify-between items-center mb-6">
                <h2 className="font-headline text-lg font-extrabold text-on-surface tracking-tight">Recent Signups</h2>
                <Link to="/admin/users" className="text-primary font-bold text-[11px] uppercase tracking-widest hover:underline">Manage</Link>
              </div>
              <div className="space-y-4">
                 {pendingUsers.length > 0 ? pendingUsers.map((pending, i) => (
                    <div key={i} className="flex justify-between items-center p-4 bg-surface-container/20 rounded-2xl border border-outline-variant/10 hover:border-primary/20 transition-all">
                       <div>
                          <p className="font-bold text-sm text-on-surface">{pending.fullName || 'Anonymous'}</p>
                          <p className="text-xs text-on-surface-variant/60">{pending.email} • <span className="font-semibold text-primary capitalize">{pending.role}</span></p>
                       </div>
                       <div className="flex gap-2">
                          <button className="p-2 text-emerald-500 bg-emerald-500/10 hover:bg-emerald-500/20 rounded-xl transition-colors"><span className="material-symbols-outlined text-[18px]">check</span></button>
                          <button className="p-2 text-error bg-error/10 hover:bg-error/20 rounded-xl transition-colors"><span className="material-symbols-outlined text-[18px]">close</span></button>
                       </div>
                    </div>
                 )) : (
                    <div className="text-center py-6 text-on-surface-variant/40 text-xs italic">No new signups</div>
                 )}
              </div>
            </div>

            <div className="bg-surface-container-lowest rounded-3xl p-6 shadow-sm border border-outline-variant/30">
              <div className="flex justify-between items-center mb-6">
                <h2 className="font-headline text-lg font-extrabold text-on-surface tracking-tight">Pending AI Drafts</h2>
                 <Link to="/admin/ai-drafts" className="text-primary font-bold text-[11px] uppercase tracking-widest hover:underline">Review All</Link>
              </div>
              <div className="space-y-4">
                 {pendingDrafts.length > 0 ? pendingDrafts.map((draft, i) => (
                    <div key={i} className="flex justify-between items-center p-4 bg-surface-container/10 rounded-2xl border border-outline-variant/10 hover:border-primary/20 transition-all">
                       <div className="flex-1 min-w-0 pr-4">
                          <p className="font-bold text-sm text-on-surface truncate">{draft.topic || 'AI Generated Set'}</p>
                          <p className="text-xs text-on-surface-variant/60">Difficulty: {draft.difficulty} • {draft.questions?.length} Questions</p>
                       </div>
                       <div className="flex gap-2 shrink-0">
                          <button className="px-4 py-2 text-xs font-bold text-primary bg-primary/10 hover:bg-primary/20 rounded-xl transition-colors">Review</button>
                       </div>
                    </div>
                 )) : (
                   <div className="p-4 bg-surface-container/30 rounded-2xl border border-outline-variant/10 flex items-center justify-center text-sm font-bold text-on-surface-variant/20 italic">
                      No pending content
                   </div>
                 )}
              </div>
            </div>
          </div>
        </div>
    </AdminLayout>
  );
}
