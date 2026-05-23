import { useEffect, useMemo, useState } from 'react';
import { arrayUnion, collection, doc, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/firebase';

export interface AppNotification {
  id: string;
  title?: string;
  subject?: string;
  body?: string;
  description?: string;
  targetLink?: string;
  recipientIds?: string[];
  roleRecipients?: string[];
  readBy?: string[];
  status?: string;
  type?: string;
  createdAt?: any;
}

function getCreatedAtMillis(item: AppNotification) {
  if (item.createdAt?.toMillis) return item.createdAt.toMillis();
  if (typeof item.createdAt === 'number') return item.createdAt;
  if (typeof item.createdAt === 'string') return new Date(item.createdAt).getTime();
  return 0;
}

export function isNotificationRead(item: AppNotification, userId?: string) {
  if (!userId) return false;
  if (Array.isArray(item.readBy) && item.readBy.includes(userId)) return true;
  return item.status === 'read';
}

export function useNotifications() {
  const { user } = useAuth();
  const [directItems, setDirectItems] = useState<AppNotification[]>([]);
  const [roleItems, setRoleItems] = useState<AppNotification[]>([]);

  useEffect(() => {
    if (!user?.uid) {
      setDirectItems([]);
      return;
    }

    const directQuery = query(collection(db, 'notifications'), where('recipientIds', 'array-contains', user.uid));
    return onSnapshot(directQuery, (snapshot) => {
      setDirectItems(snapshot.docs.map((itemDoc) => ({ id: itemDoc.id, ...itemDoc.data() })));
    }, (error) => {
      console.warn('Direct notification listener failed', error);
      setDirectItems([]);
    });
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.role) {
      setRoleItems([]);
      return;
    }

    const roleQuery = query(collection(db, 'notifications'), where('roleRecipients', 'array-contains', user.role));
    return onSnapshot(roleQuery, (snapshot) => {
      setRoleItems(snapshot.docs.map((itemDoc) => ({ id: itemDoc.id, ...itemDoc.data() })));
    }, (error) => {
      console.warn('Role notification listener failed', error);
      setRoleItems([]);
    });
  }, [user?.role]);

  const items = useMemo(() => {
    const merged = new Map<string, AppNotification>();
    [...directItems, ...roleItems].forEach((item) => merged.set(item.id, item));
    return [...merged.values()].sort((a, b) => getCreatedAtMillis(b) - getCreatedAtMillis(a));
  }, [directItems, roleItems]);

  const unreadItems = useMemo(
    () => items.filter((item) => !isNotificationRead(item, user?.uid)),
    [items, user?.uid]
  );

  const markRead = async (id: string) => {
    if (!user?.uid) return;
    await updateDoc(doc(db, 'notifications', id), {
      readBy: arrayUnion(user.uid),
    });
  };

  return {
    items,
    unreadItems,
    unreadCount: unreadItems.length,
    markRead,
    isRead: (item: AppNotification) => isNotificationRead(item, user?.uid),
  };
}
