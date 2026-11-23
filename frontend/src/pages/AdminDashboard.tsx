import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  BookOpen,
  Search,
  ShieldCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { USE_MOCK, gqlRequest } from '../services/api';
import { assertNoScriptInjection } from '../utils/inputSecurity';
import { RowListSkeleton } from '../components/Skeleton';

interface AdminUserItem {
  _id: string;
  nombre: string;
  apellidos: string;
  correo: string;
  rol: 'ESTUDIANTE' | 'DOCENTE' | 'ADMINISTRADOR';
  isActive?: boolean;
}

interface ReporteItem {
  _id: string;
  motivo: string;
  tipoObjetivo: string;
  estado: string;
  createdAt: string;
}

interface AsignaturaItem {
  _id: string;
  nombre: string;
}

const ROLE_LABELS: Record<string, string> = {
  ESTUDIANTE: 'Estudiante',
  DOCENTE: 'Docente',
  ADMINISTRADOR: 'Administrador',
};

const SUPERADMIN_EMAIL = 'administrador@gmail.com';

export default function AdminDashboard() {
  const { user, token } = useAuth();
  const [usuarios, setUsuarios] = useState<AdminUserItem[]>([]);
  const [reportes, setReportes] = useState<ReporteItem[]>([]);
  const [asignaturas, setAsignaturas] = useState<AsignaturaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'TODOS' | 'ESTUDIANTE' | 'DOCENTE' | 'ADMINISTRADOR'>('TODOS');
  const [notice, setNotice] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [form, setForm] = useState({
    nombre: '',
    apellidos: '',
    correo: '',
    contrasena: '',
    rol: 'DOCENTE' as 'ESTUDIANTE' | 'DOCENTE' | 'ADMINISTRADOR',
  });
  const [creating, setCreating] = useState(false);

  const loadData = useCallback(async () => {
    if (USE_MOCK || !token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await gqlRequest<{
        usuarios: AdminUserItem[];
        reportes: ReporteItem[];
        asignaturas: AsignaturaItem[];
      }>(
        `query AdminDashboardData {
          usuarios { _id nombre apellidos correo rol isActive }
          reportes { _id motivo tipoObjetivo estado createdAt }
          asignaturas { _id nombre }
        }`,
        {},
        token,
      );
      setUsuarios((data.usuarios ?? []).filter((u) => u.isActive !== false));
      setReportes(data.reportes ?? []);
      setAsignaturas(data.asignaturas ?? []);
    } catch (err: any) {
      setNotice({ type: 'err', text: err.message || 'No se pudieron cargar los datos administrativos.' });
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const counts = useMemo(() => {
    const estudiantes = usuarios.filter((u) => u.rol === 'ESTUDIANTE').length;
    const docentes = usuarios.filter((u) => u.rol === 'DOCENTE').length;
    const admins = usuarios.filter((u) => u.rol === 'ADMINISTRADOR').length;
    const pendientes = reportes.filter((r) => r.estado === 'PENDIENTE').length;
    return {
      total: usuarios.length,
      estudiantes,
      docentes,
      admins,
      pendientes,
      asignaturas: asignaturas.length,
    };
  }, [usuarios, reportes, asignaturas]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return usuarios.filter((u) => {
      if (roleFilter !== 'TODOS' && u.rol !== roleFilter) return false;
      if (!q) return true;
      return (
        `${u.nombre} ${u.apellidos}`.toLowerCase().includes(q) ||
        u.correo.toLowerCase().includes(q)
      );
    });
  }, [usuarios, search, roleFilter]);

  async function handleRoleChange(target: AdminUserItem, newRol: 'ESTUDIANTE' | 'DOCENTE' | 'ADMINISTRADOR') {
    if (!token || target.rol === newRol) return;
    setNotice(null);
    try {
      const res = await gqlRequest<{ adminActualizarUsuario: AdminUserItem }>(
        `mutation AdminCambiarRol($id: ID!, $input: AdminUpdateUsuarioInput!) {
          adminActualizarUsuario(id: $id, input: $input) { _id rol }
        }`,
        { id: target._id, input: { rol: newRol } },
        token,
      );
      setUsuarios((prev) =>
        prev.map((u) => (u._id === target._id ? { ...u, rol: res.adminActualizarUsuario.rol } : u)),
      );
      setNotice({
        type: 'ok',
        text: `Rol de ${target.correo} actualizado a ${ROLE_LABELS[newRol] ?? newRol}.`,
      });
    } catch (err: any) {
      setNotice({ type: 'err', text: err.message || 'No se pudo actualizar el rol.' });
    }
  }

  async function handleDeactivate(target: AdminUserItem) {
    if (!token) return;
    setNotice(null);
    try {
      await gqlRequest(
        `mutation AdminBaja($id: ID!, $input: AdminUpdateUsuarioInput!) {
          adminActualizarUsuario(id: $id, input: $input) { _id isActive }
        }`,
        { id: target._id, input: { isActive: false } },
        token,
      );
      setUsuarios((prev) => prev.filter((u) => u._id !== target._id));
      setNotice({ type: 'ok', text: `Cuenta ${target.correo} dada de baja.` });
    } catch (err: any) {
      setNotice({ type: 'err', text: err.message || 'No se pudo dar de baja la cuenta.' });
    }
  }

  const onFormChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  async function handleCreateUser(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setNotice(null);
    if (!form.nombre.trim() || !form.apellidos.trim() || !form.correo.includes('@') || form.contrasena.length < 8) {
      setNotice({
        type: 'err',
        text: 'Completa nombre, apellidos, correo válido y contraseña de al menos 8 caracteres.',
      });
      return;
    }
    try {
      assertNoScriptInjection(form, 'crear cuenta');
      setCreating(true);
      const res = await gqlRequest<{ adminCrearUsuario: AdminUserItem }>(
        `mutation AdminCrear($input: AdminCreateUsuarioInput!) {
          adminCrearUsuario(input: $input) { _id nombre apellidos correo rol isActive }
        }`,
        {
          input: {
            nombre: form.nombre.trim(),
            apellidos: form.apellidos.trim(),
            correo: form.correo.trim(),
            contrasena: form.contrasena,
            rol: form.rol,
          },
        },
        token,
      );
      setUsuarios((prev) => [res.adminCrearUsuario, ...prev]);
      setForm({ nombre: '', apellidos: '', correo: '', contrasena: '', rol: 'DOCENTE' });
      setNotice({
        type: 'ok',
        text: `Cuenta ${res.adminCrearUsuario.correo} creada con rol ${ROLE_LABELS[res.adminCrearUsuario.rol]}.`,
      });
    } catch (err: any) {
      setNotice({ type: 'err', text: err.message || 'No se pudo crear la cuenta.' });
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="dashboard">
      <section className="hero">
        <span className="chip chip--solid" style={{ alignSelf: 'flex-start' }}>
          <ShieldCheck size={14} aria-hidden="true" />
          Panel Administrativo
        </span>
        <h1>Hola, {user?.nombre}</h1>
        <p className="muted">
          Supervisión general, delegación de roles por jerarquía y control de la plataforma.
        </p>
      </section>

      <section className="stats" aria-label="Resumen administrativo">
        <div className="stat stat--xp">
          <span>Usuarios activos</span>
          <strong>{counts.total}</strong>
          <small className="muted">
            {counts.estudiantes} est. · {counts.docentes} doc. · {counts.admins} admin.
          </small>
        </div>
        <div className="stat stat--badges">
          <span>Reportes pendientes</span>
          <strong>{counts.pendientes}</strong>
          <small className="muted">Moderación y seguridad</small>
        </div>
        <div className="stat stat--retos">
          <span>Asignaturas</span>
          <strong>{counts.asignaturas}</strong>
          <small className="muted">Estructura curricular</small>
        </div>
      </section>

      {notice && (
        <p className={notice.type === 'ok' ? 'form-ok' : 'form-error'} role="status">
          {notice.text}
        </p>
      )}

      <section className="card" aria-label="Delegación de roles y cuentas">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 className="card__title">
              <Users size={18} style={{ verticalAlign: 'text-bottom', marginRight: 6 }} aria-hidden="true" />
              Delegación de roles y supervisión de cuentas
            </h2>
            <p className="muted" style={{ fontSize: '0.88rem' }}>
              Solo un administrador autorizado puede elevar a un usuario a Administrador o cambiar su rol.
            </p>
          </div>

          <div className="row" style={{ gap: '0.5rem' }}>
            <div style={{ position: 'relative' }}>
              <Search
                size={16}
                aria-hidden="true"
                style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', opacity: 0.6 }}
              />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nombre o correo…"
                aria-label="Buscar usuarios"
                style={{
                  minHeight: 38,
                  padding: '0 0.75rem 0 2rem',
                  borderRadius: 'var(--r-sm)',
                  border: '1.5px solid var(--borde)',
                }}
              />
            </div>

            <select
              aria-label="Filtrar por rol"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as any)}
              style={{
                minHeight: 38,
                padding: '0 0.75rem',
                borderRadius: 'var(--r-sm)',
                border: '1.5px solid var(--borde)',
              }}
            >
              <option value="TODOS">Todos los roles</option>
              <option value="ESTUDIANTE">Estudiantes</option>
              <option value="DOCENTE">Docentes</option>
              <option value="ADMINISTRADOR">Administradores</option>
            </select>
          </div>
        </div>

        {loading ? (
          <RowListSkeleton count={4} />
        ) : filteredUsers.length === 0 ? (
          <p className="empty">No se encontraron usuarios con ese criterio.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Correo</th>
                  <th>Rol actual</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u) => {
                  const isSeedSuperadmin = u.correo.toLowerCase() === SUPERADMIN_EMAIL;
                  const isSelf = String(user?.id) === String(u._id);
                  const locked = isSeedSuperadmin || isSelf;
                  return (
                    <tr key={u._id}>
                      <td>
                        {u.nombre} {u.apellidos}{' '}
                        {isSeedSuperadmin && <span className="chip chip--xp">Superadmin</span>}
                        {!isSeedSuperadmin && isSelf && <span className="chip chip--soft">Tú</span>}
                      </td>
                      <td>{u.correo}</td>
                      <td>
                        <select
                          aria-label={`Rol de ${u.correo}`}
                          value={u.rol}
                          disabled={locked}
                          onChange={(e) => handleRoleChange(u, e.target.value as AdminUserItem['rol'])}
                          style={{
                            minHeight: 34,
                            padding: '0 0.5rem',
                            borderRadius: 8,
                            border: '1px solid var(--borde)',
                            opacity: locked ? 0.7 : 1,
                          }}
                        >
                          <option value="ESTUDIANTE">Estudiante</option>
                          <option value="DOCENTE">Docente</option>
                          <option value="ADMINISTRADOR">Administrador</option>
                        </select>
                      </td>
                      <td>
                        <div className="row" style={{ gap: '0.4rem' }}>
                          {u.rol !== 'ADMINISTRADOR' && (
                            <button
                              type="button"
                              className="btn btn--ghost btn--sm"
                              onClick={() => handleRoleChange(u, 'ADMINISTRADOR')}
                            >
                              Elevar a Admin
                            </button>
                          )}
                          <button
                            type="button"
                            className="btn btn--danger btn--sm"
                            disabled={locked}
                            onClick={() => handleDeactivate(u)}
                          >
                            Dar de baja
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card" aria-label="Crear cuenta desde administración">
        <h2 className="card__title">
          <UserPlus size={18} style={{ verticalAlign: 'text-bottom', marginRight: 6 }} aria-hidden="true" />
          Crear cuenta y asignar rol directamente
        </h2>
        <form className="form-grid" onSubmit={handleCreateUser}>
          <div className="field">
            <label htmlFor="ad-nombre">Nombre</label>
            <input id="ad-nombre" name="nombre" value={form.nombre} onChange={onFormChange} />
          </div>
          <div className="field">
            <label htmlFor="ad-apellidos">Apellidos</label>
            <input id="ad-apellidos" name="apellidos" value={form.apellidos} onChange={onFormChange} />
          </div>
          <div className="field">
            <label htmlFor="ad-correo">Correo</label>
            <input id="ad-correo" name="correo" type="email" value={form.correo} onChange={onFormChange} />
          </div>
          <div className="field">
            <label htmlFor="ad-pass">Contraseña temporal</label>
            <input id="ad-pass" name="contrasena" type="password" value={form.contrasena} onChange={onFormChange} />
          </div>
          <div className="field">
            <label htmlFor="ad-rol">Rol inicial</label>
            <select id="ad-rol" name="rol" value={form.rol} onChange={onFormChange}>
              <option value="ESTUDIANTE">Estudiante</option>
              <option value="DOCENTE">Docente</option>
              <option value="ADMINISTRADOR">Administrador</option>
            </select>
          </div>
          <div className="field" style={{ justifyContent: 'flex-end' }}>
            <button className="btn btn--primary" type="submit" disabled={creating}>
              <UserPlus size={16} aria-hidden="true" />
              <span>{creating ? 'Creando…' : 'Crear cuenta'}</span>
            </button>
          </div>
        </form>
      </section>

      <div className="dashboard-two-col">
        <section className="card">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2 className="card__title">
              <AlertTriangle size={18} style={{ verticalAlign: 'text-bottom', marginRight: 6 }} aria-hidden="true" />
              Reportes recientes
            </h2>
            <Link to="/tutorias" className="btn btn--ghost btn--sm">
              Gestionar reportes
            </Link>
          </div>
          {reportes.length === 0 ? (
            <p className="muted">No hay reportes registrados.</p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: '1.1rem', display: 'grid', gap: '0.4rem' }}>
              {reportes.slice(0, 5).map((r) => (
                <li key={r._id}>
                  <strong>[{r.estado}]</strong> {r.motivo}{' '}
                  <span className="muted">({r.tipoObjetivo})</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <h2 className="card__title">
            <BookOpen size={18} style={{ verticalAlign: 'text-bottom', marginRight: 6 }} aria-hidden="true" />
            Accesos rápidos de administración
          </h2>
          <div className="row" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
            <Link to="/curricular" className="btn btn--ghost btn--sm">Carreras y asignaturas</Link>
            <Link to="/recursos" className="btn btn--ghost btn--sm">Validar recursos</Link>
            <Link to="/foro" className="btn btn--ghost btn--sm">Foro académico</Link>
            <Link to="/tutorias" className="btn btn--ghost btn--sm">Tutorías y moderación</Link>
            <Link to="/radar" className="btn btn--ghost btn--sm">Radar de dificultades</Link>
            <Link to="/perfil" className="btn btn--ghost btn--sm">Mi perfil y seguridad</Link>
          </div>
        </section>
      </div>
    </div>
  );
}
