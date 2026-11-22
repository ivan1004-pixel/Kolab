import { ChangeEvent, ClipboardEvent, FormEvent, KeyboardEvent, useEffect, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useGoogleLogin } from '@react-oauth/google';
import { useAuth } from '../context/AuthContext';
import { USE_MOCK, gqlRequest } from '../services/api';
import { assertNoScriptInjection } from '../utils/inputSecurity';
import Logo from '../components/Logo';

type AuthMode = 'login' | 'register' | 'verify' | 'forgot' | 'reset';

export default function Login() {
  const { user, login, loginWithGoogle, register, verifyEmail } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const [mode, setMode] = useState<AuthMode>('login');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [otpDigits, setOtpDigits] = useState<string[]>(Array(8).fill(''));
  const otpRefs = useRef<Array<HTMLInputElement | null>>([]);
  const emailInputRef = useRef<HTMLInputElement | null>(null);

  const [form, setForm] = useState({
    nombre: '',
    apellidos: '',
    email: '',
    password: '',
    aceptoPrivacidad: true,
    token: '',
    nuevaContrasena: '',
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleGooglePopup = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      if (!tokenResponse.access_token) {
        setError('Google no devolvió un token válido.');
        return;
      }
      setError('');
      setLoading(true);
      try {
        const gRes = await loginWithGoogle(tokenResponse.access_token);
        if (gRes.requiresVerification) {
          setForm((f) => ({ ...f, email: gRes.correo || f.email }));
          setOtpDigits(Array(8).fill(''));
          setSuccess(gRes.message || 'Te enviamos tu código de 8 dígitos por correo.');
          setMode('verify');
          return;
        }
        navigate((location.state as any)?.from?.pathname ?? '/', { replace: true });
      } catch (err: any) {
        setError(err.message || 'No se pudo iniciar sesión con Google.');
      } finally {
        setLoading(false);
      }
    },
    onError: () => setError('No se pudo completar el inicio de sesión con Google.'),
  });

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
        if (res.autoLoggedIn) {
          navigate('/', { replace: true });
          return;
        }
        setSuccess(res.message || 'Correo verificado. Ya puedes iniciar sesión.');
        setMode('login');
      })
      .catch((err: any) => {
        setError(err.message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [location.pathname, navigate, searchParams, verifyEmail]);

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

  function triggerGoogleLogin() {
    if (!import.meta.env.VITE_GOOGLE_CLIENT_ID) {
      setError('Falta configurar VITE_GOOGLE_CLIENT_ID en frontend/.env.');
      return;
    }
    handleGooglePopup();
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
        if (!form.nombre.trim() || !form.apellidos.trim() || !form.email.trim() || !form.password) {
          throw new Error('Completa todos tus datos para registrarte');
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
          setOtpDigits(Array(8).fill(''));
          setMode('verify');
        }
      } else if (mode === 'verify') {
        const otpCode = otpDigits.join('').trim() || form.token.trim();
        if (!/^\d{8}$/.test(otpCode)) {
          throw new Error('Ingresa los 8 dígitos del código enviado a tu correo');
        }
        const res = await verifyEmail(otpCode);
        if (res.autoLoggedIn) {
          navigate((location.state as any)?.from?.pathname ?? '/', { replace: true });
          return;
        }
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
        if (!form.token.trim() || !form.nuevaContrasena) {
          throw new Error('Ingresa el token y tu nueva contraseña');
        }
        assertNoScriptInjection(form.token, 'token');
        if (USE_MOCK) {
          setSuccess('Contraseña actualizada (modo demo).');
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
          setForm((f) => ({ ...f, password: '', nuevaContrasena: '', token: '' }));
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
    <div className="klogin-root">
      {/* ==================== PANEL IZQUIERDO / MÓVIL ==================== */}
      <section className="klogin-left" data-purpose="login-form-section">
        <div>
          {/* Logo Superior */}
          <div className="klogin-brand-top">
            <Logo size={38} variant="full" />
          </div>

          {/* Ilustración Móvil (Cohete Kolab animado) */}
          <div className="klogin-mobile-hero" aria-hidden="true">
            <svg fill="none" viewBox="0 0 320 220" xmlns="http://www.w3.org/2000/svg">
              <circle cx="160" cy="110" fill="#EBF7EE" r="90" />
              <circle cx="230" cy="70" fill="#F0FDF4" r="28" />
              <g className="cloud-drift" opacity="0.85">
                <path d="M40 130 C40 120 50 112 62 112 C66 102 77 96 90 98 C102 100 110 110 110 120 C118 120 124 126 124 134 C124 142 118 148 110 148 L50 148 C44 148 40 140 40 130 Z" fill="#FFFFFF" />
                <path d="M210 150 C210 142 218 136 228 136 C232 128 241 123 252 125 C262 127 268 135 268 143 C274 143 280 148 280 154 C280 160 274 165 268 165 L220 165 C214 165 210 158 210 150 Z" fill="#FFFFFF" />
              </g>
              <g>
                <ellipse cx="120" cy="155" fill="#F3F4F6" opacity="0.9" rx="35" ry="16" />
                <circle cx="105" cy="148" fill="#E5E7EB" opacity="0.7" r="18" />
                <circle cx="135" cy="162" fill="#E5E7EB" opacity="0.6" r="12" />
                <path className="star-twinkle" d="M245 42 L250 32 L255 42 L265 47 L255 52 L250 62 L245 52 L235 47 Z" fill="#A3E635" />
                <circle className="star-twinkle" cx="85" cy="55" fill="#F59E0B" r="4" />
                <circle cx="240" cy="115" fill="#157F3C" r="3.5" />
                <circle cx="70" cy="80" fill="#EC4899" r="3" />
              </g>
              <g className="rocket-hover">
                <g transform="translate(126, 25) rotate(15)">
                  <path d="M50 0 C70 30 70 85 50 110 C30 85 30 30 50 0 Z" fill="#157F3C" />
                  <path d="M50 0 C64 30 64 85 50 110 C46 95 46 15 50 0 Z" fill="#0C3E21" opacity="0.25" />
                  <path d="M50 0 C58 12 62 25 62 30 L38 30 C38 25 42 12 50 0 Z" fill="#A3E635" />
                  <path d="M34 75 C20 85 14 105 18 114 C26 114 34 102 36 94 Z" fill="#F97316" />
                  <path d="M66 75 C80 85 86 105 82 114 C74 114 66 102 64 94 Z" fill="#F97316" />
                  <circle cx="50" cy="52" fill="#FFFFFF" r="15" stroke="#123642" strokeWidth="2.5" />
                  <circle cx="50" cy="50" fill="#EBF7EE" r="10" />
                  <circle cx="50" cy="48" fill="#F59E0B" r="5" />
                  <path d="M42 59 C42 54 46 52 50 52 C54 52 58 54 58 59 Z" fill="#123642" />
                  <path className="thruster-glow" d="M43 110 L57 110 L50 135 Z" fill="#FBBF24" />
                  <path className="thruster-glow" d="M46 110 L54 110 L50 126 Z" fill="#EF4444" />
                </g>
              </g>
              <g transform="translate(195, 90) rotate(-10)">
                <rect fill="#FFFFFF" height="24" rx="4" stroke="#123642" strokeWidth="1.8" width="34" x="0" y="0" />
                <rect fill="#A3E635" height="3" rx="1.5" width="24" x="5" y="5" />
                <rect fill="#E2E8F0" height="2.5" rx="1.25" width="16" x="5" y="11" />
                <rect fill="#E2E8F0" height="2.5" rx="1.25" width="20" x="5" y="16" />
              </g>
            </svg>
          </div>
        </div>

        {/* Contenido Central del Formulario */}
        <main className="klogin-main fade-up-anim">
          <div className="klogin-header">
            <h1 className="klogin-title">
              {mode === 'login' && 'Iniciar Sesión'}
              {mode === 'register' && 'Crear cuenta'}
              {mode === 'verify' && 'Verifica tu correo'}
              {mode === 'forgot' && 'Recuperar contraseña'}
              {mode === 'reset' && 'Nueva contraseña'}
            </h1>

            <p className="klogin-subtitle klogin-subtitle--desktop">
              {mode === 'login' ? (
                <>
                  ¿No tienes una cuenta aún?
                  <button type="button" className="klogin-switch-btn" onClick={() => switchMode('register')}>
                    Regístrate gratis
                  </button>
                </>
              ) : (
                <>
                  ¿Ya tienes una cuenta?
                  <button type="button" className="klogin-switch-btn" onClick={() => switchMode('login')}>
                    Iniciar sesión
                  </button>
                </>
              )}
            </p>

            <p className="klogin-subtitle klogin-subtitle--mobile" style={{ display: 'none' }}>
              {mode === 'login' && 'Ingresa para acceder a tus notas y salas de estudio'}
              {mode === 'register' && 'Regístrate para recibir tu código de 8 dígitos por Brevo'}
              {mode === 'verify' && 'Ingresa los 8 dígitos enviados a tu correo electrónico'}
              {mode === 'forgot' && 'Te enviaremos un enlace temporal a tu correo'}
              {mode === 'reset' && 'Define tu nueva contraseña segura'}
            </p>
          </div>

          {/* Botón Google Superior (Escritorio) */}
          {mode === 'login' && (
            <>
              <button
                type="button"
                className="klogin-google-top"
                disabled={loading}
                onClick={triggerGoogleLogin}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.66v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.15z" fill="#4285F4" />
                  <path d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.34 24 12 24z" fill="#34A853" />
                  <path d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.14-1.55.38-2.27V6.58H1.25C.45 8.17 0 9.99 0 12s.45 3.83 1.25 5.42l4.03-3.15z" fill="#FBBC05" />
                  <path d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z" fill="#EA4335" />
                </svg>
                <span>Continuar con Google</span>
              </button>

              <div className="klogin-divider klogin-divider--desktop">
                <span>o con tu correo</span>
              </div>
            </>
          )}

          {/* Formulario Principal */}
          <form className="klogin-form" onSubmit={onSubmit} noValidate>
            {mode === 'register' && (
              <div className="klogin-name-grid">
                <div className="klogin-field">
                  <label htmlFor="nombre">Nombre</label>
                  <input
                    className="klogin-input klogin-input--plain"
                    id="nombre"
                    name="nombre"
                    value={form.nombre}
                    onChange={onChange}
                    placeholder="Nombre"
                  />
                </div>
                <div className="klogin-field">
                  <label htmlFor="apellidos">Apellidos</label>
                  <input
                    className="klogin-input klogin-input--plain"
                    id="apellidos"
                    name="apellidos"
                    value={form.apellidos}
                    onChange={onChange}
                    placeholder="Apellidos"
                  />
                </div>
              </div>
            )}

            {(mode === 'login' || mode === 'register' || mode === 'forgot') && (
              <div className="klogin-field">
                <label htmlFor="email">Correo electrónico</label>
                <div className="klogin-input-box">
                  <span className="klogin-icon-left" aria-hidden="true">
                    <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                    </svg>
                  </span>
                  <input
                    ref={emailInputRef}
                    className="klogin-input"
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    value={form.email}
                    onChange={onChange}
                    placeholder="nombre@tucorreo.com"
                  />
                </div>
              </div>
            )}

            {(mode === 'login' || mode === 'register') && (
              <div className="klogin-field">
                <label htmlFor="password">Contraseña</label>
                <div className="klogin-input-box">
                  <span className="klogin-icon-left klogin-icon-lock" aria-hidden="true">
                    <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                    </svg>
                  </span>
                  <input
                    className="klogin-input klogin-input--pwd"
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    value={form.password}
                    onChange={onChange}
                    placeholder={mode === 'register' ? 'Mín. 8 chars, Mayús, Núm y Símbolo' : '••••••••••••'}
                  />
                  <button
                    type="button"
                    className={`klogin-eye-btn ${showPassword ? 'is-active' : ''}`}
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label="Alternar visibilidad de contraseña"
                  >
                    <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                      {showPassword ? (
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                      ) : (
                        <>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </>
                      )}
                    </svg>
                  </button>
                </div>
              </div>
            )}

            {mode === 'login' && (
              <div className="klogin-aux-row">
                <label className="klogin-check-label">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                  />
                  <span>Recordar mi cuenta</span>
                </label>
                <button type="button" className="klogin-forgot-btn" onClick={() => switchMode('forgot')}>
                  ¿Olvidaste tu contraseña?
                </button>
              </div>
            )}

            {mode === 'register' && (
              <label className="klogin-check-label">
                <input
                  type="checkbox"
                  name="aceptoPrivacidad"
                  checked={form.aceptoPrivacidad}
                  onChange={onChange}
                />
                <span>Acepto los Términos de Servicio y la Política de Privacidad</span>
              </label>
            )}

            {mode === 'verify' && (
              <div className="klogin-field">
                <label className="stitch-label" htmlFor="otp-0">
                  Código de verificación (8 dígitos)
                </label>
                <div
                  className="stitch-otp-grid"
                  onPaste={(e: ClipboardEvent<HTMLDivElement>) => {
                    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 8);
                    if (!pasted) return;
                    e.preventDefault();
                    const next = Array(8).fill('');
                    pasted.split('').forEach((ch, idx) => { next[idx] = ch; });
                    setOtpDigits(next);
                    otpRefs.current[Math.min(pasted.length, 7)]?.focus();
                  }}
                >
                  {otpDigits.map((digit, idx) => (
                    <input
                      key={idx}
                      id={`otp-${idx}`}
                      ref={(el) => { otpRefs.current[idx] = el; }}
                      className="stitch-otp-cell"
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, '').slice(-1);
                        const next = [...otpDigits];
                        next[idx] = val;
                        setOtpDigits(next);
                        if (val && idx < 7) {
                          otpRefs.current[idx + 1]?.focus();
                        }
                      }}
                      onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
                        if (e.key === 'Backspace' && !otpDigits[idx] && idx > 0) {
                          otpRefs.current[idx - 1]?.focus();
                        }
                      }}
                      aria-label={`Dígito ${idx + 1}`}
                    />
                  ))}
                </div>
              </div>
            )}

            {mode === 'reset' && (
              <>
                <div className="klogin-field">
                  <label htmlFor="reset-token">Token de recuperación</label>
                  <input
                    className="klogin-input klogin-input--plain"
                    id="reset-token"
                    name="token"
                    value={form.token}
                    onChange={onChange}
                    placeholder="Pega el token recibido por correo"
                  />
                </div>
                <div className="klogin-field">
                  <label htmlFor="nuevaContrasena">Nueva contraseña</label>
                  <input
                    className="klogin-input klogin-input--plain"
                    id="nuevaContrasena"
                    name="nuevaContrasena"
                    type="password"
                    autoComplete="new-password"
                    value={form.nuevaContrasena}
                    onChange={onChange}
                    placeholder="Mín. 8 chars, Mayús, Núm y Símbolo"
                  />
                </div>
              </>
            )}

            {error && <p className="form-error" role="alert">{error}</p>}
            {success && <p className="form-ok" role="status">{success}</p>}

            <button className="klogin-submit-btn" type="submit" disabled={loading}>
              <span>
                {loading
                  ? 'Procesando…'
                  : mode === 'login'
                    ? 'Iniciar Sesión'
                    : mode === 'register'
                      ? 'Registrarme gratis'
                      : mode === 'verify'
                        ? 'Verificar cuenta'
                        : mode === 'reset'
                          ? 'Guardar nueva contraseña'
                          : 'Enviar enlace'}
              </span>
              <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </button>
          </form>

          {/* Opciones Sociales e Institucionales (Móvil) */}
          {mode === 'login' && (
            <div className="klogin-mobile-social">
              <div className="klogin-divider">
                <span>o ingresa con</span>
              </div>
              <div className="klogin-mobile-grid">
                <button
                  type="button"
                  className="klogin-pill-btn klogin-pill-btn--google"
                  disabled={loading}
                  onClick={triggerGoogleLogin}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.66v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.15z" fill="#4285F4" />
                    <path d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.94H1.26v3.15C3.25 21.31 7.32 24 12 24z" fill="#34A853" />
                    <path d="M5.28 14.26c-.25-.72-.38-1.49-.38-2.26s.13-1.54.38-2.26V6.59H1.26C.46 8.18 0 9.99 0 12s.46 3.82 1.26 5.41l4.02-3.15z" fill="#FBBC05" />
                    <path d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.32 0 3.25 2.69 1.26 6.59l4.02 3.15c.95-2.84 3.6-4.94 6.72-4.94z" fill="#EA4335" />
                  </svg>
                  <span>Google</span>
                </button>
                <button
                  type="button"
                  className="klogin-pill-btn klogin-pill-btn--campus"
                  onClick={() => emailInputRef.current?.focus()}
                >
                  <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l9-5-9-5-9 5 9 5z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
                  </svg>
                  <span>Mi Campus</span>
                </button>
              </div>
            </div>
          )}
        </main>

        {/* Footer Escritorio */}
        <footer className="klogin-footer-desktop">
          <p>Copyright © 2026 Kolab Technologies, LLC. Todos los derechos reservados.</p>
          <div className="klogin-footer-links">
            <a href="#terminos" onClick={(e) => e.preventDefault()}>Términos de Servicio</a>
            <span>•</span>
            <a href="#privacidad" onClick={(e) => e.preventDefault()}>Política de Privacidad</a>
            <span>•</span>
            <a href="#soporte" onClick={(e) => { e.preventDefault(); switchMode('forgot'); }}>Soporte</a>
          </div>
        </footer>

        {/* Footer Móvil */}
        <footer className="klogin-footer-mobile">
          <p>
            {mode === 'login' ? (
              <>
                ¿No tienes una cuenta?
                <button type="button" className="klogin-switch-btn" onClick={() => switchMode('register')}>
                  Regístrate aquí
                </button>
              </>
            ) : (
              <>
                ¿Ya tienes una cuenta?
                <button type="button" className="klogin-switch-btn" onClick={() => switchMode('login')}>
                  Inicia sesión
                </button>
              </>
            )}
          </p>
        </footer>
      </section>

      {/* ==================== PANEL DERECHO ILUSTRADO (ESCRITORIO) ==================== */}
      <section className="klogin-right" data-purpose="hero-space-scene">
        <div className="klogin-scene-wrap">
          <svg
            aria-hidden="true"
            className="klogin-scene-svg"
            fill="none"
            preserveAspectRatio="xMidYMax slice"
            viewBox="0 0 1000 900"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <radialGradient cx="50%" cy="30%" id="skyGaze" r="70%">
                <stop offset="0%" stopColor="#0E4A28" stopOpacity="0.8" />
                <stop offset="60%" stopColor="#062212" stopOpacity="0.95" />
                <stop offset="100%" stopColor="#03140A" stopOpacity="1" />
              </radialGradient>
              <linearGradient id="mountGradLeft" x1="0%" x2="100%" y1="0%" y2="100%">
                <stop offset="0%" stopColor="#B45309" stopOpacity="0.85" />
                <stop offset="40%" stopColor="#803407" stopOpacity="0.9" />
                <stop offset="100%" stopColor="#0C3E21" stopOpacity="1" />
              </linearGradient>
              <linearGradient id="mountGradRight" x1="100%" x2="0%" y1="0%" y2="100%">
                <stop offset="0%" stopColor="#F9CB15" stopOpacity="0.8" />
                <stop offset="40%" stopColor="#B45309" stopOpacity="0.85" />
                <stop offset="100%" stopColor="#083019" stopOpacity="1" />
              </linearGradient>
              <linearGradient id="rocketBodyGrad" x1="0%" x2="100%" y1="0%" y2="0%">
                <stop offset="0%" stopColor="#F3F4F6" />
                <stop offset="65%" stopColor="#FFFFFF" />
                <stop offset="100%" stopColor="#D1D5DB" />
              </linearGradient>
              <linearGradient id="rocketFlame" x1="50%" x2="50%" y1="0%" y2="100%">
                <stop offset="0%" stopColor="#FFFFFF" />
                <stop offset="25%" stopColor="#A3E635" />
                <stop offset="70%" stopColor="#157F3C" />
                <stop offset="100%" stopColor="#0C3E21" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="smokeCloudGrad" x1="50%" x2="50%" y1="0%" y2="100%">
                <stop offset="0%" stopColor="#FFFFFF" />
                <stop offset="45%" stopColor="#EAF7EE" />
                <stop offset="100%" stopColor="#CFEED8" />
              </linearGradient>
              <linearGradient id="baseGroundGrad" x1="50%" x2="50%" y1="0%" y2="100%">
                <stop offset="0%" stopColor="#0F512B" />
                <stop offset="40%" stopColor="#0C3E21" />
                <stop offset="100%" stopColor="#051C0F" />
              </linearGradient>
            </defs>

            <rect fill="url(#skyGaze)" height="900" width="1000" />

            <g opacity="0.85">
              <path d="M480 180 L540 230" opacity="0.4" stroke="#A3E635" strokeLinecap="round" strokeWidth="2" />
              <path d="M800 240 L880 300" opacity="0.35" stroke="#F9CB15" strokeLinecap="round" strokeWidth="1.8" />
              <path d="M220 220 L180 250" opacity="0.3" stroke="#FFFFFF" strokeLinecap="round" strokeWidth="1.5" />
              <circle className="star-twinkle" cx="150" cy="120" fill="#FFFFFF" r="1.5" />
              <circle className="star-twinkle" cx="280" cy="90" fill="#A3E635" opacity="0.9" r="2" />
              <circle cx="390" cy="160" fill="#FFFFFF" opacity="0.6" r="1.5" />
              <circle className="star-twinkle" cx="640" cy="110" fill="#FFFFFF" r="2.5" />
              <circle cx="780" cy="80" fill="#A3E635" r="1.5" />
              <circle className="star-twinkle" cx="890" cy="170" fill="#FFFFFF" opacity="0.7" r="2" />
              <circle cx="470" cy="70" fill="#FFFFFF" opacity="0.5" r="1.5" />
              <circle className="star-twinkle" cx="560" cy="140" fill="#F9CB15" opacity="0.7" r="2" />
              <circle cx="120" cy="280" fill="#FFFFFF" opacity="0.4" r="1.8" />
              <circle cx="940" cy="320" fill="#FFFFFF" opacity="0.6" r="2.2" />
            </g>

            <g opacity="0.25">
              <path d="M420 100 Q450 80 480 100 Q510 120 480 140 Q440 140 420 100Z" fill="#3B82F6" />
              <path d="M580 130 Q630 110 670 140 Q690 170 650 180 Q600 180 580 130Z" fill="#A855F7" />
              <path d="M180 260 Q220 240 250 270 Q240 290 200 290 Q170 280 180 260Z" fill="#157F3C" />
              <path d="M910 210 Q940 190 980 220 Q960 250 930 240Z" fill="#157F3C" />
            </g>

            <polygon fill="url(#mountGradLeft)" points="40,900 120,530 230,440 320,550 420,430 520,680 480,900" />
            <polygon fill="#9F1239" opacity="0.35" points="120,530 230,440 280,590 170,680" />
            <polygon fill="#F9CB15" opacity="0.25" points="320,550 420,430 460,560 370,670" />

            <polygon fill="url(#mountGradRight)" points="560,900 680,660 760,520 840,460 930,380 1000,480 1000,900" />
            <polygon fill="#F9CB15" opacity="0.4" points="760,520 840,460 880,590 800,680" />
            <polygon fill="#B45309" opacity="0.5" points="840,460 930,380 970,540 890,650" />

            <text fill="#FFFFFF" fillOpacity="0.05" fontFamily="'Nunito', sans-serif" fontSize="110" fontWeight="900" letterSpacing="8" textAnchor="middle" x="500" y="720">
              KOLAB
            </text>

            <g className="thruster-glow">
              <polygon fill="url(#rocketFlame)" points="488,520 512,520 520,650 500,720 480,650" />
              <ellipse cx="500" cy="540" fill="#FFFFFF" opacity="0.9" rx="9" ry="32" />
            </g>

            <g className="rocket-hover">
              <path d="M472 470 L435 528 C432 533 438 538 444 536 L474 522 Z" fill="#157F3C" />
              <path d="M465 480 L442 530 L452 530 Z" fill="#0C3E21" opacity="0.4" />
              <path d="M528 470 L565 528 C568 533 562 538 556 536 L526 522 Z" fill="#157F3C" />
              <path d="M535 480 L558 530 L548 530 Z" fill="#0C3E21" opacity="0.4" />
              <path d="M485 515 H515 L519 532 H481 Z" fill="#0C3E21" />
              <rect fill="#A3E635" height="5" rx="2" width="26" x="487" y="528" />
              <path d="M500 320 C465 390 465 480 472 522 H528 C535 480 535 390 500 320 Z" fill="url(#rocketBodyGrad)" />
              <path d="M500 320 C484 353 478 382 475 400 H525 C522 382 516 353 500 320 Z" fill="#157F3C" />
              <path d="M500 320 C490 340 482 360 480 375 H520 C518 360 510 340 500 320 Z" fill="#A3E635" />
              <line stroke="#E5E7EB" strokeDasharray="3 3" strokeWidth="2" x1="500" x2="500" y1="410" y2="520" />
              <circle cx="500" cy="442" fill="#123642" r="19" stroke="#A3E635" strokeWidth="3.5" />
              <circle cx="500" cy="442" fill="#0EA5E9" r="14" />
              <path d="M492 434 Q498 430 506 433" opacity="0.8" stroke="#FFFFFF" strokeLinecap="round" strokeWidth="2.5" />
              <circle cx="506" cy="448" fill="#FFFFFF" opacity="0.9" r="2.5" />
            </g>

            <g className="cloud-drift">
              <circle cx="420" cy="720" fill="#B3E6C2" opacity="0.6" r="75" />
              <circle cx="580" cy="720" fill="#B3E6C2" opacity="0.6" r="75" />
              <circle cx="500" cy="690" fill="#C7F0D3" opacity="0.8" r="85" />
              <circle cx="340" cy="760" fill="url(#smokeCloudGrad)" r="60" />
              <circle cx="400" cy="735" fill="url(#smokeCloudGrad)" r="70" />
              <circle cx="465" cy="705" fill="#FFFFFF" r="72" />
              <circle cx="535" cy="705" fill="#FFFFFF" r="72" />
              <circle cx="600" cy="735" fill="url(#smokeCloudGrad)" r="70" />
              <circle cx="660" cy="760" fill="url(#smokeCloudGrad)" r="60" />
              <circle cx="280" cy="775" fill="url(#smokeCloudGrad)" r="45" />
              <circle cx="720" cy="775" fill="url(#smokeCloudGrad)" r="45" />
              <circle cx="430" cy="770" fill="#FFFFFF" r="50" />
              <circle cx="570" cy="770" fill="#FFFFFF" r="50" />
              <circle cx="500" cy="755" fill="#FFFFFF" r="65" />
            </g>

            <path d="M0 760 Q250 710 500 760 T1000 750 V900 H0 Z" fill="url(#baseGroundGrad)" />
            <path d="M0 800 Q300 760 600 810 T1000 790 V900 H0 Z" fill="#0C3E21" opacity="0.75" />
            <path d="M0 835 Q200 805 500 840 T1000 820 V900 H0 Z" fill="#062212" />
          </svg>

          <div className="klogin-scene-caption">
            <p className="klogin-scene-caption__kicker">
              Plataforma Universitaria &amp; Escolar Kolab
            </p>
            <p className="klogin-scene-caption__sub">
              Tus apuntes, tareas y grupo colaborativo en un solo lugar
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
