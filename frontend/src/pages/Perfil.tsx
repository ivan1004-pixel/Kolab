import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { MODULES } from '../data/modules';
import { USE_MOCK, gqlRequest } from '../services/api';
import { assertNoScriptInjection } from '../utils/inputSecurity';
import ImageCropModal from '../components/ImageCropModal';
import ModuleBanner from '../components/ModuleBanner';
import Skeleton, { RowListSkeleton } from '../components/Skeleton';

const ROLE_LABELS: Record<string, string> = {
  estudiante: 'Estudiante',
  docente: 'Docente',
  admin: 'Administrador',
  ESTUDIANTE: 'Estudiante',
  DOCENTE: 'Docente',
  ADMINISTRADOR: 'Administrador',
};

const ROLE_TO_ENUM: Record<string, string> = {
  estudiante: 'ESTUDIANTE',
  docente: 'DOCENTE',
  admin: 'ADMINISTRADOR',
};

interface CuentaItem {
  _id: string;
  nombre: string;
  apellidos: string;
  correo: string;
  rol: string;
  isActive?: boolean;
}

interface CarreraOption {
  _id: string;
  nombre: string;
}

interface AuditLogItem {
  _id: string;
  accion: string;
  entidad?: string;
  detalles?: string;
  createdAt: string;
}

