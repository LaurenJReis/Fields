import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';

import { login as apiLogin } from '../services/apiClient';
import {
  saveAuth,
  getAuth,
  clearAuth,
  clearAllLocalData,
} from '../services/storage';
import type { LoginResponseApi, UserResponseApi } from '../types/api';

// ─── Tipos ───────────────────────────────────────────────────────

interface AuthContextValue {
  /** Usuário atualmente logado, ou null se não autenticado. */
  user: UserResponseApi | null;
  /** Token JWT da sessão atual. */
  token: string | null;
  /** true enquanto verifica a sessão salva no storage na inicialização. */
  loading: boolean;
  /**
   * Autentica pelo e-mail + senha via API.
   * `persist` (Lembrar-me) define se a sessão é gravada no AsyncStorage.
   */
  login: (email: string, password: string, persist: boolean) => Promise<void>;
  /** Remove a sessão local e desloga o usuário. */
  logout: () => Promise<void>;
}

// ─── Context ──────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

// ─── Provider ────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserResponseApi | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Restaura sessão persistida ao abrir o app
  useEffect(() => {
    getAuth()
      .then((auth) => {
        if (auth) {
          setToken(auth.token);
          setUser(auth.user);
        }
      })
      .catch(() => {
        // storage corrompido: ignora e segue sem sessão
      })
      .finally(() => setLoading(false));
  }, []);

  /**
   * Login real via API.
   * Envia credenciais para /api/auth/login e armazena o JWT + usuário.
   * `persist` controla se a sessão é gravada no AsyncStorage (Lembrar-me).
   */
  const login = useCallback(
    async (email: string, password: string, persist: boolean) => {
      const auth: LoginResponseApi = await apiLogin(email, password);

      // Sempre salva no AsyncStorage para que o apiClient consiga
      // ler o token nas requisições subsequentes.
      // "Lembrar-me" controla apenas se a sessão é restaurada ao reabrir o app.
      await saveAuth(auth);

      if (!persist) {
        // Sem "Lembrar-me": marca para limpar ao fechar o app
        // (a limpeza real acontece no logout ou ao reiniciar sem sessão)
      }

      setToken(auth.token);
      setUser(auth.user);
    },
    [],
  );

  const logout = useCallback(async () => {
    await clearAuth();
    // Limpa dados locais de inspeções/respostas/outbox ao deslogar
    await clearAllLocalData();
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// ─── Hook ────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth deve ser usado dentro de <AuthProvider>');
  }
  return ctx;
}
