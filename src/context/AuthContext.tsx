import React, { createContext, useContext, useState, useEffect } from 'react';
import { onAuthStateChanged, User as FirebaseUser, signOut as firebaseSignOut } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

type Role = 'admin' | 'instructor' | 'student' | null;

interface UserProfile {
  email: string;
  role: Role;
  uid: string;
  fullName?: string;
  age?: number;
  instructorId?: string;
  onboarded?: boolean;
  learningMode?: 'class_based' | 'self_review' | null;
  classIds?: string[];
  activeClassId?: string | null;
  selectedFocus?: string | null;
  reviewTrack?: 'elementary' | 'secondary' | 'specialization' | null;
  specialization?: string;
  targetExamDate?: string | null;
  diagnosticCompleted?: boolean;
  diagnosticSkipped?: boolean;
  streak?: number;
  lastLoginDate?: string;
  earnedBadges?: string[];
  archivedModuleIds?: string[];
  archivedClassIds?: string[];
  xp?: number;
  level?: number;
}

interface AuthContextType {
  user: UserProfile | null;
  signOut: () => void;
  isLoading: boolean;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = async () => {
    if (auth.currentUser) {
      const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
      if (userDoc.exists()) {
        const userData = userDoc.data() as UserProfile;
        const isAdminEmail = auth.currentUser.email === 'castanar656@gmail.com';
        const currentRole = isAdminEmail ? 'admin' : userData.role;
        setUser({ ...userData, uid: auth.currentUser.uid, role: currentRole || 'student' });
      }
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const isAdminEmail = firebaseUser.email === 'castanar656@gmail.com';
        const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
        
        if (userDoc.exists()) {
          const userData = userDoc.data() as UserProfile;
          const currentRole = isAdminEmail ? 'admin' : userData.role;

          setUser({ ...userData, uid: firebaseUser.uid, role: (currentRole as Role) || 'student' });

          if (isAdminEmail && userData.role !== 'admin') {
            updateDoc(doc(db, 'users', firebaseUser.uid), { role: 'admin' })
              .catch(err => console.error('Silent role upgrade failed:', err));
          }
        } else {
          // Check if a profile with this email already exists (from seeding)
          const { collection, query, where, getDocs, deleteDoc } = await import('firebase/firestore');
          const emailQuery = query(collection(db, 'users'), where('email', '==', firebaseUser.email));
          const emailSnap = await getDocs(emailQuery);
          
          let existingData: any = {};
          if (!emailSnap.empty) {
            // Claim this profile
            const seedDoc = emailSnap.docs[0];
            existingData = seedDoc.data();
            // Delete the seeded doc with the wrong ID
            await deleteDoc(seedDoc.ref);
          }

          let pendingDataStr = null;
          try {
            pendingDataStr = localStorage.getItem('pendingRegistrationData');
          } catch(e) { console.warn(e); }
          
          let pendingData: any = {};
          if (pendingDataStr) {
            try {
              pendingData = JSON.parse(pendingDataStr);
            } catch (e) {
              console.error('Failed to parse pending registration data', e);
            }
            try {
              localStorage.removeItem('pendingRegistrationData');
            } catch(e) { console.warn(e); }
          }

          const newUser: UserProfile = {
            email: firebaseUser.email || '',
            role: isAdminEmail ? 'admin' : (existingData.role || 'student'),
            uid: firebaseUser.uid,
            onboarded: existingData.onboarded ?? false, 
            fullName: pendingData.fullName || existingData.fullName || '',
            instructorId: existingData.instructorId || null,
            learningMode: existingData.learningMode || null,
            classIds: existingData.classIds || [],
            activeClassId: existingData.activeClassId || null,
            selectedFocus: existingData.selectedFocus || null,
            reviewTrack: existingData.reviewTrack || null,
            specialization: existingData.specialization || '',
            targetExamDate: existingData.targetExamDate || null,
            diagnosticCompleted: existingData.diagnosticCompleted ?? false,
            diagnosticSkipped: existingData.diagnosticSkipped ?? false,
            streak: 0,
            xp: 0,
            level: 1,
            earnedBadges: [],
            archivedModuleIds: existingData.archivedModuleIds || [],
            archivedClassIds: existingData.archivedClassIds || [],
            lastLoginDate: new Date().toISOString().split('T')[0]
          };
          
          if (pendingData.age) {
            const parsedAge = parseInt(pendingData.age);
            if (!isNaN(parsedAge)) newUser.age = parsedAge;
          } else if (existingData.age) {
            newUser.age = existingData.age;
          }

          await setDoc(doc(db, 'users', firebaseUser.uid), newUser);
          setUser(newUser);
        }
      } else {
        setUser(null);
      }
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signOut = async () => {
    await firebaseSignOut(auth);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, signOut, isLoading, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
