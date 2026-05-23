import { openDB, DBSchema, IDBPDatabase } from 'idb';

interface LetMasteryDB extends DBSchema {
  localQuestions: {
    key: string;
    value: any;
    indexes: { 'by-category': string; 'by-topic': string };
  };
  localModules: {
    key: string;
    value: any;
    indexes: { 'by-category': string };
  };
  localCategories: {
    key: string;
    value: any;
  };
  localTopics: {
    key: string;
    value: any;
    indexes: { 'by-category': string };
  };
  localSkills: {
    key: string;
    value: any;
    indexes: { 'by-topic': string };
  };
  localQuizAttempts: {
    key: string;
    value: any;
    indexes: { 'by-synced': number }; // 0 for unsynced, 1 for synced
  };
  localProgress: {
    key: string;
    value: any;
  };
  localNotes: {
    key: string;
    value: any;
    indexes: { 'by-module': string; 'by-synced': number };
  };
  localRecallChallenges: {
    key: string;
    value: any;
    indexes: { 'by-topic': string; 'by-synced': number };
  };
  localStudyPlan: {
    key: string;
    value: any;
    indexes: { 'by-user': string };
  };
  syncQueue: {
    key: string;
    value: any;
    indexes: { 'by-status': string };
  };
  contentVersion: {
    key: string;
    value: any;
  };
}

export async function initDB(): Promise<IDBPDatabase<LetMasteryDB>> {
  return openDB<LetMasteryDB>('LetMasteryDB', 2, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('localQuestions')) {
        const store = db.createObjectStore('localQuestions', { keyPath: 'id' });
        store.createIndex('by-category', 'categoryId');
        store.createIndex('by-topic', 'topicId');
      }
      if (!db.objectStoreNames.contains('localModules')) {
        const store = db.createObjectStore('localModules', { keyPath: 'id' });
        store.createIndex('by-category', 'categoryId');
      }
      if (!db.objectStoreNames.contains('localCategories')) {
        db.createObjectStore('localCategories', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('localTopics')) {
        const store = db.createObjectStore('localTopics', { keyPath: 'id' });
        store.createIndex('by-category', 'categoryId');
      }
      if (!db.objectStoreNames.contains('localSkills')) {
        const store = db.createObjectStore('localSkills', { keyPath: 'id' });
        store.createIndex('by-topic', 'topicId');
      }
      if (!db.objectStoreNames.contains('localQuizAttempts')) {
        const store = db.createObjectStore('localQuizAttempts', { keyPath: 'localAttemptId' });
        store.createIndex('by-synced', 'synced');
      }
      if (!db.objectStoreNames.contains('localProgress')) {
        db.createObjectStore('localProgress', { keyPath: 'userId' });
      }
      if (!db.objectStoreNames.contains('localNotes')) {
        const store = db.createObjectStore('localNotes', { keyPath: 'id' });
        store.createIndex('by-module', 'moduleId');
        store.createIndex('by-synced', 'synced');
      }
      if (!db.objectStoreNames.contains('localRecallChallenges')) {
        const store = db.createObjectStore('localRecallChallenges', { keyPath: 'id' });
        store.createIndex('by-topic', 'topicId');
        store.createIndex('by-synced', 'synced');
      }
      if (!db.objectStoreNames.contains('localStudyPlan')) {
        const store = db.createObjectStore('localStudyPlan', { keyPath: 'id' });
        store.createIndex('by-user', 'userId');
      }
      if (!db.objectStoreNames.contains('syncQueue')) {
        const store = db.createObjectStore('syncQueue', { keyPath: 'id' });
        store.createIndex('by-status', 'status');
      }
      if (!db.objectStoreNames.contains('contentVersion')) {
        db.createObjectStore('contentVersion', { keyPath: 'id' });
      }
    },
  });
}