export default function Perfil() {
  const { user, token, updateProfile, refreshUser, logout } = useAuth();

  const [carreras, setCarreras] = useState<CarreraOption[]>([]);
  const [form, setForm] = useState({
    nombre: user?.nombre ?? '',
    apellidos: user?.apellidos ?? '',
    foto_url: user?.foto_url ?? '',
    idCarrera: user?.idCarrera ?? '',
    cuatrimestre: user?.cuatrimestre ?? '',
    grupo: user?.grupo ?? '',
  });
  const [prefs, setPrefs] = useState({
    notificacionesPlataforma: user?.preferencias?.notificacionesPlataforma ?? true,
    notificacionesCorreo: user?.preferencias?.notificacionesCorreo ?? true,
    mostrarEnRanking: user?.preferencias?.mostrarEnRanking ?? true,
  });
  const [badgesCount, setBadgesCount] = useState(user?.insignias ?? 0);
  const [myResourcesCount, setMyResourcesCount] = useState(0);
  const [mySolvedCount, setMySolvedCount] = useState(0);
  const [pendingCropSrc, setPendingCropSrc] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [isPhotoLoading, setIsPhotoLoading] = useState(false);
  const [photoMsg, setPhotoMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const [dataMsg, setDataMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const [prefMsg, setPrefMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    setForm({
      nombre: user?.nombre ?? '',
      apellidos: user?.apellidos ?? '',
      foto_url: user?.foto_url ?? '',
      idCarrera: user?.idCarrera ?? '',
      cuatrimestre: user?.cuatrimestre ?? '',
      grupo: user?.grupo ?? '',
    });
    setPrefs({
      notificacionesPlataforma: user?.preferencias?.notificacionesPlataforma ?? true,
      notificacionesCorreo: user?.preferencias?.notificacionesCorreo ?? true,
      mostrarEnRanking: user?.preferencias?.mostrarEnRanking ?? true,
    });
  }, [user?.nombre, user?.apellidos, user?.foto_url, user?.idCarrera, user?.cuatrimestre, user?.grupo, user?.preferencias]);

  useEffect(() => {
    if (USE_MOCK || !token) return;
    gqlRequest<{
      misInsignias: Array<{ _id: string }>;
      carreras: CarreraOption[];
      recursos: Array<{ _id: string; idUsuario: string }>;
      preguntas: Array<{ _id: string; idUsuario: string; resuelta: boolean }>;
    }>(
      `query PerfilStats {
        misInsignias { _id }
        carreras { _id nombre }
        recursos { _id idUsuario }
        preguntas { _id idUsuario resuelta }
      }`,
      {},
      token,
    )
      .then((res) => {
        setBadgesCount(res.misInsignias?.length ?? 0);
        setCarreras(res.carreras ?? []);
        const uid = String(user?.id ?? '');
        setMyResourcesCount((res.recursos ?? []).filter((r) => String(r.idUsuario) === uid).length);
        setMySolvedCount((res.preguntas ?? []).filter((p) => String(p.idUsuario) === uid && p.resuelta).length);
      })
      .catch(() => {});
  }, [token, user?.id]);

  const onChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm((f) => ({
      ...f,
      [e.target.name]: e.target.value,
    }));
  };

  const formatSaveError = (err: any, fallback: string) => {
    const raw = String(err?.message || '');
    if (/NetworkError|Failed to fetch|fetch/i.test(raw)) {
      return `${fallback} No hay conexión con el servidor (verifica que el backend esté activo).`;
    }
    return raw || fallback;
  };

  const onPhotoChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setPhotoMsg({ type: 'error', text: 'No se pudo cargar: selecciona un archivo de imagen válido.' });
      e.target.value = '';
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setPhotoMsg({ type: 'error', text: 'No se pudo cargar: la imagen no debe pesar más de 5 MB.' });
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    setIsPhotoLoading(true);
    reader.onload = () => {
      setIsPhotoLoading(false);
      setPendingCropSrc(String(reader.result || ''));
      setPhotoMsg(null);
    };
    reader.onerror = () => {
      setIsPhotoLoading(false);
      setPhotoMsg({ type: 'error', text: 'No se pudo leer la imagen seleccionada.' });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };


  async function handleCropConfirm(resultDataUrl: string) {
    setForm((f) => ({ ...f, foto_url: resultDataUrl }));
    setPendingCropSrc(null);
    setSaving(true);
    setPhotoMsg(null);
    try {
      await updateProfile({ foto_url: resultDataUrl });
      setPhotoMsg({ type: 'ok', text: 'La imagen se subió y guardó correctamente.' });
    } catch (err: any) {
      setPhotoMsg({
        type: 'error',
        text: formatSaveError(err, 'No se pudo subir la imagen.'),
      });
    } finally {
      setSaving(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setDataMsg(null);

    if (!form.nombre.trim() || !form.apellidos.trim()) {
      return setDataMsg({ type: 'error', text: 'No se pudieron actualizar los datos: nombre y apellidos son obligatorios.' });
    }

    setSaving(true);
    try {
      assertNoScriptInjection(
        { nombre: form.nombre, apellidos: form.apellidos, cuatrimestre: form.cuatrimestre, grupo: form.grupo },
        'perfil',
      );
      await updateProfile({
        nombre: form.nombre.trim(),
        apellidos: form.apellidos.trim(),
        foto_url: form.foto_url,
        ...(form.idCarrera ? { idCarrera: form.idCarrera } : {}),
        cuatrimestre: form.cuatrimestre.trim(),
        grupo: form.grupo.trim(),
      });
      setDataMsg({ type: 'ok', text: 'Tus datos se actualizaron correctamente.' });
    } catch (err: any) {
      setDataMsg({
        type: 'error',
        text: formatSaveError(err, 'No se pudieron actualizar tus datos.'),
      });
    } finally {
      setSaving(false);
    }
  }

  async function onSavePreferences(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setSavingPrefs(true);
    setPrefMsg(null);
    try {
      await gqlRequest(
        `mutation ActualizarPrefs($input: UpdatePreferenciasInput!) {
          actualizarPreferencias(input: $input) { _id }
        }`,
        { input: prefs },
        token,
      );
      await refreshUser();
      setPrefMsg({ type: 'ok', text: 'Preferencias guardadas correctamente.' });
    } catch (err: any) {
      setPrefMsg({ type: 'error', text: formatSaveError(err, 'No se pudieron guardar tus preferencias.') });
    } finally {
      setSavingPrefs(false);
    }
  }

  async function handleDeleteAccount() {
    if (!token) return;
    const confirmed = window.confirm(
      '¿Seguro que deseas eliminar tu cuenta y solicitar la baja de tus datos personales (RF-54)? Esta acción cerrará tu sesión inmediatamente.',
    );
    if (!confirmed) return;
    try {
      await gqlRequest(`mutation EliminarCuenta { eliminarMiCuenta }`, {}, token);
      await logout();
    } catch (err: any) {
      setPrefMsg({ type: 'error', text: formatSaveError(err, 'No se pudo procesar la baja de tu cuenta.') });
    }
  }

  function onCancel() {
    setForm({
      nombre: user?.nombre ?? '',
      apellidos: user?.apellidos ?? '',
      foto_url: user?.foto_url ?? '',
      idCarrera: user?.idCarrera ?? '',
      cuatrimestre: user?.cuatrimestre ?? '',
      grupo: user?.grupo ?? '',
    });
    setDataMsg(null);
    setPhotoMsg(null);
  }

  const currentCareerName = carreras.find((c) => c._id === form.idCarrera)?.nombre || user?.carrera || 'Sin carrera asignada';

  return (
    <>
      <ModuleBanner module={MODULES[0]} />

      <div className="split">
        <section className="card profile-card" aria-label="Perfil público">
          <label className="avatar avatar--lg avatar-upload" htmlFor="foto-perfil">

{isPhotoLoading ? (
  <Skeleton
    variant="circle"
    width="100%"
    height="100%"
    className="profile-photo-skeleton"
  />
) : form.foto_url ? (
  <img
    src={form.foto_url}
    alt="Fotografía de perfil"
  />
) : (
  <span>{form.nombre?.[0]?.toUpperCase() || '?'}</span>
)}


            <span className="avatar-upload__overlay">
              <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 16V4" />
                <path d="m7 9 5-5 5 5" />
                <path d="M20 16.5v2A1.5 1.5 0 0 1 18.5 20h-13A1.5 1.5 0 0 1 4 18.5v-2" />
              </svg>
              <span>Subir foto</span>
            </span>

            <input
              id="foto-perfil"
              className="avatar-upload__input"
              type="file"
              accept="image/*"
              onChange={onPhotoChange}
              aria-label="Seleccionar fotografía de perfil"
            />
          </label>

          <p className="profile-photo-hint">Pasa el cursor sobre tu foto o usa el botón para subirla</p>
          <label className="btn btn--ghost btn--sm" htmlFor="foto-perfil" style={{ cursor: 'pointer' }}>
            Subir imagen
          </label>
          {photoMsg && (
            <p className={photoMsg.type === 'ok' ? 'form-ok' : 'form-error'} role="status">
              {photoMsg.text}
            </p>
          )}

          <h2>{user?.nombre} {user?.apellidos}</h2>
          <span className="chip chip--solid">{ROLE_LABELS[user?.rol ?? 'estudiante'] ?? 'Estudiante'}</span>
          <p className="muted">
            {currentCareerName}
            {form.cuatrimestre ? ` · ${form.cuatrimestre}` : ''}
            {form.grupo ? ` · Grupo ${form.grupo}` : ''}
          </p>

          <div className="row" style={{ justifyContent: 'center' }}>
            <span className="chip chip--xp">{user?.xp ?? 0} XP</span>
            <span className="chip chip--soft">{badgesCount} insignias</span>
            <span className="chip chip--soft">🔥 {user?.rachaActual ?? 0}d (máx. {user?.rachaMasLarga ?? 0}d)</span>
            <span className="chip chip--soft">{myResourcesCount} recursos</span>
            <span className="chip chip--soft">{mySolvedCount} dudas resueltas</span>
          </div>
        </section>

        <div className="skeleton-stack">
          <form className="card" onSubmit={onSubmit} noValidate>
            <h2 className="card__title">Editar perfil académico (RF-51)</h2>

            <div className="form-grid">
              <div className="field">
                <label htmlFor="nombre">Nombre</label>
                <input id="nombre" name="nombre" value={form.nombre} onChange={onChange} />
              </div>

              <div className="field">
                <label htmlFor="apellidos">Apellidos</label>
                <input id="apellidos" name="apellidos" value={form.apellidos} onChange={onChange} />
              </div>

              <div className="field">
                <label htmlFor="idCarrera">Carrera</label>
                <select id="idCarrera" name="idCarrera" value={form.idCarrera} onChange={onChange}>
                  <option value="">Selecciona tu carrera</option>
                  {carreras.map((c) => (
                    <option key={c._id} value={c._id}>{c.nombre}</option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label htmlFor="cuatrimestre">Cuatrimestre</label>
                <input id="cuatrimestre" name="cuatrimestre" value={form.cuatrimestre} onChange={onChange} placeholder="Ej. 5° Cuatrimestre" />
              </div>

              <div className="field">
                <label htmlFor="grupo">Grupo</label>
                <input id="grupo" name="grupo" value={form.grupo} onChange={onChange} placeholder="Ej. 5A" />
              </div>
            </div>

            {dataMsg && (
              <p className={dataMsg.type === 'ok' ? 'form-ok' : 'form-error'} role="status">
                {dataMsg.text}
              </p>
            )}

            <div className="row">
              <button className="btn btn--primary" type="submit" disabled={saving}>
                {saving ? 'Guardando…' : 'Guardar cambios'}
              </button>
              <button type="button" className="btn btn--ghost" onClick={onCancel} disabled={saving}>Cancelar</button>
            </div>
          </form>

          {/* RF-53, RF-58 y RF-54: Preferencias y baja de cuenta */}
          <form className="card" onSubmit={onSavePreferences}>
            <h2 className="card__title">Preferencias, notificaciones y privacidad (RF-53 / RF-58)</h2>
            <label className="pref-row">
              <span>Notificaciones dentro de la plataforma</span>
              <input
                type="checkbox"
                checked={prefs.notificacionesPlataforma}
                onChange={(e) => setPrefs((p) => ({ ...p, notificacionesPlataforma: e.target.checked }))}
              />
            </label>
            <label className="pref-row">
              <span>Notificaciones y recordatorios de racha por correo</span>
              <input
                type="checkbox"
                checked={prefs.notificacionesCorreo}
                onChange={(e) => setPrefs((p) => ({ ...p, notificacionesCorreo: e.target.checked }))}
              />
            </label>
            <label className="pref-row">
              <span>Aparecer en el ranking por grupo y asignatura (RF-42)</span>
              <input
                type="checkbox"
                checked={prefs.mostrarEnRanking}
                onChange={(e) => setPrefs((p) => ({ ...p, mostrarEnRanking: e.target.checked }))}
              />
            </label>
            {prefMsg && (
              <p className={prefMsg.type === 'ok' ? 'form-ok' : 'form-error'} role="status">{prefMsg.text}</p>
            )}
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <button className="btn btn--primary btn--sm" type="submit" disabled={savingPrefs}>
                {savingPrefs ? 'Guardando…' : 'Guardar preferencias'}
              </button>
              <button type="button" className="btn btn--danger btn--sm" onClick={handleDeleteAccount}>
                Eliminar mi cuenta (RF-54)
              </button>
            </div>
          </form>
        </div>
      </div>

      {user?.rol === 'admin' && (
        <div className="skeleton-stack">
          <Cuentas />
          <AdminIaYBitacora />
        </div>
      )}

      {pendingCropSrc && (
        <ImageCropModal
          src={pendingCropSrc}
          onCancel={() => setPendingCropSrc(null)}
          onConfirm={handleCropConfirm}
        />
      )}
    </>
  );
}

function Cuentas() {
  const { token } = useAuth();
  const [cuentas, setCuentas] = useState<CuentaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ nombre: '', apellidos: '', correo: '', contrasena: '', rol: 'estudiante' });
  const [secError, setSecError] = useState('');
  const [okMsg, setOkMsg] = useState('');

  useEffect(() => {
    if (USE_MOCK || !token) return;
    setLoading(true);
    gqlRequest<{ usuarios: CuentaItem[] }>(
      `query UsuariosAdmin { usuarios { _id nombre apellidos correo rol isActive } }`,
      {},
      token,
    )
      .then((res) => setCuentas(res.usuarios ?? []))
      .catch((err: any) => setSecError(err.message || 'No se pudieron cargar las cuentas.'))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleRoleChange(id: string, nuevoRol: string) {
    if (!token) return;
    setSecError('');
    setOkMsg('');
    try {
      const res = await gqlRequest<{ adminActualizarUsuario: CuentaItem }>(
        `mutation CambiarRol($id: ID!, $rol: RolUsuario!) {
          adminActualizarUsuario(id: $id, input: { rol: $rol }) { _id nombre apellidos correo rol isActive }
        }`,
        { id, rol: nuevoRol },
        token,
      );
      setCuentas((prev) => prev.map((c) => (c._id === id ? res.adminActualizarUsuario : c)));
      setOkMsg('Rol actualizado y registrado en bitácora.');
    } catch (err: any) {
      setSecError(err.message || 'No se pudo cambiar el rol.');
    }
  }

  async function handleDeleteUser(id: string, correo: string) {
    if (!token) return;
    if (!window.confirm(`¿Dar de baja la cuenta ${correo}?`)) return;
    try {
      await gqlRequest(`mutation BajaUsr($id: ID!) { adminEliminarUsuario(id: $id) }`, { id }, token);
      setCuentas((prev) => prev.filter((c) => c._id !== id));
      setOkMsg(`Cuenta ${correo} dada de baja correctamente.`);
    } catch (err: any) {
      setSecError(err.message || 'No se pudo dar de baja al usuario.');
    }
  }

  const onChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  };

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSecError('');
    setOkMsg('');
    if (!form.nombre.trim() || !form.apellidos.trim() || !form.correo.includes('@') || form.contrasena.length < 8) {
      return setSecError('Completa nombre, apellidos, correo válido y contraseña de al menos 8 caracteres.');
    }
    try {
      assertNoScriptInjection(form, 'cuentas');
      const res = await gqlRequest<{ adminCrearUsuario: CuentaItem }>(
        `mutation AdminCrearUsuario($input: AdminCreateUsuarioInput!) {
          adminCrearUsuario(input: $input) { _id nombre apellidos correo rol }
        }`,
        {
          input: {
            nombre: form.nombre.trim(),
            apellidos: form.apellidos.trim(),
            correo: form.correo.trim(),
            contrasena: form.contrasena,
            rol: ROLE_TO_ENUM[form.rol] ?? 'ESTUDIANTE',
          },
        },
        token ?? undefined,
      );
      setCuentas((c) => [res.adminCrearUsuario, ...c]);
      setForm({ nombre: '', apellidos: '', correo: '', contrasena: '', rol: 'estudiante' });
      setOkMsg('Cuenta registrada correctamente.');
    } catch (err: any) {
      setSecError(err.message || 'No se pudo registrar la cuenta.');
    }
  }

  return (
    <section className="card">
      <h2 className="card__title">Cuentas y roles · solo Administrador</h2>

      {loading ? (
        <RowListSkeleton count={4} />
      ) : cuentas.length === 0 ? (
        <p className="empty">No hay cuentas registradas para mostrar.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Correo</th>
                <th>Rol</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {cuentas.map((c) => (
                <tr key={c._id}>
                  <td>{c.nombre} {c.apellidos}</td>
                  <td>{c.correo}</td>
                  <td>
                    <select
                      aria-label={`Rol de ${c.correo}`}
                      value={c.rol}
                      onChange={(e) => handleRoleChange(c._id, e.target.value)}
                      style={{ minHeight: 34, padding: '0 0.5rem', borderRadius: 8, border: '1px solid var(--borde)' }}
                    >
                      <option value="ESTUDIANTE">Estudiante</option>
                      <option value="DOCENTE">Docente</option>
                      <option value="ADMINISTRADOR">Administrador</option>
                    </select>
                  </td>
                  <td>
                    <button type="button" className="btn btn--danger btn--sm" onClick={() => handleDeleteUser(c._id, c.correo)}>
                      Dar de baja
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {secError && <p className="form-error" role="alert">{secError}</p>}
      {okMsg && <p className="form-ok" role="status">{okMsg}</p>}

      <form className="form-grid" onSubmit={onSubmit}>
        <div className="field">
          <label htmlFor="c-nombre">Nombre</label>
          <input id="c-nombre" name="nombre" value={form.nombre} onChange={onChange} />
        </div>

        <div className="field">
          <label htmlFor="c-apellidos">Apellidos</label>
          <input id="c-apellidos" name="apellidos" value={form.apellidos} onChange={onChange} />
        </div>

        <div className="field">
          <label htmlFor="c-correo">Correo</label>
          <input id="c-correo" name="correo" type="email" value={form.correo} onChange={onChange} />
        </div>

        <div className="field">
          <label htmlFor="c-pass">Contraseña temporal</label>
          <input id="c-pass" name="contrasena" type="password" value={form.contrasena} onChange={onChange} />
        </div>

        <div className="field">
          <label htmlFor="c-rol">Rol</label>
          <select id="c-rol" name="rol" value={form.rol} onChange={onChange}>
            <option value="estudiante">Estudiante</option>
            <option value="docente">Docente</option>
            <option value="admin">Administrador</option>
          </select>
        </div>

        <div className="field" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn--primary" type="submit">+ Registrar cuenta</button>
        </div>
      </form>
    </section>
  );
}

function AdminIaYBitacora() {
  const { token } = useAuth();
  const [modelo, setModelo] = useState('gemini-3.1-flash-lite');
  const [temperatura, setTemperatura] = useState(0.3);
  const [limite, setLimite] = useState(10);
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (USE_MOCK || !token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    gqlRequest<{
      aiConfig: { modelo: string; temperatura: number; limiteConsultasDiarias: number };
      auditoriaLogs: AuditLogItem[];
    }>(
      `query AdminSystem {
        aiConfig { modelo temperatura limiteConsultasDiarias }
        auditoriaLogs { _id accion entidad detalles createdAt }
      }`,
      {},
      token,
    )
      .then((res) => {
        if (res.aiConfig) {
          setModelo(res.aiConfig.modelo);
          setTemperatura(res.aiConfig.temperatura);
          setLimite(res.aiConfig.limiteConsultasDiarias);
        }
        setLogs((res.auditoriaLogs ?? []).slice(0, 25));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  async function saveAiConfig(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    try {
      await gqlRequest(
        `mutation ConfigIA($modelo: String, $temp: Float, $lim: Int) {
          configurarIa(modelo: $modelo, temperatura: $temp, limiteConsultasDiarias: $lim) {
            modelo temperatura limiteConsultasDiarias
          }
        }`,
        { modelo, temp: Number(temperatura), lim: Number(limite) },
        token,
      );
      setMsg('Parámetros del motor de IA guardados.');
    } catch (err: any) {
      setMsg(err.message || 'No se pudo actualizar la configuración de IA.');
    }
  }

  return (
    <div className="td-grid-2">
      <form className="card" onSubmit={saveAiConfig}>
        <h2 className="card__title">Configuración del motor de IA (RF-33)</h2>
        <div className="field">
          <label htmlFor="ai-model">Modelo Gemini</label>
          <input id="ai-model" value={modelo} onChange={(e) => setModelo(e.target.value)} />
        </div>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="ai-temp">Temperatura (0.0 - 1.0)</label>
            <input id="ai-temp" type="number" step="0.1" min={0} max={1} value={temperatura} onChange={(e) => setTemperatura(Number(e.target.value))} />
          </div>
          <div className="field">
            <label htmlFor="ai-lim">Límite diario por usuario (RF-75)</label>
            <input id="ai-lim" type="number" min={1} max={100} value={limite} onChange={(e) => setLimite(Number(e.target.value))} />
          </div>
        </div>
        {msg && <p className="form-ok" role="status">{msg}</p>}
        <button type="submit" className="btn btn--primary btn--sm" style={{ alignSelf: 'flex-start' }}>
          Guardar parámetros IA
        </button>
      </form>

      <section className="card">
        <h2 className="card__title">Bitácora de auditoría (RF-34 / RNF-17)</h2>
        {loading ? (
          <RowListSkeleton count={4} />
        ) : logs.length === 0 ? (
          <p className="empty">No hay eventos registrados en la bitácora todavía.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Acción</th>
                  <th>Detalle</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l._id}>
                    <td>{new Date(l.createdAt).toLocaleString('es-MX')}</td>
                    <td><span className="chip chip--soft">{l.accion}</span></td>
                    <td>{l.detalles || l.entidad || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
