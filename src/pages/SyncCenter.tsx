import React, { useState, useEffect } from 'react';
import AdminLayout from '../components/AdminLayout';
import { useAuth } from '../context/AuthContext';
import { SyncManager } from '../lib/offline/SyncManager';
import { getSeedHealth, seedDatabase, SeedHealthReport } from '../lib/db-seed';
import Toast from '../components/Toast';
import { RefreshCw, CloudDownload, CloudAlert, Database, CheckCircle2, History } from 'lucide-react';

export default function SyncCenter() {
  const { user } = useAuth();
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [seedHealth, setSeedHealth] = useState<SeedHealthReport | null>(null);

  useEffect(() => {
    SyncManager.getLastSyncTime().then(setLastSync);
  }, []);

  const refreshSeedHealth = async () => {
    if (user?.role !== 'admin') return;
    try {
      setSeedHealth(await getSeedHealth());
    } catch (error) {
      console.warn('Unable to load seed health', error);
      setSeedHealth(null);
    }
  };

  useEffect(() => {
    void refreshSeedHealth();
  }, [user?.role]);

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      await SyncManager.pullAllContent(user?.selectedFocus);
      const time = await SyncManager.getLastSyncTime();
      setLastSync(time);
      setToastMsg('Sync complete! content is now available offline.');
      setShowToast(true);
    } catch (err: any) {
      setToastMsg(`Sync failed: ${err.message}`);
      setShowToast(true);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSeed = async () => {
    setIsSeeding(true);
    try {
      await seedDatabase();
      await refreshSeedHealth();
      setToastMsg('System data seeded successfully!');
      setShowToast(true);
    } catch (err: any) {
      setToastMsg(`Seed failed: ${err.message}`);
      setShowToast(true);
    } finally {
      setIsSeeding(false);
    }
  };

  if (user?.role !== 'admin') {
     // Student Sync View
     return (
        <div className="bg-slate-50 min-h-screen text-slate-800">
           <header className="bg-white px-6 py-4 flex items-center justify-between border-b border-slate-100 shadow-sm sticky top-0 z-10">
              <h2 className="font-headline font-bold text-lg tracking-tight">Offline Sync Manager</h2>
              <button 
                 onClick={handleSync}
                 disabled={isSyncing}
                 className="bg-[#1b366a] text-white px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest flex items-center gap-2 hover:bg-[#112349] transition-all disabled:opacity-50 shadow-lg shadow-blue-900/10"
              >
                 <RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} />
                 {isSyncing ? 'Syncing...' : 'Sync Now'}
              </button>
           </header>

           <div className="p-6 max-w-md mx-auto space-y-6">
              <div className="bg-white rounded-3xl p-8 text-center shadow-xl shadow-blue-900/5 border border-white">
                 <div className={`w-20 h-20 rounded-full mx-auto flex items-center justify-center mb-6 ${lastSync ? 'bg-emerald-50 text-emerald-500' : 'bg-amber-50 text-amber-500'}`}>
                    {lastSync ? <CloudDownload size={40} /> : <CloudAlert size={40} />}
                 </div>
                 <h1 className="text-2xl font-black font-headline mb-2 text-slate-800 tracking-tight">
                    {lastSync ? 'You\'re Good to Go!' : 'Content Pending Sync'}
                 </h1>
                 <p className="text-sm text-slate-500 font-medium leading-relaxed mb-6">
                    Download latest mock exams, modules, and review questions to keep studying even without internet.
                 </p>
                 
                 <div className="grid grid-cols-1 gap-2">
                    <div className="flex items-center justify-between px-5 py-4 bg-slate-50 rounded-2xl border border-slate-100">
                       <div className="flex items-center gap-3">
                          <History size={18} className="text-blue-600" />
                          <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Last Sync</span>
                       </div>
                       <span className="text-sm font-black text-slate-800">
                          {lastSync ? new Date(lastSync).toLocaleString() : 'Never'}
                       </span>
                    </div>
                    <div className="flex items-center justify-between px-5 py-4 bg-slate-50 rounded-2xl border border-slate-100">
                       <div className="flex items-center gap-3">
                          <Database size={18} className="text-blue-600" />
                          <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Focus Mode</span>
                       </div>
                       <span className="text-sm font-black text-slate-800 uppercase">
                          {user?.selectedFocus || 'Core'}
                       </span>
                    </div>
                 </div>
              </div>

              <div className="space-y-4">
                 <div className="flex items-center gap-3 px-2">
                    <CheckCircle2 size={20} className="text-emerald-500" />
                    <h3 className="font-bold text-slate-800 text-sm">Automated Features</h3>
                 </div>
                 <div className="space-y-3">
                    <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-start gap-3">
                       <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                          <RefreshCw size={16} />
                       </div>
                       <div>
                          <p className="text-xs font-bold text-slate-800 mb-0.5">Auto-update</p>
                          <p className="text-[10px] text-slate-400 font-medium">Syncs when online connection is stable.</p>
                       </div>
                    </div>
                 </div>
              </div>
           </div>

           <Toast 
            isVisible={showToast}
            message={toastMsg}
            onClose={() => setShowToast(false)}
            type={toastMsg.toLowerCase().includes('failed') ? 'error' : 'success'}
          />
        </div>
     );
  }

  return (
    <AdminLayout title="Global Sync & Data">
      <div className="p-8 max-w-5xl mx-auto py-12">
            <div className="flex justify-between items-end mb-8">
               <div>
                  <h1 className="text-3xl font-extrabold font-headline mb-2">Offline Sync</h1>
                  <p className="text-on-surface-variant">Seed public LET curriculum and check whether modules, questions, and blueprints are ready.</p>
               </div>
               <div className="flex gap-3">
                  <button 
                    onClick={handleSeed}
                    disabled={isSeeding}
                    className="bg-blue-600 text-white hover:bg-blue-700 transition-colors px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 text-sm shadow-lg shadow-blue-900/20 disabled:opacity-50"
                  >
                     <span className={`material-symbols-outlined text-[18px] ${isSeeding ? 'animate-spin' : ''}`}>
                       {isSeeding ? 'sync' : 'database'}
                     </span> 
                     {isSeeding ? 'Seeding Data...' : 'Seed System Data'}
                  </button>
                  <button onClick={() => void refreshSeedHealth()} className="bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors px-4 py-2 rounded-xl font-bold flex items-center gap-2 text-sm">
                     <span className="material-symbols-outlined text-[18px]">refresh</span> Refresh Health
                  </button>
               </div>
            </div>

             <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="bg-surface-container-lowest p-6 rounded-2xl shadow-sm border border-outline-variant">
                   <div className="flex items-center gap-3 mb-2 text-on-surface">
                      <span className="material-symbols-outlined text-primary">cloud_done</span>
                      <h3 className="font-headline font-bold">Public Modules</h3>
                   </div>
                   <p className="text-2xl font-black text-on-surface mb-1">{seedHealth?.counts.publishedModules ?? 0}</p>
                   <p className="text-xs text-on-surface-variant/40">Published Firestore modules</p>
                </div>
                <div className="bg-surface-container-lowest p-6 rounded-2xl shadow-sm border border-outline-variant">
                   <div className="flex items-center gap-3 mb-2 text-on-surface">
                      <span className="material-symbols-outlined text-indigo-500">data_usage</span>
                      <h3 className="font-headline font-bold">Approved Questions</h3>
                   </div>
                   <p className="text-2xl font-black text-on-surface mb-1">{seedHealth?.counts.approvedQuestions ?? 0}</p>
                   <p className="text-xs text-on-surface-variant/40">Available to exam blueprints</p>
                </div>
                <div className="bg-surface-container-lowest p-6 rounded-2xl shadow-sm border border-outline-variant">
                   <div className="flex items-center gap-3 mb-2 text-on-surface">
                      <span className="material-symbols-outlined text-error">rule_settings</span>
                      <h3 className="font-headline font-bold">Active Blueprints</h3>
                   </div>
                   <p className="text-2xl font-black text-on-surface mb-1">{seedHealth?.counts.activeBlueprints ?? 0}</p>
                   <p className={`text-xs font-medium ${seedHealth?.warnings.length ? 'text-error' : 'text-on-surface-variant/40'}`}>
                     {seedHealth?.warnings.length ? `${seedHealth.warnings.length} health warning${seedHealth.warnings.length === 1 ? '' : 's'}` : 'Ready'}
                   </p>
                </div>
             </div>

             <div className="bg-surface-container-lowest rounded-3xl p-8 border border-outline-variant shadow-sm relative overflow-hidden">
                <div className={`absolute top-0 left-0 w-1.5 h-full ${seedHealth?.warnings.length ? 'bg-error' : 'bg-emerald-500'}`}></div>
                <h3 className="text-xl font-headline font-bold text-on-surface mb-6 flex items-center gap-3">
                   <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${seedHealth?.warnings.length ? 'bg-error/10 text-error' : 'bg-emerald-500/10 text-emerald-600'}`}>
                     <span className="material-symbols-outlined">{seedHealth?.warnings.length ? 'warning' : 'verified'}</span>
                   </div>
                   Seed Health
                </h3>
                
                <div className="space-y-4">
                   {(seedHealth?.warnings || []).length === 0 ? (
                     <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-sm font-bold text-emerald-700">
                       Public curriculum, approved questions, textbooks, and exam blueprints are present.
                     </div>
                   ) : seedHealth?.warnings.map((warning) => (
                     <div key={warning} className="p-4 rounded-xl border border-error/10 bg-error/5 text-sm font-bold text-error">
                       {warning}
                     </div>
                   ))}
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                     {(seedHealth?.blueprintCoverage || []).map((blueprint) => (
                       <div key={blueprint.id} className="rounded-xl border border-outline-variant/40 bg-surface-container/30 p-4">
                         <p className="text-xs font-black uppercase tracking-widest text-on-surface-variant/50">{blueprint.status === 'ready' ? 'Ready' : 'Needs questions'}</p>
                         <h4 className="mt-1 font-bold text-on-surface">{blueprint.title}</h4>
                         <p className="mt-2 text-xs text-on-surface-variant">{blueprint.available} approved available / {blueprint.required} required</p>
                       </div>
                     ))}
                   </div>
                </div>
             </div>
         </div>

      <Toast 
        isVisible={showToast}
        message={toastMsg}
        onClose={() => setShowToast(false)}
        type={toastMsg.toLowerCase().includes('failed') ? 'error' : 'success'}
      />
    </AdminLayout>
  );
}
