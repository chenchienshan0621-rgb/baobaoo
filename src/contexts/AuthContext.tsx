import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut as firebaseSignOut } from 'firebase/auth';
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { handleFirestoreError, OperationType } from '../lib/utils';

export type Role = 'nanny' | 'parent' | 'admin' | null;

export interface UserProfile {
  uid: string;
  role: Role;
  name: string;
  email: string;
  linkedToddlerIds?: string[];
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  setRole: (role: 'nanny' | 'parent' | 'admin') => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        try {
          const docRef = doc(db, 'users', currentUser.uid);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            setProfile(docSnap.data() as UserProfile);
          } else {
            // Check if user is pre-registered
            if (currentUser.email) {
              const preRegRef = doc(db, 'pre_registered_users', currentUser.email);
              const preRegSnap = await getDoc(preRegRef);
              if (preRegSnap.exists()) {
                const preRegData = preRegSnap.data();
                const newProfile: UserProfile = {
                  uid: currentUser.uid,
                  role: preRegData.role,
                  name: preRegData.name || currentUser.displayName || 'Unknown',
                  email: currentUser.email,
                  linkedToddlerIds: preRegData.linkedToddlerIds || []
                };
                await setDoc(docRef, newProfile);
                await deleteDoc(preRegRef);
                setProfile(newProfile);
                setLoading(false);
                return;
              }
            }
            setProfile(null); // Needs role selection
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, `users/${currentUser.uid}`);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const signIn = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
  };

  const setRole = async (role: 'nanny' | 'parent' | 'admin') => {
    if (!user) return;
    const newProfile: UserProfile = {
      uid: user.uid,
      role,
      name: user.displayName || 'Unknown',
      email: user.email || '',
    };
    try {
      if (profile) {
        await setDoc(doc(db, 'users', user.uid), { role }, { merge: true });
        setProfile({ ...profile, role });
      } else {
        await setDoc(doc(db, 'users', user.uid), newProfile);
        setProfile(newProfile);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `users/${user.uid}`);
    }
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, signIn, signOut, setRole }}>
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
