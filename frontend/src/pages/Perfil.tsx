import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { MODULES } from '../data/modules';
import { USE_MOCK, gqlRequest } from '../services/api';
import { assertNoScriptInjection } from '../utils/inputSecurity';
import ModuleBanner from '../components/ModuleBanner';

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
}

export default function Perfil() {
  const { user, token, updateProfile } = useAuth();

  const [form, setForm] = useState({
    nombre: user?.nombre ?? '',
    apellidos: user?.apellidos ?? '',
    foto_url: user?.foto_url ?? '',
  });
  const [badgesCount, setBadgesCount] = useState(user?.insignias ?? 0);
  const [msg, setMsg] = useState({ type: '', text: '' });

  useEffect(() => {
    if (USE_MOCK || !token) return;
    gqlRequest<{ misInsignias: Array<{ _id: string }> }>(
      `query MisInsignias { misInsignias { _id } }`,
      {},
      token,
    )
      .then((res) => setBadgesCount(res.misInsignias?.length ?? 0))
      .catch(() => {});
  }, [token]);

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    setForm((f) => ({
      ...f,
      [e.target.name]: e.target.value,
    }));
  };

  const onPhotoChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setMsg({ type: 'error', text: 'Selecciona un archivo de imagen válido.' });
      e.target.value = '';
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setMsg({ type: 'error', text: 'La imagen no debe pesar más de 5 MB.' });
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setForm((f) => ({ ...f, foto_url: String(reader.result || '') }));
      setMsg({ type: '', text: '' });
    };
    reader.onerror = () => {
      setMsg({ type: 'error', text: 'No se pudo cargar la imagen.' });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  async function onSubmit(e: FormEvent) {
    e.preventDefault();

    if (!form.nombre.trim() || !form.apellidos.trim()) {
      return setMsg({ type: 'error', text: 'Nombre y apellidos son obligatorios.' });
    }

    try {
      assertNoScriptInjection({ nombre: form.nombre, apellidos: form.apellidos }, 'perfil');
      await updateProfile({
        ...form,
        nombre: form.nombre.trim(),
        apellidos: form.apellidos.trim(),
      });
      setMsg({ type: 'ok', text: 'Cambios guardados correctamente.' });
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
    }
  }

  function onCancel() {
    setForm({
      nombre: user?.nombre ?? '',
      apellidos: user?.apellidos ?? '',
      foto_url: user?.foto_url ?? '',
    });
    setMsg({ type: '', text: '' });
  }

  return (
    <>
      <ModuleBanner module={MODULES[0]} />

      <div className="split">
        <section className="card profile-card" aria-label="Perfil público">
          <label className="avatar avatar--lg avatar-upload" htmlFor="foto-perfil">
            {form.foto_url ? (
              <img src={form.foto_url} alt="Fotografía de perfil" />
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

          <p className="profile-photo-hint">Pasa el cursor sobre tu foto para cambiarla</p>

          <h2>{user?.nombre} {user?.apellidos}</h2>
          <span className="chip chip--solid">{ROLE_LABELS[user?.rol ?? 'estudiante'] ?? 'Estudiante'}</span>
          <p className="muted">{user?.carrera || 'Sin carrera asignada'}</p>

          <div className="row">
            <span className="chip chip--xp">{user?.xp ?? 0} XP</span>
            <span className="chip chip--soft">{badgesCount} insignias</span>
          </div>
        </section>

        <form className="card" onSubmit={onSubmit} noValidate>
          <h2 className="card__title">Editar datos permitidos</h2>

          <div className="form-grid">
            <div className="field">
              <label htmlFor="nombre">Nombre</label>
              <input id="nombre" name="nombre" value={form.nombre} onChange={onChange} />
            </div>

            <div className="field">
              <label htmlFor="apellidos">Apellidos</label>
              <input id="apellidos" name="apellidos" value={form.apellidos} onChange={onChange} />
            </div>
          </div>

          {msg.text && (
            <p className={msg.type === 'ok' ? 'form-ok' : 'form-error'} role="status">
              {msg.text}
            </p>
          )}

          <div className="row">
            <button className="btn btn--primary" type="submit">Guardar</button>
            <button type="button" className="btn btn--ghost" onClick={onCancel}>Cancelar</button>
          </div>
        </form>
      </div>

      {user?.rol === 'admin' && <Cuentas />}
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
      `query UsuariosAdmin { usuarios { _id nombre apellidos correo rol } }`,
      {},
      token,
    )
      .then((res) => setCuentas(res.usuarios ?? []))
      .catch((err: any) => setSecError(err.message || 'No se pudieron cargar las cuentas.'))
      .finally(() => setLoading(false));
  }, [token]);

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
        <p className="muted">Cargando cuentas registradas…</p>
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
              </tr>
            </thead>
            <tbody>
              {cuentas.map((c) => (
                <tr key={c._id}>
                  <td>{c.nombre} {c.apellidos}</td>
                  <td>{c.correo}</td>
                  <td><span className="chip chip--soft">{ROLE_LABELS[c.rol] ?? c.rol}</span></td>
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
