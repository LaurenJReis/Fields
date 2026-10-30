import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { User } from '../types/user';
import { API_BASE_URL } from '../config/api';

// ─── Tipos ───────────────────────────────────────────────────────────────────
interface AuthContextValue {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string, persist: boolean) => Promise<void>;
  logout: () => Promise<void>;
}

// ─── Context ─────────────────────────────────────────────────────────────────
const AuthContext = createContext<AuthContextValue | null>(null);
const USER_KEY  = '@fieldops:user';
const TOKEN_KEY = '@fieldops:token';

// ─── Provider ────────────────────────────────────────────────────────────────
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user,    setUser]    = useState<User | null>(null);
  const [token,   setToken]   = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Restaura sessão persistida ao abrir o app
  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(USER_KEY),
      AsyncStorage.getItem(TOKEN_KEY),
    ])
      .then(([rawUser, rawToken]) => {
        if (rawUser && rawToken) {
          setUser(JSON.parse(rawUser) as User);
          setToken(rawToken);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(
    async (email: string, password: string, persist: boolean) => {
      // Chama a API real na AWS
      const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          (err as any).message ?? 'E-mail ou senha incorretos.',
        );
      }

      const body = await res.json();
      // LoginResponse: { token, type, expiresIn, user: { id, name, email, role, active } }
      const apiUser = body.user;
      const jwt: string = body.token;

      const mappedUser: User = {
        id:           apiUser.id,
        name:         apiUser.name,
        email:        apiUser.email,
        role:         (apiUser.role as string).toLowerCase() as User['role'],
        organization: 'FieldOps',
      };

      if (persist) {
        await AsyncStorage.setItem(USER_KEY,  JSON.stringify(mappedUser));
        await AsyncStorage.setItem(TOKEN_KEY, jwt);
      } else {
        await AsyncStorage.removeItem(USER_KEY);
        await AsyncStorage.removeItem(TOKEN_KEY);
      }

      setUser(mappedUser);
      setToken(jwt);
    },
    [],
  );

  const logout = useCallback(async () => {
    await AsyncStorage.multiRemove([USER_KEY, TOKEN_KEY]);
    setUser(null);
    setToken(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// ─── Hook ────────────────────────────────────────────────────────────────────
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de <AuthProvider>');
  return ctx;
}
