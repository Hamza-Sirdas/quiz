import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import {
  changeTeacherPassword,
  getMe,
  loginTeacher,
  logoutAllSessions,
  logoutTeacher,
  registerTeacher,
  updateTeacherProfile,
  type TeacherProfile,
} from '@/services/authApi';
import { subscribeSessionExpired } from '@/services/authSessionEvents';
import { clearCsrfToken } from '@/services/csrfStore';

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
  passwordConfirm: string;
  acceptedTerms: boolean;
}

interface AuthContextValue {
  teacher: TeacherProfile | null;
  loading: boolean;
  sessionExpired: boolean;
  login: (email: string, password: string) => Promise<TeacherProfile>;
  register: (payload: RegisterInput) => Promise<TeacherProfile>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
  updateProfile: (payload: { name: string; email: string }) => Promise<TeacherProfile>;
  changePassword: (payload: {
    currentPassword: string;
    newPassword: string;
    newPasswordConfirm: string;
  }) => Promise<string>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [teacher, setTeacher] = useState<TeacherProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);

  const refreshSession = useCallback(async () => {
    try {
      const data = await getMe();
      setTeacher(data.teacher);
      setSessionExpired(false);
    } catch {
      setTeacher(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  useEffect(() => {
    return subscribeSessionExpired(() => {
      clearCsrfToken();
      setTeacher(null);
      setSessionExpired(true);
    });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await loginTeacher({ email, password });
    setSessionExpired(false);
    setTeacher(data.teacher);
    return data.teacher;
  }, []);

  const register = useCallback(async (payload: RegisterInput) => {
    const data = await registerTeacher(payload);
    setSessionExpired(false);
    setTeacher(data.teacher);
    return data.teacher;
  }, []);

  const logout = useCallback(async () => {
    try {
      await logoutTeacher();
    } finally {
      setSessionExpired(false);
      setTeacher(null);
    }
  }, []);

  const logoutAll = useCallback(async () => {
    try {
      await logoutAllSessions();
    } finally {
      setSessionExpired(false);
      setTeacher(null);
    }
  }, []);

  const updateProfile = useCallback(
    async (payload: { name: string; email: string }) => {
      const data = await updateTeacherProfile(payload);
      setTeacher(data.teacher);
      return data.teacher;
    },
    [],
  );

  const changePassword = useCallback(
    async (payload: {
      currentPassword: string;
      newPassword: string;
      newPasswordConfirm: string;
    }) => {
      const data = await changeTeacherPassword(payload);
      return data.message;
    },
    [],
  );

  return (
    <AuthContext.Provider
      value={{
        teacher,
        loading,
        sessionExpired,
        login,
        register,
        logout,
        logoutAll,
        updateProfile,
        changePassword,
        refreshSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth yalnızca AuthProvider içinde kullanılabilir.');
  }
  return ctx;
}
