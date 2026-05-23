import React, { useEffect, useState } from 'react';
import { addDoc, collection, onSnapshot, serverTimestamp } from 'firebase/firestore';
import AdminLayout from '../components/AdminLayout';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';

export default function AdminCertificates() {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<any[]>([]);
  const [draft, setDraft] = useState({
    title: '',
    requirements: 'Complete required modules, pass final assessments at 85%, and meet competency standards.',
    signatureName: '',
    verificationPrefix: 'LM',
  });

  useEffect(() => {
    return onSnapshot(collection(db, 'certificateTemplates'), (snapshot) => {
      setTemplates(snapshot.docs.map((templateDoc) => ({ id: templateDoc.id, ...templateDoc.data() })));
    });
  }, []);

  const createTemplate = async () => {
    if (!user || !draft.title.trim()) return;
    await addDoc(collection(db, 'certificateTemplates'), {
      ...draft,
      title: draft.title.trim(),
      requirements: draft.requirements.trim(),
      signatureName: draft.signatureName.trim(),
      createdBy: user.uid,
      createdByEmail: user.email,
      status: 'active',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    setDraft((current) => ({ ...current, title: '', signatureName: '' }));
  };

  return (
    <AdminLayout title="Certificates">
      <div className="p-4 md:p-8 max-w-6xl mx-auto w-full text-on-surface space-y-6">
        <section className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 shadow-sm">
          <p className="text-xs font-black uppercase tracking-widest text-primary mb-2">Credential manager</p>
          <h1 className="text-3xl font-extrabold font-headline">Certificate templates</h1>
          <p className="text-sm text-on-surface-variant mt-2">Define certificate requirements, signatures, and verification ID prefixes for TESDA-style completion credentials.</p>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6">
          <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 shadow-sm space-y-4">
            <h2 className="font-headline font-extrabold text-xl">Create certificate template</h2>
            <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="Certificate title" className="input" />
            <textarea value={draft.requirements} onChange={(event) => setDraft({ ...draft, requirements: event.target.value })} rows={4} placeholder="Requirements" className="input resize-none" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input value={draft.signatureName} onChange={(event) => setDraft({ ...draft, signatureName: event.target.value })} placeholder="Signature name" className="input" />
              <input value={draft.verificationPrefix} onChange={(event) => setDraft({ ...draft, verificationPrefix: event.target.value })} placeholder="Verification prefix" className="input" />
            </div>
            <button onClick={createTemplate} className="rounded-xl bg-primary text-on-primary px-5 py-3 text-sm font-bold">Save template</button>
          </div>

          <aside className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-5 shadow-sm h-fit">
            <p className="font-extrabold text-on-surface">Unlock rule</p>
            <p className="text-xs text-on-surface-variant/60 mt-2">A certificate should be issued only after required modules are complete, final assessments are passed, and competency standards are met. This page stores the template and requirements; issuance can use these rules next.</p>
          </aside>
        </section>

        <section className="space-y-3">
          {templates.map((template) => (
            <article key={template.id} className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-5 shadow-sm">
              <p className="text-xs font-black uppercase tracking-widest text-primary mb-2">{template.verificationPrefix || 'LM'} verification</p>
              <h2 className="font-extrabold text-on-surface">{template.title}</h2>
              <p className="text-sm text-on-surface-variant mt-1">{template.requirements}</p>
              <p className="text-xs text-on-surface-variant/50 mt-3">Signature: {template.signatureName || 'Not set'}</p>
            </article>
          ))}
          {templates.length === 0 && (
            <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-10 text-center text-on-surface-variant/40 font-bold">
              No certificate templates yet.
            </div>
          )}
        </section>
      </div>
    </AdminLayout>
  );
}
