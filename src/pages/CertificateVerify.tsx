import React, { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { Award, ShieldCheck } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { db } from '../lib/firebase';

export default function CertificateVerify() {
  const { certificateId } = useParams();
  const [certificate, setCertificate] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadCertificate() {
      if (!certificateId) return;
      const snap = await getDocs(query(collection(db, 'certificates'), where('certificateId', '==', certificateId)));
      setCertificate(snap.docs[0] ? { id: snap.docs[0].id, ...snap.docs[0].data() } : null);
      setLoading(false);
    }
    loadCertificate();
  }, [certificateId]);

  return (
    <div className="min-h-screen bg-surface text-on-surface flex items-center justify-center p-6">
      <main className="w-full max-w-2xl bg-surface-container-lowest border border-outline-variant rounded-3xl p-8 shadow-sm text-center">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-5">
          {certificate ? <ShieldCheck size={34} /> : <Award size={34} />}
        </div>
        {loading ? (
          <p className="font-bold text-on-surface-variant">Checking certificate...</p>
        ) : certificate ? (
          <>
            <p className="text-xs font-black uppercase tracking-widest text-primary mb-2">Verified certificate</p>
            <h1 className="text-3xl font-extrabold font-headline">{certificate.templateTitle}</h1>
            <p className="text-on-surface-variant mt-3">Issued to <span className="font-bold text-on-surface">{certificate.studentName || certificate.studentEmail}</span></p>
            <p className="text-on-surface-variant mt-1">Class: {certificate.className || 'Learning cohort'}</p>
            <div className="rounded-2xl bg-surface-container border border-outline-variant/40 p-4 mt-6">
              <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/50">Certificate ID</p>
              <p className="font-mono font-black text-xl text-primary mt-1">{certificate.certificateId}</p>
            </div>
            <p className="text-xs text-on-surface-variant/60 mt-5">Status: {certificate.status || 'verified'} / Signature: {certificate.signatureName || 'Instructor'}</p>
          </>
        ) : (
          <>
            <p className="text-xs font-black uppercase tracking-widest text-error mb-2">Not found</p>
            <h1 className="text-3xl font-extrabold font-headline">Certificate could not be verified</h1>
            <p className="text-on-surface-variant mt-3">Check the certificate ID and try again.</p>
          </>
        )}
      </main>
    </div>
  );
}
