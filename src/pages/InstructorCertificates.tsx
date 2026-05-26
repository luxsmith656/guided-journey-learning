import React, { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, getDocs, onSnapshot, query, serverTimestamp, where } from 'firebase/firestore';
import { Award, ExternalLink, ShieldCheck } from 'lucide-react';
import InstructorLayout from '../components/InstructorLayout';
import Toast from '../components/Toast';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/firebase';
import { createNotification } from '../lib/notifications';

const defaultCertificateBody = 'has successfully completed the required learning journey, passed the final assessments, and demonstrated competency standards for this class.';

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
  const [toastMsg, setToastMsg] = useState('');
  const [showToast, setShowToast] = useState(false);
  const [draft, setDraft] = useState({
    title: '',
    canvaUrl: '',
    requirements: 'Complete required modules, pass final assessments at 85%, and meet competency standards.',
    bodyText: defaultCertificateBody,
    signatureName: '',
    verificationPrefix: 'LM',
    leftLogoUrl: '',
    rightLogoUrl: '',
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
  const previewTemplate = selectedTemplate || {
    ...draft,
    title: draft.title || 'LET Mastery Certificate',
    signatureName: draft.signatureName || user?.fullName || user?.email || 'Lead Instructor',
    verificationPrefix: draft.verificationPrefix || 'LM',
  };

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
    if (!user || !draft.title.trim()) {
      setToastMsg('Certificate title is required.');
      setShowToast(true);
      return;
    }
    await addDoc(collection(db, 'certificateTemplates'), {
      ...draft,
      title: draft.title.trim(),
      requirements: draft.requirements.trim(),
      bodyText: draft.bodyText.trim() || defaultCertificateBody,
      signatureName: draft.signatureName.trim(),
      leftLogoUrl: draft.leftLogoUrl.trim(),
      rightLogoUrl: draft.rightLogoUrl.trim(),
      verificationPrefix: draft.verificationPrefix.trim() || 'LM',
      createdBy: user.uid,
      createdByEmail: user.email,
      ownerRole: 'instructor',
      status: 'active',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    setDraft((current) => ({ ...current, title: '', canvaUrl: '' }));
    setToastMsg('Certificate template saved.');
    setShowToast(true);
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
      leftLogoUrl: selectedTemplate.leftLogoUrl || '',
      rightLogoUrl: selectedTemplate.rightLogoUrl || '',
      bodyText: selectedTemplate.bodyText || defaultCertificateBody,
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
    setToastMsg(`Certificate issued: ${certificateId}`);
    setShowToast(true);
  };

  return (
    <InstructorLayout title="Certificates">
      <div className="p-4 md:p-8 max-w-7xl mx-auto w-full text-on-surface space-y-6">
        <section className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 shadow-sm">
          <p className="text-xs font-black uppercase tracking-widest text-primary mb-2">Credential studio</p>
          <h1 className="text-3xl font-extrabold font-headline">Certificates</h1>
          <p className="text-sm text-on-surface-variant mt-2">Design templates, connect Canva certificates, check completion requirements, and issue verifiable certificate IDs.</p>
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-6">
          <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 shadow-sm space-y-4">
            <h2 className="font-headline font-extrabold text-xl">Design certificate template</h2>
            <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="Certificate title" className="input" />
            <input value={draft.canvaUrl} onChange={(event) => setDraft({ ...draft, canvaUrl: event.target.value })} placeholder="Canva design or certificate URL" className="input" />
            <textarea value={draft.requirements} onChange={(event) => setDraft({ ...draft, requirements: event.target.value })} rows={3} className="input resize-none" />
            <textarea value={draft.bodyText} onChange={(event) => setDraft({ ...draft, bodyText: event.target.value })} rows={3} className="input resize-none" placeholder="Certificate body text" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input value={draft.leftLogoUrl} onChange={(event) => setDraft({ ...draft, leftLogoUrl: event.target.value })} placeholder="Left logo image URL" className="input" />
              <input value={draft.rightLogoUrl} onChange={(event) => setDraft({ ...draft, rightLogoUrl: event.target.value })} placeholder="Right logo image URL" className="input" />
              <input value={draft.signatureName} onChange={(event) => setDraft({ ...draft, signatureName: event.target.value })} placeholder="Signature name" className="input" />
              <input value={draft.verificationPrefix} onChange={(event) => setDraft({ ...draft, verificationPrefix: event.target.value })} placeholder="Certificate ID prefix" className="input" />
            </div>
            <button onClick={createTemplate} className="rounded-xl bg-primary text-on-primary px-5 py-3 text-sm font-bold">Save template</button>
          </div>

          <div className="space-y-5">
            <CertificateBlueprintPreview
              template={previewTemplate}
              studentName={selectedStudent?.fullName || selectedStudent?.email || 'Learner Name'}
              certificateId={`${previewTemplate.verificationPrefix || 'LM'}-2026-SAMPLE`}
              className={selectedClass?.className || 'Class / Learning Journey'}
            />
            <aside className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 shadow-sm space-y-4">
              <h2 className="font-headline font-extrabold text-xl flex items-center gap-2"><ShieldCheck size={20} className="text-primary" /> Issue certificate</h2>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                <select value={selectedClassId} onChange={(event) => { setSelectedClassId(event.target.value); setSelectedStudentId(''); }} className="input font-bold">
                  {classes.map((classItem) => <option key={classItem.id} value={classItem.id}>{classItem.className}</option>)}
                </select>
                <select value={selectedStudentId} onChange={(event) => setSelectedStudentId(event.target.value)} className="input font-bold">
                  {students.map((student) => <option key={student.id} value={student.id}>{student.fullName || student.email}</option>)}
                </select>
                <select value={selectedTemplateId} onChange={(event) => setSelectedTemplateId(event.target.value)} className="input font-bold">
                  {templates.map((template) => <option key={template.id} value={template.id}>{template.title}</option>)}
                </select>
              </div>
              <div className={`rounded-2xl border p-4 ${eligibility.eligible ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-amber-500/30 bg-amber-500/10'}`}>
                <p className="text-sm font-extrabold text-on-surface">{eligibility.completed}/{eligibility.required} required modules complete</p>
                <p className="text-xs text-on-surface-variant/70 mt-1">{eligibility.eligible ? 'Ready to issue.' : 'Certificate stays locked until module finals and competency gates are passed.'}</p>
              </div>
              <button disabled={!eligibility.eligible || !selectedTemplate} onClick={issueCertificate} className="w-full rounded-xl bg-primary text-on-primary px-5 py-3 text-sm font-bold disabled:opacity-50">
                Issue verified certificate
              </button>
            </aside>
          </div>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {templates.map((template) => (
            <button key={template.id} onClick={() => setSelectedTemplateId(template.id)} className={`text-left bg-surface-container-lowest border rounded-2xl p-5 shadow-sm ${selectedTemplateId === template.id ? 'border-primary ring-1 ring-primary/30' : 'border-outline-variant'}`}>
              <p className="text-xs font-black uppercase tracking-widest text-primary mb-2">{template.verificationPrefix || 'LM'} template</p>
              <h2 className="font-extrabold text-on-surface">{template.title}</h2>
              <p className="text-sm text-on-surface-variant mt-1">{template.requirements}</p>
              <div className="flex flex-wrap gap-2 mt-4">
                <span className="rounded-full bg-surface-container px-3 py-1 text-xs font-bold text-on-surface-variant">Signature: {template.signatureName || 'Not set'}</span>
                {template.canvaUrl && <a href={template.canvaUrl} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()} className="rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-bold inline-flex items-center gap-1">Open Canva <ExternalLink size={12} /></a>}
              </div>
            </button>
          ))}
          {templates.length === 0 && (
            <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-10 text-center text-on-surface-variant/40 font-bold">
              No certificate templates yet. The preview above shows the default blueprint you can save.
            </div>
          )}
        </section>
      </div>
      <Toast
        isVisible={showToast}
        message={toastMsg}
        onClose={() => setShowToast(false)}
        type={toastMsg.includes('required') ? 'error' : 'success'}
      />
    </InstructorLayout>
  );
}

function CertificateBlueprintPreview({
  template,
  studentName,
  certificateId,
  className,
}: {
  template: any;
  studentName: string;
  certificateId: string;
  className: string;
}) {
  return (
    <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4 shadow-sm">
      <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-primary">Built-in blueprint preview</p>
          <h2 className="font-headline text-2xl font-black text-on-surface">{template.title || 'LET Mastery Certificate'}</h2>
        </div>
        {template.canvaUrl && (
          <a href={template.canvaUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-surface-container px-4 py-2 text-sm font-bold text-on-surface">
            Open Canva
            <ExternalLink size={14} />
          </a>
        )}
      </div>
      <div
        className="relative aspect-[1.414/1] overflow-hidden border border-slate-200 bg-white p-[5%] text-slate-950 shadow-sm"
        style={{
          backgroundImage: 'linear-gradient(to right, rgba(15,23,42,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(15,23,42,0.06) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      >
        <CornerMark position="top-left" />
        <CornerMark position="top-right" />
        <CornerMark position="bottom-left" />
        <CornerMark position="bottom-right" />

        <div className="flex items-start justify-between gap-6 border-b border-slate-300 pb-6">
          <div className="flex items-center gap-4">
            <LogoBox url={template.leftLogoUrl} label="Left logo" />
            <div>
              <p className="text-[clamp(9px,1.1vw,14px)] font-black uppercase tracking-[0.35em]">Certificate of Completion</p>
              <p className="mt-2 font-headline text-[clamp(18px,2vw,30px)] font-black">{template.title || 'LET Mastery Certificate'}</p>
              <p className="mt-1 text-[clamp(9px,0.9vw,12px)] font-semibold uppercase tracking-[0.18em] text-slate-500">{className}</p>
            </div>
          </div>
          <div className="text-right">
            <LogoBox url={template.rightLogoUrl} label="Right logo" alignRight />
            <p className="mt-3 text-[clamp(9px,0.9vw,12px)] font-black uppercase tracking-[0.25em]">ID: {certificateId}</p>
            <p className="mt-1 text-[clamp(9px,0.8vw,11px)] font-bold uppercase text-slate-500">Scale: 1:1</p>
          </div>
        </div>

        <div className="flex h-[52%] flex-col items-center justify-center text-center">
          <p className="text-[clamp(10px,1vw,15px)] uppercase tracking-[0.32em] text-slate-700">This document certifies that</p>
          <p className="mt-6 font-headline text-[clamp(30px,4.3vw,62px)] font-black leading-none">{studentName}</p>
          <p className="mt-8 max-w-[72%] text-[clamp(11px,1.25vw,18px)] leading-relaxed text-slate-700">{template.bodyText || defaultCertificateBody}</p>
        </div>

        <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-8 border-t border-slate-300 pt-6">
          <div>
            <p className="font-headline text-[clamp(16px,1.8vw,26px)] font-black italic">{template.signatureName || 'Lead Instructor'}</p>
            <div className="mt-3 h-px bg-slate-300" />
            <p className="mt-3 text-[clamp(8px,0.85vw,11px)] font-black uppercase tracking-[0.28em]">Lead Instructor</p>
          </div>
          <div className="flex aspect-square w-[clamp(58px,8vw,110px)] items-center justify-center rounded-2xl border border-slate-950 bg-slate-50 text-[clamp(8px,0.9vw,12px)] font-black uppercase tracking-[0.25em]">Seal</div>
          <div className="text-right">
            <p className="font-mono text-[clamp(11px,1.2vw,17px)]">{new Date().toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' })}</p>
            <div className="mt-3 h-px bg-slate-300" />
            <p className="mt-3 text-[clamp(8px,0.85vw,11px)] font-black uppercase tracking-[0.28em]">Date issued</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function LogoBox({ url, label, alignRight = false }: { url?: string; label: string; alignRight?: boolean }) {
  return (
    <div className={`flex h-[clamp(38px,5.6vw,74px)] w-[clamp(38px,5.6vw,74px)] shrink-0 items-center justify-center border border-slate-950 bg-slate-950 text-white ${alignRight ? 'ml-auto' : ''}`}>
      {url ? (
        <img src={url} alt={label} className="h-full w-full object-contain bg-white" />
      ) : (
        <Award size={28} />
      )}
    </div>
  );
}

function CornerMark({ position }: { position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' }) {
  const classes = {
    'top-left': 'left-8 top-8 border-l-2 border-t-2',
    'top-right': 'right-8 top-8 border-r-2 border-t-2',
    'bottom-left': 'bottom-8 left-8 border-b-2 border-l-2',
    'bottom-right': 'bottom-8 right-8 border-b-2 border-r-2',
  };
  return <span className={`absolute h-5 w-5 border-slate-950 ${classes[position]}`} />;
}
