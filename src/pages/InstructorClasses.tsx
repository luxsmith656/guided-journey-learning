import React, { useState, useEffect } from 'react';
import InstructorLayout from '../components/InstructorLayout';
import { useAuth } from '../context/AuthContext';
import { collection, query, where, getDocs, doc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Users, Plus, Copy, Search, ArrowRight, Settings } from 'lucide-react';
import { motion } from 'motion/react';
import { useNavigate } from 'react-router-dom';

export default function InstructorClasses() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [classes, setClasses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [viewDetailsId, setViewDetailsId] = useState<string | null>(null);

  // New class form
  const [newClass, setNewClass] = useState({
    className: '',
    description: '',
    focus: 'general_education',
    specializationName: '',
    classCode: ''
  });
  const [codeError, setCodeError] = useState('');

  const generateClassCode = () => {
    return 'LM-' + Math.random().toString(36).substring(2, 8).toUpperCase();
  };

  useEffect(() => {
    if (showCreateModal && !newClass.classCode) {
      setNewClass(prev => ({ ...prev, classCode: generateClassCode() }));
    }
  }, [showCreateModal]);

  const validateCode = (code: string) => {
    const regex = /^LM-[A-Z0-9]{6}$/;
    if (!regex.test(code)) {
      return 'Format must be LM-XXXXXX (e.g., LM-ABC123)';
    }
    return '';
  };

  const loadClasses = async () => {
    if (!user) return;
    try {
      const byUid = query(collection(db, 'classes'), where('instructorId', '==', user.uid), where('status', '==', 'active'));
      const byEmail = query(collection(db, 'classes'), where('instructorEmail', '==', user.email), where('status', '==', 'active'));
      const [uidSnap, emailSnap] = await Promise.all([getDocs(byUid), getDocs(byEmail)]);
      const merged = new Map<string, any>();
      [...uidSnap.docs, ...emailSnap.docs].forEach(d => merged.set(d.id, {id: d.id, ...d.data()}));
      setClasses(Array.from(merged.values()));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadClasses();
  }, [user]);

  const handleCreate = async () => {
    if (!user || !newClass.className || !newClass.classCode) return;
    
    const error = validateCode(newClass.classCode);
    if (error) {
      setCodeError(error);
      return;
    }

    try {
      setLoading(true);
      
      // Check for uniqueness
      const q = query(collection(db, 'classes'), where('classCode', '==', newClass.classCode), where('status', '==', 'active'));
      const snap = await getDocs(q);
      if (!snap.empty) {
        setCodeError('This class code is already in use.');
        setLoading(false);
        return;
      }

      const classRef = doc(collection(db, 'classes'));
      const payload = {
        classId: classRef.id,
        className: newClass.className,
        description: newClass.description,
        instructorId: user.uid,
        instructorEmail: user.email,
        instructorName: user.fullName || user.email,
        classCode: newClass.classCode,
        inviteLink: `${window.location.origin}/join/${newClass.classCode}`,
        focus: newClass.focus,
        specializationName: newClass.specializationName,
        assignedModuleIds: [],
        assignedQuestionSetIds: [],
        studentCount: 0,
        status: 'active',
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      await setDoc(classRef, payload);
      setShowCreateModal(false);
      setNewClass({ className: '', description: '', focus: 'general_education', specializationName: '', classCode: '' });
      setCodeError('');
      await loadClasses();
    } catch (e) {
      console.error(e);
      alert('Failed to create class');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyLink = (link: string) => {
    navigator.clipboard.writeText(link);
    alert('Invite link copied!');
  };

  return (
    <InstructorLayout title="Class Management">
      <div className="p-8 max-w-6xl mx-auto w-full text-on-surface">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <div>
            <h2 className="text-3xl font-extrabold text-primary font-headline tracking-tight">My Classes</h2>
            <p className="text-on-surface-variant/60 font-medium">Manage your enrolled students and class curriculum.</p>
          </div>
          <button 
            onClick={() => setShowCreateModal(true)}
            className="bg-primary text-on-primary px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:opacity-90 transition-all shadow-lg shadow-primary/20"
          >
            <Plus size={20} /> Create Class
          </button>
        </div>

        {loading ? (
          <div className="text-center p-12 text-on-surface-variant/40 font-bold">Loading classes...</div>
        ) : classes.length === 0 ? (
           <div className="bg-surface-container-lowest p-12 rounded-3xl border border-outline-variant shadow-sm text-center">
             <div className="w-20 h-20 bg-primary/10 text-primary rounded-full flex items-center justify-center mx-auto mb-6">
                <Users size={40} />
             </div>
             <h3 className="text-xl font-bold text-on-surface mb-2">No Classes Yet</h3>
             <p className="text-on-surface-variant/60 mb-8 max-w-sm mx-auto">Create your first class to generate an invite code and start enrolling students.</p>
             <button 
               onClick={() => setShowCreateModal(true)}
               className="bg-primary text-on-primary px-6 py-3 rounded-xl font-bold transition-all shadow-lg shadow-primary/20 inline-flex"
             >
               Create Class
             </button>
           </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {classes.map(cls => (
               <div key={cls.id} className="bg-surface-container-lowest rounded-2xl border border-outline-variant shadow-sm overflow-hidden flex flex-col group transition-all hover:border-primary/50">
                 <div className="p-6 border-b border-outline-variant/10 flex-1">
                   <div className="flex justify-between items-start mb-4">
                     <div className="bg-emerald-500/10 text-emerald-500 px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest border border-emerald-500/10">{cls.focus.replace('_', ' ')}</div>
                     <button className="text-on-surface-variant/40 hover:text-on-surface transition-colors"><Settings size={18} /></button>
                   </div>
                   <h3 className="font-bold text-xl text-on-surface mb-1">{cls.className}</h3>
                   <p className="text-sm text-on-surface-variant/60 mb-6 line-clamp-2">{cls.description || 'No description provided.'}</p>
                   
                   <div className="flex items-center justify-between text-sm">
                     <span className="flex items-center gap-1.5 text-on-surface-variant/60 font-medium">
                       <Users size={16} className="text-on-surface-variant/40" />
                       {cls.studentCount} Enrolled
                     </span>
                   </div>
                 </div>
                 <div className="bg-surface-container/30 p-4 flex items-center justify-between">
                   <div className="flex flex-col">
                     <span className="text-[10px] font-bold uppercase text-on-surface-variant/40 tracking-widest leading-none mb-1">Class Code</span>
                     <span className="font-mono font-bold text-on-surface text-lg leading-none">{cls.classCode}</span>
                   </div>
                   <button 
                     onClick={() => handleCopyLink(cls.inviteLink)}
                     className="p-2 bg-surface-container-lowest rounded-lg border border-outline-variant text-on-surface-variant/60 hover:text-primary hover:border-primary transition-all shadow-sm flex items-center gap-2"
                     title="Copy Invite Link"
                   >
                     <Copy size={16} /> <span className="text-xs font-bold sm:hidden md:inline">Link</span>
                   </button>
                 </div>
               </div>
            ))}
          </div>
        )}
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-surface-dim/80 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-surface-container-lowest rounded-3xl p-8 max-w-lg w-full shadow-2xl border border-outline-variant"
          >
            <h3 className="text-2xl font-extrabold text-on-surface mb-2">Create New Class</h3>
            <p className="text-on-surface-variant/40 text-sm font-medium mb-6">Fill in the details to setup your virtual classroom.</p>
            
            <div className="space-y-4 mb-8">
              <div>
                <label className="text-[10px] font-bold text-on-surface-variant/40 uppercase tracking-widest ml-1 mb-1 block">Class Name</label>
                <input 
                  type="text" 
                  value={newClass.className}
                  onChange={e => setNewClass({...newClass, className: e.target.value})}
                  className="w-full bg-surface-container border border-outline-variant/30 rounded-xl px-4 py-3 text-sm font-semibold text-on-surface focus:bg-surface-container-lowest focus:border-primary/30 outline-none transition-all placeholder:text-on-surface-variant/20"
                  placeholder="e.g. LET Professional Ed 2026 Cohort"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-on-surface-variant/40 uppercase tracking-widest ml-1 mb-1 block">Description</label>
                <textarea 
                  value={newClass.description}
                  onChange={e => setNewClass({...newClass, description: e.target.value})}
                  className="w-full bg-surface-container border border-outline-variant/30 rounded-xl px-4 py-3 text-sm text-on-surface focus:bg-surface-container-lowest focus:border-primary/30 outline-none transition-all resize-none h-24 placeholder:text-on-surface-variant/20"
                  placeholder="Optional class description..."
                ></textarea>
              </div>
              <div>
                <label className="text-[10px] font-bold text-on-surface-variant/40 uppercase tracking-widest ml-1 mb-1 block">Class Code</label>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    value={newClass.classCode}
                    onChange={e => {
                      const val = e.target.value.toUpperCase();
                      setNewClass({...newClass, classCode: val});
                      if (codeError) setCodeError('');
                    }}
                    className={`flex-1 bg-surface-container border ${codeError ? 'border-error/50' : 'border-outline-variant/30'} rounded-xl px-4 py-3 text-sm font-mono font-bold text-on-surface focus:bg-surface-container-lowest focus:border-primary/30 outline-none transition-all`}
                    placeholder="LM-ABC123"
                  />
                  <button 
                    onClick={() => setNewClass({...newClass, classCode: generateClassCode()})}
                    className="px-4 bg-surface-container text-on-surface-variant/60 rounded-xl font-bold text-xs hover:bg-surface-container-high transition-colors"
                  >
                    Regen
                  </button>
                </div>
                {codeError && <p className="text-[10px] text-error font-bold mt-1 ml-1">{codeError}</p>}
              </div>

              <div>
                <label className="text-[10px] font-bold text-on-surface-variant/40 uppercase tracking-widest ml-1 mb-1 block">Primary Focus</label>
                <select 
                  value={newClass.focus}
                  onChange={e => setNewClass({...newClass, focus: e.target.value})}
                  className="w-full bg-surface-container border border-outline-variant/30 rounded-xl px-4 py-3 text-sm font-semibold text-on-surface focus:bg-surface-container-lowest focus:border-primary/30 outline-none transition-all"
                >
                  <option value="general_education">General Education</option>
                  <option value="professional_education">Professional Education</option>
                  <option value="major_specialization">Major / Specialization</option>
                  <option value="full_let_review">Full LET Review</option>
                </select>
              </div>
              {newClass.focus === 'major_specialization' && (
                <div>
                  <label className="text-[10px] font-bold text-on-surface-variant/40 uppercase tracking-widest ml-1 mb-1 block">Specialization Name</label>
                  <input 
                    type="text" 
                    value={newClass.specializationName}
                    onChange={e => setNewClass({...newClass, specializationName: e.target.value})}
                    className="w-full bg-surface-container border border-outline-variant/30 rounded-xl px-4 py-3 text-sm font-semibold text-on-surface focus:bg-surface-container-lowest focus:border-primary/30 outline-none transition-all placeholder:text-on-surface-variant/20"
                    placeholder="e.g. Major in English"
                  />
                </div>
              )}
            </div>
            
            <div className="flex gap-3">
               <button 
                 onClick={() => setShowCreateModal(false)}
                 className="flex-1 font-bold text-on-surface-variant/40 py-3 hover:bg-surface-container rounded-xl transition-colors"
               >
                 Cancel
               </button>
               <button 
                 onClick={handleCreate}
                 disabled={!newClass.className}
                 className="flex-[2] bg-primary text-on-primary font-bold py-3 rounded-xl shadow-lg hover:opacity-90 transition-all disabled:opacity-50"
               >
                 Create Class
               </button>
            </div>
          </motion.div>
        </div>
      )}
    </InstructorLayout>
  );
}
