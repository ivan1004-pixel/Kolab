import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { DEMO_USERS } from '../data/demoUsers.js';
import { USE_MOCK, request } from '../services/api.js';

const AuthContext = createContext(null);
const KEY = 'kolab.session';
const IDLE_MS = Number(import.meta.env.VITE_SESSION_INACTIVITY_MINUTES ?? 30) * 60 * 1000;

function readSession() {
  try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(readSession);

  const persist = useCallback((s) => {
    localStorage.setItem(KEY, JSON.stringify(s));
    setSession(s);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(KEY);
    setSession(null);
  }, []);

  const login = useCallback(async (email, password) => {
    if (USE_MOCK) {
      const found = DEMO_USERS.find((u) => u.email === email.trim().toLowerCase() && u.password === password);
      if (!found) throw new Error('Correo o contraseña incorrectos');
      const user = { ...found };
      delete user.password;
      persist({ token: 'mock', user });
      return;
    }
    // Ajustar a las rutas reales del backend cuando nos las pasen
    const data = await request('/auth/login', { method: 'POST', body: { email, password } });
    persist({ token: data.token, user: data.user });
  }, [persist]);

  const updateProfile = useCallback(async (changes) => {
    if (!USE_MOCK) await request('/users/me', { method: 'PUT', body: changes, token: session?.token });
    persist({ ...session, user: { ...session.user, ...changes } });
  }, [persist, session]);

  // Cierra la sesión tras N minutos sin actividad
  useEffect(() => {
    if (!session) return undefined;
    let timer;
    const reset = () => { clearTimeout(timer); timer = setTimeout(logout, IDLE_MS); };
    const events = ['mousemove', 'keydown', 'click', 'scroll'];
    events.forEach((e) => window.addEventListener(e, reset));
    reset();
    return () => { clearTimeout(timer); events.forEach((e) => window.removeEventListener(e, reset)); };
  }, [session, logout]);

  const value = useMemo(
    () => ({ user: session?.user ?? null, token: session?.token ?? null, login, logout, updateProfile }),
    [session, login, logout, updateProfile],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  return useContext(AuthContext);
}
