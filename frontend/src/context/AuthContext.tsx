import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { DEMO_USERS } from '../data/demoUsers';
import { USE_MOCK, gqlRequest } from '../services/api';
import { assertNoScriptInjection } from '../utils/inputSecurity';

export interface AuthUser {
  id: string | number;
  nombre: string;
  apellidos: string;
  email: string;
  correo: string;
  rol: string;
  foto_url: string;
  xp: number;
  cuatrimestre?: string;
  grupo?: string;
  carrera: string;
  insignias: number;
  retos: number;
}

interface SessionData {
  token: string;
  refreshToken?: string;
  user: AuthUser | null;
}

interface RegisterPayload {
  nombre: string;
  apellidos: string;
  correo: string;
  contrasena: string;
  idCarrera?: string;
  aceptoPrivacidad?: boolean;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  register: (payload: RegisterPayload) => Promise<{ message: string; correo: string; requiereVerificacion: boolean }>;
  verifyEmail: (token: string) => Promise<{ success: boolean; message: string }>;
  updateProfile: (changes: Record<string, any>) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const KEY = 'kolab.session';
const IDLE_MS = Number(import.meta.env.VITE_SESSION_INACTIVITY_MINUTES ?? 30) * 60 * 1000;

const ROLE_MAP: Record<string, string> = {
  ESTUDIANTE: 'estudiante',
  DOCENTE: 'docente',
  ADMINISTRADOR: 'admin',
};

const USER_FIELDS = `
  _id
  nombre
  apellidos
  correo
  rol
  fotoUrl
  xpTotal
  cuatrimestre
  grupo
`;

function normalizeUser(u: any): AuthUser | null {
  if (!u) return null;
  return {
    id: u._id ?? u.id,
    nombre: u.nombre ?? '',
    apellidos: u.apellidos ?? '',
    email: u.correo ?? u.email ?? '',
    correo: u.correo ?? u.email ?? '',
    rol: ROLE_MAP[u.rol] ?? u.rol ?? 'estudiante',
    foto_url: u.fotoUrl ?? u.foto_url ?? '',
    xp: u.xpTotal ?? u.xp ?? 0,
    cuatrimestre: u.cuatrimestre ?? '',
    grupo: u.grupo ?? '',
    carrera: u.carrera ?? 'Carrera por definir',
    insignias: u.insignias ?? 0,
    retos: u.retos ?? 0,
  };
}

function readSession(): SessionData | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SessionData) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionData | null>(readSession);

  const persist = useCallback((s: SessionData) => {
    localStorage.setItem(KEY, JSON.stringify(s));
    setSession(s);
  }, []);

  const logout = useCallback(async () => {
    if (!USE_MOCK && session?.token) {
      gqlRequest(`mutation Logout { logout { success message } }`, {}, session.token).catch(() => {});
    }
    localStorage.removeItem(KEY);
    setSession(null);
  }, [session?.token]);

  const login = useCallback(async (email: string, password: string) => {
    assertNoScriptInjection(email, 'correo');

    if (USE_MOCK) {
      const found = DEMO_USERS.find((u) => u.email === email.trim().toLowerCase() && u.password === password);
      if (!found) throw new Error('Correo o contraseña incorrectos');
      const user = { ...found };
      delete user.password;
      persist({ token: 'mock', user: normalizeUser(user) });
      return;
    }

    const data = await gqlRequest(
      `mutation Login($input: LoginInput!) {
        login(input: $input) {
          accessToken
          refreshToken
          usuario {
            ${USER_FIELDS}
          }
        }
      }`,
      { input: { correo: email.trim(), contrasena: password } },
    );

    persist({
      token: data.login.accessToken,
      refreshToken: data.login.refreshToken,
      user: normalizeUser(data.login.usuario),
    });
  }, [persist]);

  const register = useCallback(async ({ nombre, apellidos, correo, contrasena, idCarrera, aceptoPrivacidad = true }: RegisterPayload) => {
    assertNoScriptInjection({ nombre, apellidos, correo }, 'registro');

    if (USE_MOCK) {
      return {
        message: 'Registro simulado en modo demo. Activa VITE_USE_MOCK=false para usar Brevo.',
        correo,
        requiereVerificacion: false,
      };
    }

    const data = await gqlRequest(
      `mutation Register($input: RegisterInput!) {
        register(input: $input) {
          message
          correo
          requiereVerificacion
        }
      }`,
      {
        input: {
          nombre,
          apellidos,
          correo: correo.trim(),
          contrasena,
          ...(idCarrera ? { idCarrera } : {}),
          aceptoPrivacidad,
        },
      },
    );
    return data.register;
  }, []);

  const verifyEmail = useCallback(async (token: string) => {
    if (USE_MOCK) {
      return { success: true, message: 'Correo verificado (modo demo).' };
    }
    const data = await gqlRequest(
      `mutation VerifyEmail($token: String!) {
        verifyEmail(token: $token) {
          success
          message
        }
      }`,
      { token: token.trim() },
    );
    return data.verifyEmail;
  }, []);

  const updateProfile = useCallback(async (changes: Record<string, any>) => {
    assertNoScriptInjection(changes, 'perfil');

    if (USE_MOCK) {
      if (session?.user) {
        persist({ ...session, user: { ...session.user, ...changes } });
      }
      return;
    }

    const input: Record<string, any> = {};
    if (changes.nombre !== undefined) input.nombre = changes.nombre;
    if (changes.apellidos !== undefined) input.apellidos = changes.apellidos;
    if (changes.foto_url !== undefined || changes.fotoUrl !== undefined) {
      input.fotoUrl = changes.fotoUrl ?? changes.foto_url;
    }
    if (changes.idCarrera !== undefined) input.idCarrera = changes.idCarrera;
    if (changes.cuatrimestre !== undefined) input.cuatrimestre = changes.cuatrimestre;
    if (changes.grupo !== undefined) input.grupo = changes.grupo;

    if (Object.keys(input).length > 0 && session?.token) {
      const data = await gqlRequest(
        `mutation ActualizarPerfil($input: UpdatePerfilInput!) {
          actualizarPerfil(input: $input) {
            ${USER_FIELDS}
          }
        }`,
        { input },
        session.token,
      );
      persist({ ...session, user: normalizeUser(data.actualizarPerfil) });
    } else if (session?.user) {
      persist({ ...session, user: { ...session.user, ...changes } });
    }
  }, [persist, session]);

  useEffect(() => {
    if (!session) return undefined;
    let timer: ReturnType<typeof setTimeout>;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(logout, IDLE_MS);
    };
    const events = ['mousemove', 'keydown', 'click', 'scroll'];
    events.forEach((e) => window.addEventListener(e, reset));
    reset();
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [session, logout]);

  const value = useMemo(
    () => ({
      user: session?.user ?? null,
      token: session?.token ?? null,
      login,
      logout,
      register,
      verifyEmail,
      updateProfile,
    }),
    [session, login, logout, register, verifyEmail, updateProfile],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
