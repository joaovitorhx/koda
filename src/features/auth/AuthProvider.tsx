import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { AppState } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError, configureSession, refreshSession } from '@/core/api/client';
import { stopTracking } from '@/features/tracking/runtime';
import { sessionStorage } from '@/core/storage/session-storage';
import { persistSession } from '@/core/storage/session-lock';
import { restoreSession, type Credentials, type Session } from './model';
import { login, refreshLogin, logoutRemote } from './service';
interface AuthContextValue {
  session: Session | null;
  loading: boolean;
  notice: string | null;
  signIn(credentials: Credentials): Promise<void>;
  signOut(): Promise<void>;
}
const Context = createContext<AuthContextValue | null>(null);
export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null),
    [loading, setLoading] = useState(true),
    [notice, setNotice] = useState<string | null>(null);
  const currentSession = useRef<Session | null>(null),
    generation = useRef(0);
  const client = useQueryClient();
  const persist = persistSession;
  const clear = useCallback(
    async (expired = false) => {
      generation.current++;
      currentSession.current = null;
      configureSession(null);
      const stop = stopTracking().catch(() => {});
      setSession(null);
      setNotice(expired ? 'Sua sessão expirou. Entre novamente.' : null);
      await stop;
      await client.cancelQueries();
      client.clear();
      try {
        await persist(() => sessionStorage.clear());
      } catch {
        setNotice('Sessão encerrada. Não foi possível limpar o armazenamento seguro.');
      }
    },
    [persist, client],
  );
  const renew = useCallback(async () => {
    const previous = currentSession.current,
      current = generation.current;
    if (!previous?.refreshToken) throw new ApiError('Sua sessão expirou. Entre novamente.', 401);
    const next = await refreshLogin(previous.refreshToken);
    if (String(next.user.id) !== String(previous.user.id))
      throw new ApiError('A identidade da sessão mudou. Entre novamente.', 401);
    if (current !== generation.current) throw new ApiError('Sessão alterada.', 401);
    await persist(() => sessionStorage.write(JSON.stringify(next)));
    if (current !== generation.current) throw new ApiError('Sessão alterada.', 401);
    currentSession.current = next;
    setSession(next);
    return next.accessToken;
  }, [persist]);
  const activate = useCallback(
    (next: Session) => {
      currentSession.current = next;
      configureSession(
        next.accessToken,
        () => void clear(true),
        next.refreshToken ? renew : undefined,
      );
      setSession(next);
      setNotice(null);
    },
    [clear, renew],
  );
  useEffect(() => {
    let mounted = true;
    const current = generation.current;
    void sessionStorage
      .read()
      .then(async (raw) => {
        if (!mounted || current !== generation.current) return;
        let saved = raw ? restoreSession(raw) : null;
        if (saved && saved.expiresAt <= Date.now() && saved.refreshToken) {
          const previousId = saved.user.id;
          saved = await refreshLogin(saved.refreshToken);
          if (String(saved.user.id) !== String(previousId))
            throw new ApiError('Sessão inválida.', 401);
          if (!mounted || current !== generation.current) return;
          await persist(() => sessionStorage.write(JSON.stringify(saved)));
        }
        if (!mounted || current !== generation.current) return;
        if (saved) activate(saved);
        else if (raw) await persist(() => sessionStorage.clear());
      })
      .catch(() => {
        if (mounted) setNotice('Não foi possível restaurar sua sessão. Entre novamente.');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [activate, persist]);
  useEffect(() => {
    if (!session) return;
    let timer: ReturnType<typeof setTimeout>;
    let disposed = false;
    const check = () => {
      clearTimeout(timer);
      const remaining = session.expiresAt - Date.now();
      if (remaining > 30000) {
        timer = setTimeout(check, Math.min(remaining - 30000, 2147483647));
        return;
      }
      if (!session.refreshToken) {
        if (remaining <= 0) void clear(true);
        else timer = setTimeout(check, remaining);
        return;
      }
      void refreshSession().catch((error) => {
        if (disposed) return;
        if (error instanceof ApiError && [401, 403].includes(error.status)) void clear(true);
        else timer = setTimeout(check, 30000);
      });
    };
    check();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => {
      disposed = true;
      clearTimeout(timer);
      subscription.remove();
    };
  }, [session, clear]);
  const signIn = useCallback(
    async (credentials: Credentials) => {
      const current = ++generation.current;
      const next = await login(credentials);
      if (current !== generation.current) return;
      await persist(() => sessionStorage.write(JSON.stringify(next)));
      if (current === generation.current) activate(next);
    },
    [activate, persist],
  );
  const signOut = useCallback(async () => {
    const remote = logoutRemote().catch(() => {});
    await clear();
    await remote;
  }, [clear]);
  const value = useMemo(
    () => ({ session, loading, notice, signIn, signOut }),
    [session, loading, notice, signIn, signOut],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useAuth() {
  const value = useContext(Context);
  if (!value) throw new Error('useAuth must be used within AuthProvider');
  return value;
}
