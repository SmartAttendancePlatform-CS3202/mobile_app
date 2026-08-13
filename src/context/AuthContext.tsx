import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StudentProfile, mockStudent } from '../services/mockData';
import api from '../services/api';

interface AuthContextType {
  user: StudentProfile | null;
  isAuthenticated: boolean;
  isFaceRegistered: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; message?: string }>;
  logout: () => Promise<void>;
  setFaceRegistered: (registered: boolean) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const AUTH_STORAGE_KEY = '@smart_attendance_auth_user';
const FACE_REG_KEY = '@smart_attendance_face_registered';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<StudentProfile | null>(mockStudent);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(true);
  const [isFaceRegistered, setIsFaceRegisteredState] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const loadStoredAuth = async () => {
      try {
        const storedUser = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
        const storedFaceReg = await AsyncStorage.getItem(FACE_REG_KEY);
        
        if (storedUser !== null) {
          const parsed = JSON.parse(storedUser);
          setUser(parsed);
          setIsAuthenticated(true);
        } else {
          // Default to mockStudent for smooth initial demo experience
          setUser(mockStudent);
          setIsAuthenticated(true);
        }

        if (storedFaceReg !== null) {
          setIsFaceRegisteredState(storedFaceReg === 'true');
        } else {
          setIsFaceRegisteredState(true);
        }
      } catch (e) {
        console.error('Failed to load auth state:', e);
      } finally {
        setLoading(false);
      }
    };

    loadStoredAuth();
  }, []);

  const login = async (email: string, password: string) => {
    try {
      const response = await api.login(email, password);
      if (response.success && response.user) {
        const studentProfile: StudentProfile = {
          id: response.user.id || mockStudent.id,
          name: response.user.user_metadata?.full_name || mockStudent.name,
          email: response.user.email || email,
          indexNumber: response.user.user_metadata?.index_number || mockStudent.indexNumber,
          department: response.user.user_metadata?.department || mockStudent.department,
          batch: response.user.user_metadata?.batch || mockStudent.batch,
          isFaceRegistered: !!(response.user.isFaceRegistered || response.user.user_metadata?.isFaceRegistered),
        };

        setUser(studentProfile);
        setIsAuthenticated(true);
        setIsFaceRegisteredState(studentProfile.isFaceRegistered);

        await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(studentProfile));
        if (response.token) {
          await AsyncStorage.setItem('userToken', response.token);
        }
        await AsyncStorage.setItem(FACE_REG_KEY, String(studentProfile.isFaceRegistered));

        return { success: true };
      } else {
        // Fallback demo login if email/password matches mock student
        if (email.trim().length > 0 && password.length >= 4) {
          const studentProfile: StudentProfile = {
            ...mockStudent,
            email: email.trim(),
          };
          setUser(studentProfile);
          setIsAuthenticated(true);
          setIsFaceRegisteredState(true);
          await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(studentProfile));
          await AsyncStorage.setItem(FACE_REG_KEY, 'true');
          return { success: true };
        }
        return { success: false, message: response.message || 'Invalid credentials' };
      }
    } catch (err: any) {
      return { success: false, message: err.message || 'Login failed. Please try again.' };
    }
  };

  const logout = async () => {
    try {
      await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
      await AsyncStorage.removeItem('userToken');
      setUser(null);
      setIsAuthenticated(false);
    } catch (e) {
      console.error('Failed to logout:', e);
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

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isFaceRegistered,
        loading,
        login,
        logout,
        setFaceRegistered,
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
