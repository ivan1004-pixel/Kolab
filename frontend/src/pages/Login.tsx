import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { USE_MOCK, gqlRequest } from '../services/api';
import { assertNoScriptInjection } from '../utils/inputSecurity';
import Logo from '../components/Logo';

type AuthMode = 'login' | 'register' | 'verify' | 'forgot' | 'reset';

const RESEND_LIMIT = 3;
const RESEND_WINDOW_MS = 60 * 60 * 1000;

function getRecentResendAttempts(email: string): number[] {
  const key = `kolab_resend_verify_${email.trim().toLowerCase() || 'default'}`;
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    return parsed.filter((ts): ts is number => typeof ts === 'number' && now - ts < RESEND_WINDOW_MS);
  } catch {
    return [];
  }
}

function recordResendAttempt(email: string): number[] {
  const key = `kolab_resend_verify_${email.trim().toLowerCase() || 'default'}`;
  const next = [...getRecentResendAttempts(email), Date.now()];
  try {
    localStorage.setItem(key, JSON.stringify(next));
  } catch {
    // Ignorar errores de almacenamiento
  }
  return next;
}

interface PasswordInputProps {
  id: string;
  name: string;
  value: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  autoComplete?: string;
  placeholder?: string;
}

function PasswordInput({ id, name, value, onChange, autoComplete, placeholder }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="password-input">
      <input
        id={id}
        name={name}
        type={visible ? 'text' : 'password'}
        autoComplete={autoComplete}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
      />
      <button
        type="button"
        className="password-toggle"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        aria-pressed={visible}
        title={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
      >
        {visible ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
            <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
            <line x1="1" y1="1" x2="23" y2="23" />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  );
}

export default function Login() {
  const { user, login, register, verifyEmail } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const [mode, setMode] = useState<AuthMode>('login');
  const [form, setForm] = useState({
    nombre: '',
    apellidos: '',
    email: '',
    password: '',
    confirmPassword: '',
    aceptoPrivacidad: true,
    token: '',
    nuevaContrasena: '',
    confirmNuevaContrasena: '',
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendAttempts, setResendAttempts] = useState<number[]>([]);

  useEffect(() => {
    if (mode === 'verify') {
      setResendAttempts(getRecentResendAttempts(form.email));
    }
  }, [mode, form.email]);

  useEffect(() => {
    const urlToken = searchParams.get('token');
    if (location.pathname === '/reset-password') {
      setMode('reset');
      if (urlToken) {
        setForm((f) => ({ ...f, token: urlToken }));
      }
      return;
    }

    if (!urlToken) return;

    setMode('verify');
    setForm((f) => ({ ...f, token: urlToken }));
    setError('');
    setLoading(true);

    verifyEmail(urlToken)
      .then((res) => {
        setSuccess(res.message || 'Correo verificado. Ya puedes iniciar sesión.');
        setMode('login');
      })
      .catch((err: any) => {
        setError(err.message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [location.pathname, searchParams, verifyEmail]);

  if (user) return <Navigate to="/" replace />;

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, type, checked, value } = e.target;
    setForm((f) => ({ ...f, [name]: type === 'checkbox' ? checked : value }));
  };

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode);
    setError('');
    setSuccess('');
  }

  async function handleResendVerification() {
    setError('');
    setSuccess('');

    const recent = getRecentResendAttempts(form.email);
    setResendAttempts(recent);
    if (recent.length >= RESEND_LIMIT) {
      const oldest = Math.min(...recent);
      const minsLeft = Math.max(1, Math.ceil((RESEND_WINDOW_MS - (Date.now() - oldest)) / 60000));
      setError(`Alcanzaste el límite de ${RESEND_LIMIT} reenvíos por hora. Intenta de nuevo en ${minsLeft} min.`);
      return;
    }

    if (!form.email.trim()) {
      setError('No encontramos tu correo. Vuelve a iniciar sesión o regístrate de nuevo.');
      return;
    }

    setLoading(true);
    try {
      assertNoScriptInjection(form.email, 'correo');
      if (USE_MOCK) {
        const updated = recordResendAttempt(form.email);
        setResendAttempts(updated);
        setSuccess('En modo demo no se envían correos. Activa VITE_USE_MOCK=false para usar Brevo.');
      } else {
        const data = await gqlRequest(
          `mutation ResendVerificationEmail($correo: String!) {
            resendVerificationEmail(correo: $correo) { success message }
          }`,
          { correo: form.email.trim() },
        );
        const updated = recordResendAttempt(form.email);
        setResendAttempts(updated);
        setSuccess(data.resendVerificationEmail.message || 'Correo de verificación reenviado.');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      if (mode === 'login') {
        if (!form.email.trim() || !form.password) {
          throw new Error('Escribe tu correo y contraseña');
        }
        assertNoScriptInjection(form.email, 'correo');
        await login(form.email, form.password);
        navigate((location.state as any)?.from?.pathname ?? '/', { replace: true });
      } else if (mode === 'register') {
        if (!form.nombre.trim() || !form.apellidos.trim() || !form.email.trim() || !form.password || !form.confirmPassword) {
          throw new Error('Completa todos tus datos para registrarte');
        }
        if (form.password !== form.confirmPassword) {
          throw new Error('Las contraseñas no coinciden');
        }
        if (!form.aceptoPrivacidad) {
          throw new Error('Debes aceptar el aviso de privacidad');
        }
        assertNoScriptInjection({ nombre: form.nombre, apellidos: form.apellidos, email: form.email }, 'registro');
        const res = await register({
          nombre: form.nombre.trim(),
          apellidos: form.apellidos.trim(),
          correo: form.email.trim(),
          contrasena: form.password,
          aceptoPrivacidad: form.aceptoPrivacidad,
        });
        setSuccess(res.message);
        if (res.requiereVerificacion) {
          setMode('verify');
        }
      } else if (mode === 'verify') {
        if (!form.token.trim()) {
          throw new Error('Pega el token de verificación enviado a tu correo');
        }
        assertNoScriptInjection(form.token, 'token');
        const res = await verifyEmail(form.token);
        setSuccess(res.message || 'Correo verificado. Ya puedes iniciar sesión.');
        setMode('login');
      } else if (mode === 'forgot') {
        if (!form.email.trim()) {
          throw new Error('Escribe tu correo para enviarte el enlace');
        }
        assertNoScriptInjection(form.email, 'correo');
        if (USE_MOCK) {
          setSuccess('En modo demo no se envían correos. Activa VITE_USE_MOCK=false para usar Brevo.');
        } else {
          const data = await gqlRequest(
            `mutation ForgotPassword($correo: String!) {
              forgotPassword(correo: $correo) { success message }
            }`,
            { correo: form.email.trim() },
          );
          setSuccess(data.forgotPassword.message);
        }
      } else if (mode === 'reset') {
        if (!form.token.trim() || !form.nuevaContrasena || !form.confirmNuevaContrasena) {
          throw new Error('Ingresa el token y confirma tu nueva contraseña');
        }
        if (!/^\d{8}$/.test(form.token.trim())) {
          throw new Error('El token de recuperación debe tener 8 dígitos');
        }
        if (form.nuevaContrasena !== form.confirmNuevaContrasena) {
          throw new Error('Las contraseñas no coinciden');
        }
        assertNoScriptInjection(form.token, 'token');
        if (USE_MOCK) {
          setSuccess('Contraseña actualizada (modo demo).');
          setForm((f) => ({ ...f, nuevaContrasena: '', confirmNuevaContrasena: '' }));
          setMode('login');
        } else {
          const data = await gqlRequest(
            `mutation ResetPassword($input: ResetPasswordInput!) {
              resetPassword(input: $input) { success message }
            }`,
            {
              input: {
                token: form.token.trim(),
                nuevaContrasena: form.nuevaContrasena,
              },
            },
          );
          setSuccess(data.resetPassword.message || 'Contraseña restablecida. Ya puedes iniciar sesión.');
          setForm((f) => ({
            ...f,
            password: '',
            confirmPassword: '',
            nuevaContrasena: '',
            confirmNuevaContrasena: '',
            token: '',
          }));
          setMode('login');
        }
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login">
      <section className="login__brand">
        <Logo light size={48} />
        <div>
          <h1>Aprender juntos, con confianza.</h1>
          <p>Comparte apuntes, pregunta justo donde no entendiste y valida con quien enseña.</p>
        </div>
        <small>Proyecto KOLAB · UTVT · 2026</small>
      </section>

      <section className="login__panel">
        <form className="login__form" onSubmit={onSubmit} noValidate>
          <h2 style={{ fontSize: '1.85rem', fontWeight: 800 }}>
            {mode === 'login' && 'Iniciar sesión'}
            {mode === 'register' && 'Únete a KOLAB'}
            {mode === 'verify' && 'Revisa tu correo'}
            {mode === 'forgot' && 'Recuperar contraseña'}
            {mode === 'reset' && 'Nueva contraseña'}
          </h2>

          {mode === 'register' && (
            <div className="login-name-grid">
              <div className="field">
                <label htmlFor="nombre">Nombre</label>
                <input id="nombre" name="nombre" value={form.nombre} onChange={onChange} placeholder="Ana" />
              </div>
              <div className="field">
                <label htmlFor="apellidos">Apellidos</label>
                <input id="apellidos" name="apellidos" value={form.apellidos} onChange={onChange} placeholder="Pérez" />
              </div>
            </div>
          )}

          {(mode === 'login' || mode === 'register' || mode === 'forgot') && (
            <div className="field">
              <label htmlFor="email">Correo institucional</label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="username"
                value={form.email}
                onChange={onChange}
                placeholder="tu.nombre@utvt.edu.mx"
              />
            </div>
          )}

          {(mode === 'login' || mode === 'register') && (
            <div className="field">
              <label htmlFor="password">Contraseña</label>
              <PasswordInput
                key={`${mode}-password`}
                id="password"
                name="password"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                value={form.password}
                onChange={onChange}
                placeholder={mode === 'register' ? 'Mín. 8 chars, Mayús, Núm y Símbolo' : ''}
              />
            </div>
          )}

          {mode === 'register' && (
            <>
              <div className="field">
                <label htmlFor="confirmPassword">Confirmar contraseña</label>
                <PasswordInput
                  key="register-confirm-password"
                  id="confirmPassword"
                  name="confirmPassword"
                  autoComplete="new-password"
                  value={form.confirmPassword}
                  onChange={onChange}
                  placeholder="Repite tu contraseña"
                />
              </div>
              <label className="login-check">
                <input
                  type="checkbox"
                  name="aceptoPrivacidad"
                  checked={form.aceptoPrivacidad}
                  onChange={onChange}
                />
                <span>Acepto el aviso de privacidad</span>
              </label>
            </>
          )}

          {mode === 'verify' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <p style={{ margin: 0, lineHeight: 1.5 }}>
                Enviamos un enlace de verificación a{' '}
                <b>{form.email.trim() || 'tu correo institucional'}</b>. Haz clic en él para
                activar tu cuenta.
              </p>
              <p className="muted" style={{ margin: 0, fontSize: '0.88rem' }}>
                Si no lo ves en unos minutos, revisa tu carpeta de spam o correo no deseado.
              </p>
              <button
                type="button"
                className="btn btn--soft"
                onClick={handleResendVerification}
                disabled={loading || resendAttempts.length >= RESEND_LIMIT}
              >
                {loading
                  ? 'Reenviando…'
                  : resendAttempts.length >= RESEND_LIMIT
                    ? `Límite alcanzado (${RESEND_LIMIT}/${RESEND_LIMIT} por hora)`
                    : `Reenviar correo (${RESEND_LIMIT - resendAttempts.length} restantes)`}
              </button>
            </div>
          )}

          {mode === 'reset' && (
            <>
              <div className="field">
                <label htmlFor="reset-token">Token de recuperación</label>
                <input
                  id="reset-token"
                  name="token"
                  inputMode="numeric"
                  maxLength={8}
                  value={form.token}
                  onChange={onChange}
                  placeholder="Código de 8 dígitos"
                />
              </div>
              <div className="field">
                <label htmlFor="nuevaContrasena">Nueva contraseña</label>
                <PasswordInput
                  key="reset-password"
                  id="nuevaContrasena"
                  name="nuevaContrasena"
                  autoComplete="new-password"
                  value={form.nuevaContrasena}
                  onChange={onChange}
                  placeholder="Mín. 8 chars, Mayús, Núm y Símbolo"
                />
              </div>
              <div className="field">
                <label htmlFor="confirmNuevaContrasena">Confirmar nueva contraseña</label>
                <PasswordInput
                  key="reset-confirm-password"
                  id="confirmNuevaContrasena"
                  name="confirmNuevaContrasena"
                  autoComplete="new-password"
                  value={form.confirmNuevaContrasena}
                  onChange={onChange}
                  placeholder="Repite tu nueva contraseña"
                />
              </div>
            </>
          )}

          {error && <p className="form-error" role="alert">{error}</p>}
          {success && <p className="form-success" role="status">{success}</p>}

          {mode !== 'verify' && (
            <button className="btn btn--action" disabled={loading}>
              {loading
                ? 'Procesando…'
                : mode === 'login'
                  ? 'Entrar'
                  : mode === 'register'
                    ? 'Registrarme'
                    : mode === 'reset'
                      ? 'Guardar nueva contraseña'
                      : 'Enviar enlace'}
            </button>
          )}

          {mode === 'login' && (
            <div style={{ display: 'flex', justifyContent: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="login-link"
                onClick={() => switchMode('forgot')}
              >
                ¿Olvidaste tu contraseña?
              </button>
              <button
                type="button"
                className="login-link"
                onClick={() => switchMode('register')}
              >
                Crear cuenta
              </button>
            </div>
          )}

          {mode === 'forgot' && (
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="login-link"
                onClick={() => switchMode('reset')}
              >
                Ya tengo mi token
              </button>
              <button
                type="button"
                className="login-link"
                onClick={() => switchMode('login')}
              >
                Volver a iniciar sesión
              </button>
            </div>
          )}

          {(mode === 'register' || mode === 'verify' || mode === 'reset') && (
            <button
              type="button"
              className="login-link"
              onClick={() => switchMode('login')}
            >
              Volver a iniciar sesión
            </button>
          )}

          {USE_MOCK && mode === 'login' && (
            <p className="demo-box">
              Modo demo: <b>estudiante@</b>, <b>docente@</b>, <b>admin@</b> o <b>moderador@</b>utvt.edu.mx · contraseña <b>kolab123</b>
            </p>
          )}
        </form>
      </section>
    </div>
  );
}
