import React, { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, getDocs, onSnapshot, query, serverTimestamp, where } from 'firebase/firestore';
import { Award, CheckCircle2, ExternalLink, ShieldCheck } from 'lucide-react';
import InstructorLayout from '../components/InstructorLayout';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/firebase';
import { createNotification } from '../lib/notifications';

export default function InstructorCertificates() {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [modules, setModules] = useState<any[]>([]);
  const [progressRows, setProgressRows] = useState<any[]>([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [draft, setDraft] = useState({
    title: '',
    canvaUrl: '',
    requirements: 'Complete required modules, pass final assessments at 85%, and meet competency standards.',
    signatureName: '',
    verificationPrefix: 'LM',
  });

  useEffect(() => {
    if (!user) return;
    const unsubTemplates = onSnapshot(collection(db, 'certificateTemplates'), (snapshot) => {
      const rows = snapshot.docs.map((templateDoc) => ({ id: templateDoc.id, ...templateDoc.data() }))
        .filter((template: any) => template.createdBy === user.uid || template.ownerRole === 'admin' || user.role === 'admin');
      setTemplates(rows);
      setSelectedTemplateId((current) => current || rows[0]?.id || '');
    });
    const unsubClasses = onSnapshot(collection(db, 'classes'), (snapshot) => {
      const rows = snapshot.docs.map((classDoc) => ({ id: classDoc.id, ...classDoc.data() }))
        .filter((classItem: any) => classItem.instructorId === user.uid || classItem.instructorEmail === user.email || user.role === 'admin');
      setClasses(rows);
      setSelectedClassId((current) => current || rows[0]?.id || '');
    });
    const unsubModules = onSnapshot(collection(db, 'modules'), (snapshot) => {
      setModules(snapshot.docs.map((moduleDoc) => ({ id: moduleDoc.id, ...moduleDoc.data() })));
    });
    const unsubProgress = onSnapshot(collection(db, 'moduleProgress'), (snapshot) => {
      setProgressRows(snapshot.docs.map((progressDoc) => ({ id: progressDoc.id, ...progressDoc.data() })));
    });
    return () => {
      unsubTemplates();
      unsubClasses();
      unsubModules();
      unsubProgress();
    };
  }, [user]);

  useEffect(() => {
    async function loadStudents() {
      if (!selectedClassId) {
        setStudents([]);
        return;
      }
      const enrollSnap = await getDocs(query(collection(db, 'classEnrollments'), where('classId', '==', selectedClassId)));
      const studentIds = enrollSnap.docs.map((enrollDoc) => enrollDoc.data().studentId).filter(Boolean);
      const userSnap = await getDocs(collection(db, 'users'));
      const rows = userSnap.docs
        .map((userDoc) => ({ id: userDoc.id, ...userDoc.data() }))
        .filter((student: any) => studentIds.includes(student.id));
      setStudents(rows);
      setSelectedStudentId((current) => current || rows[0]?.id || '');
    }
    loadStudents();
  }, [selectedClassId]);

  const selectedClass = classes.find((classItem) => classItem.id === selectedClassId);
  const selectedStudent = students.find((student) => student.id === selectedStudentId);
  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId);
  const requiredModuleIds = useMemo(() => {
    const classModules = modules.filter((module) => selectedClass?.assignedModuleIds?.includes(module.id));
    const certModules = classModules.filter((module) => module.certificateEnabled);
    return (certModules.length ? certModules : classModules).map((module) => module.id);
  }, [modules, selectedClass]);
  const eligibility = useMemo(() => {
    if (!selectedStudentId) return { eligible: false, completed: 0, required: requiredModuleIds.length, missing: requiredModuleIds };
    const completedIds = requiredModuleIds.filter((moduleId) => {
      const module = modules.find((item) => item.id === moduleId);
      const progress = progressRows.find((row) => row.userId === selectedStudentId && row.moduleId === moduleId);
      const minScore = module?.unlockRules?.minScorePercent || 85;
      return progress?.status === 'completed' && (progress.firstFinalScore ?? progress.finalScore ?? 0) >= minScore;
    });
    return {
      eligible: requiredModuleIds.length > 0 && completedIds.length === requiredModuleIds.length,
      completed: completedIds.length,
      required: requiredModuleIds.length,
      missing: requiredModuleIds.filter((moduleId) => !completedIds.includes(moduleId)),
    };
  }, [selectedStudentId, requiredModuleIds, progressRows, modules]);

  const createTemplate = async () => {
    if (!user || !draft.title.trim()) return;
    await addDoc(collection(db, 'certificateTemplates'), {
      ...draft,
      title: draft.title.trim(),
      requirements: draft.requirements.trim(),
      signatureName: draft.signatureName.trim(),
      createdBy: user.uid,
      createdByEmail: user.email,
      ownerRole: 'instructor',
      status: 'active',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    setDraft((current) => ({ ...current, title: '', canvaUrl: '' }));
  };

  const issueCertificate = async () => {
    if (!user || !selectedStudent || !selectedTemplate || !eligibility.eligible) return;
    const certificateId = `${selectedTemplate.verificationPrefix || 'LM'}-${Date.now().toString(36).toUpperCase()}-${selectedStudent.id.slice(0, 4).toUpperCase()}`;
    const verificationUrl = `${window.location.origin}/verify/${certificateId}`;
    await addDoc(collection(db, 'certificates'), {
      certificateId,
      verificationUrl,
      templateId: selectedTemplate.id,
      templateTitle: selectedTemplate.title,
      canvaUrl: selectedTemplate.canvaUrl || '',
      studentId: selectedStudent.id,
      studentEmail: selectedStudent.email,
      studentName: selectedStudent.fullName || selectedStudent.email,
      classId: selectedClassId,
      className: selectedClass?.className || '',
      requiredModuleIds,
      signatureName: selectedTemplate.signatureName || user.fullName || user.email,
      issuedBy: user.uid,
      issuedByEmail: user.email,
      status: 'verified',
      issuedAt: serverTimestamp(),
    });
    await createNotification({
      title: `Certificate issued: ${selectedTemplate.title}`,
      body: `Your instructor issued your certificate. Certificate ID: ${certificateId}`,
      type: 'certificate_issued',
      targetLink: verificationUrl,
      recipientIds: [selectedStudent.id],
      createdBy: user.uid,
      createdByEmail: user.email,
    });
    alert(`Certificate issued: ${certificateId}`);
  };

  return (
    <InstructorLayout title="Certificates">
      <div className="p-4 md:p-8 max-w-7xl mx-auto w-full text-on-surface space-y-6">
        <section className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 shadow-sm">
          <p className="text-xs font-black uppercase tracking-widest text-primary mb-2">Credential studio</p>
          <h1 className="text-3xl font-extrabold font-headline">Certificates</h1>
          <p className="text-sm text-on-surface-variant mt-2">Design templates, connect Canva certificates, check completion requirements, and issue verifiable certificate IDs.</p>
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-[1fr_420px] gap-6">
          <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 shadow-sm space-y-4">
            <h2 className="font-headline font-extrabold text-xl">Design certificate template</h2>
            <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="Certificate title" className="input" />
            <input value={draft.canvaUrl} onChange={(event) => setDraft({ ...draft, canvaUrl: event.target.value })} placeholder="Canva design or certificate URL" className="input" />
            <textarea value={draft.requirements} onChange={(event) => setDraft({ ...draft, requirements: event.target.value })} rows={4} className="input resize-none" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input value={draft.signatureName} onChange={(event) => setDraft({ ...draft, signatureName: event.target.value })} placeholder="Signature name" className="input" />
              <input value={draft.verificationPrefix} onChange={(event) => setDraft({ ...draft, verificationPrefix: event.target.value })} placeholder="Certificate ID prefix" className="input" />
            </div>
            <button onClick={createTemplate} className="rounded-xl bg-primary text-on-primary px-5 py-3 text-sm font-bold">Save template</button>
          </div>

          <aside className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 shadow-sm space-y-4">
            <h2 className="font-headline font-extrabold text-xl flex items-center gap-2"><ShieldCheck size={20} className="text-primary" /> Issue certificate</h2>
            <select value={selectedClassId} onChange={(event) => { setSelectedClassId(event.target.value); setSelectedStudentId(''); }} className="input font-bold">
              {classes.map((classItem) => <option key={classItem.id} value={classItem.id}>{classItem.className}</option>)}
            </select>
            <select value={selectedStudentId} onChange={(event) => setSelectedStudentId(event.target.value)} className="input font-bold">
              {students.map((student) => <option key={student.id} value={student.id}>{student.fullName || student.email}</option>)}
            </select>
            <select value={selectedTemplateId} onChange={(event) => setSelectedTemplateId(event.target.value)} className="input font-bold">
              {templates.map((template) => <option key={template.id} value={template.id}>{template.title}</option>)}
            </select>
            <div className={`rounded-2xl border p-4 ${eligibility.eligible ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-amber-500/30 bg-amber-500/10'}`}>
              <p className="text-sm font-extrabold text-on-surface">{eligibility.completed}/{eligibility.required} required modules complete</p>
              <p className="text-xs text-on-surface-variant/70 mt-1">{eligibility.eligible ? 'Ready to issue.' : 'Certificate stays locked until module finals and competency gates are passed.'}</p>
            </div>
            <button disabled={!eligibility.eligible || !selectedTemplate} onClick={issueCertificate} className="w-full rounded-xl bg-primary text-on-primary px-5 py-3 text-sm font-bold disabled:opacity-50">
              Issue verified certificate
            </button>
          </aside>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {templates.map((template) => (
            <article key={template.id} className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-5 shadow-sm">
              <p className="text-xs font-black uppercase tracking-widest text-primary mb-2">{template.verificationPrefix || 'LM'} template</p>
              <h2 className="font-extrabold text-on-surface">{template.title}</h2>
              <p className="text-sm text-on-surface-variant mt-1">{template.requirements}</p>
              <div className="flex flex-wrap gap-2 mt-4">
                <span className="rounded-full bg-surface-container px-3 py-1 text-xs font-bold text-on-surface-variant">Signature: {template.signatureName || 'Not set'}</span>
                {template.canvaUrl && <a href={template.canvaUrl} target="_blank" rel="noreferrer" className="rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-bold inline-flex items-center gap-1">Open Canva <ExternalLink size={12} /></a>}
              </div>
            </article>
          ))}
          {templates.length === 0 && (
            <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-10 text-center text-on-surface-variant/40 font-bold">
              No certificate templates yet.
            </div>
          )}
        </section>
      </div>
    </InstructorLayout>
  );
}
