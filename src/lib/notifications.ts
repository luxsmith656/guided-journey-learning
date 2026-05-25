import { addDoc, collection, getDocs, query, serverTimestamp, where } from 'firebase/firestore';
import { db } from './firebase';

export type NotificationRole = 'student' | 'instructor' | 'admin';

export interface NotificationPayload {
  title: string;
  body: string;
  type?: string;
  targetLink?: string;
  recipientIds?: string[];
  roleRecipients?: NotificationRole[];
  classId?: string;
  moduleId?: string;
  createdBy?: string;
  createdByEmail?: string;
}

export async function createNotification(payload: NotificationPayload) {
  const recipientIds = [...new Set(payload.recipientIds || [])].filter(Boolean);
  const roleRecipients = [...new Set(payload.roleRecipients || [])].filter(Boolean);

  if (!recipientIds.length && !roleRecipients.length) {
    throw new Error('Notification requires at least one recipient or role.');
  }

  return addDoc(collection(db, 'notifications'), {
    title: payload.title.trim(),
    body: payload.body.trim(),
    type: payload.type || 'general',
    targetLink: payload.targetLink || '',
    recipientIds,
    roleRecipients,
    classId: payload.classId || '',
    moduleId: payload.moduleId || '',
    readBy: [],
    createdBy: payload.createdBy || '',
    createdByEmail: payload.createdByEmail || '',
    createdAt: serverTimestamp(),
  });
}

export async function getClassRecipientIds(classId: string) {
  const enrollmentSnap = await getDocs(query(collection(db, 'classEnrollments'), where('classId', '==', classId)));
  return enrollmentSnap.docs.map((enrollmentDoc) => enrollmentDoc.data().studentId).filter(Boolean);
}

export async function getUserIdsFromTokens(tokens: string[]) {
  const cleaned = tokens.map((token) => token.trim()).filter(Boolean);
  const ids = cleaned.filter((token) => !token.includes('@'));
  const emails = cleaned.filter((token) => token.includes('@')).map((email) => email.toLowerCase());

  if (!emails.length) return [...new Set(ids)];

  const usersSnap = await getDocs(collection(db, 'users'));
  usersSnap.docs.forEach((userDoc) => {
    const data = userDoc.data();
    if (emails.includes(String(data.email || '').toLowerCase())) {
      ids.push(userDoc.id);
    }
  });

  return [...new Set(ids)];
}
