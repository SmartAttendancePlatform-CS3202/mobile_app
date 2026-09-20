import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StudentProfile } from '../services/mockData';
import api from '../services/api';
import { supabase } from '../services/supabaseClient';

interface AuthContextType {
  user: StudentProfile | null;
  isAuthenticated: boolean;
  isFaceRegistered: boolean;
  status: string | null;
  isPendingApproval: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; message?: string }>;
  logout: () => Promise<void>;
  setFaceRegistered: (registered: boolean) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const AUTH_STORAGE_KEY = '@smart_attendance_auth_user';
const FACE_REG_KEY = '@smart_attendance_face_registered';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<StudentProfile | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isFaceRegistered, setIsFaceRegisteredState] = useState<boolean>(false);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const isPendingApproval = status === 'pending_approval' || status === 'inactive';

  useEffect(() => {
    let isMounted = true;

    const loadStoredAuth = async () => {
      try {
        // 1. First, load cached user for instant offline readiness
        const storedUserJson = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
        const storedFaceReg = await AsyncStorage.getItem(FACE_REG_KEY);

        if (storedUserJson) {
          const cachedUser: StudentProfile = JSON.parse(storedUserJson);
          if (isMounted) {
            setUser(cachedUser);
            setIsAuthenticated(true);
            setStatus(cachedUser.status || 'active');
            setIsFaceRegisteredState(
              storedFaceReg !== null ? storedFaceReg === 'true' : cachedUser.isFaceRegistered
            );
          }
        }

        // 2. Validate current session with Supabase
        const { data: { session } } = await supabase.auth.getSession();

        if (session && session.user) {
          await AsyncStorage.setItem('userToken', session.access_token);
          
          // Re-sync student profile from database
          try {
            const updatedProfile = await api.fetchStudentProfile(
              session.user.id,
              session.user.email || ''
            );

            if (isMounted) {
              setUser(updatedProfile);
              setIsAuthenticated(true);
              setStatus(updatedProfile.status || 'active');
              setIsFaceRegisteredState(updatedProfile.isFaceRegistered);
            }

            await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(updatedProfile));
            await AsyncStorage.setItem(FACE_REG_KEY, String(updatedProfile.isFaceRegistered));
          } catch (fetchErr) {
            // Keep cached offline profile if network fails
            console.log('Using cached profile due to network issue:', fetchErr);
          }
        } else if (!storedUserJson) {
          // No active session and no cache
          if (isMounted) {
            setUser(null);
            setIsAuthenticated(false);
            setStatus(null);
          }
        }
      } catch (e) {
        console.error('Failed to load auth state:', e);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadStoredAuth();

    // Listen for Supabase session changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_OUT') {
          if (isMounted) {
            setUser(null);
            setIsAuthenticated(false);
            setStatus(null);
            setIsFaceRegisteredState(false);
          }
          await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
          await AsyncStorage.removeItem('userToken');
          await AsyncStorage.removeItem(FACE_REG_KEY);
        } else if (event === 'TOKEN_REFRESHED' && session) {
          await AsyncStorage.setItem('userToken', session.access_token);
        }
      }
    );

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const login = async (email: string, password: string) => {
    try {
      const response = await api.login(email, password);
      if (response.success && response.user) {
        const studentProfile = response.user;

        setUser(studentProfile);
        setIsAuthenticated(true);
        setStatus(response.status || 'active');
        setIsFaceRegisteredState(!!response.isFaceRegistered);

        await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(studentProfile));
        if (response.token) {
          await AsyncStorage.setItem('userToken', response.token);
        }
        await AsyncStorage.setItem(FACE_REG_KEY, String(!!response.isFaceRegistered));

        return { success: true };
      } else {
        return {
          success: false,
          message: response.message || 'Invalid email or password',
        };
      }
    } catch (err: any) {
      return {
        success: false,
        message: err.message || 'Login failed. Please check your network connection.',
      };
    }
  };

  const logout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.warn('Supabase signOut error:', e);
    } finally {
      await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
      await AsyncStorage.removeItem('userToken');
      await AsyncStorage.removeItem(FACE_REG_KEY);
      setUser(null);
      setIsAuthenticated(false);
      setStatus(null);
      setIsFaceRegisteredState(false);
    }
  };

  const setFaceRegistered = async (registered: boolean) => {
    try {
      setIsFaceRegisteredState(registered);
      await AsyncStorage.setItem(FACE_REG_KEY, String(registered));
      if (user) {
        const updated = { ...user, isFaceRegistered: registered };
        setUser(updated);
        await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(updated));
      }
    } catch (e) {
      console.error('Failed to save face registration status:', e);
    }
  };

  const refreshProfile = async () => {
    if (!user?.id) return;
    try {
      const updated = await api.fetchStudentProfile(user.id, user.email);
      setUser(updated);
      setStatus(updated.status || 'active');
      setIsFaceRegisteredState(updated.isFaceRegistered);
      await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(updated));
      await AsyncStorage.setItem(FACE_REG_KEY, String(updated.isFaceRegistered));
    } catch (e) {
      console.warn('Failed to refresh profile:', e);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isFaceRegistered,
        status,
        isPendingApproval,
        loading,
        login,
        logout,
        setFaceRegistered,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;
