import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { USE_MOCK, gqlRequest } from '../services/api';
import { assertNoScriptInjection } from '../utils/inputSecurity';

interface MiembroItem {
  idUsuario: string;
  rolGrupo: string;
  fechaUnion: string;
}

interface GrupoItem {
  _id: string;
  nombre: string;
  descripcion?: string;
  esPrivado: boolean;
  idTema: string;
  miembros: MiembroItem[];
}

interface RetoItem {
  _id: string;
  titulo: string;
  descripcion?: string;
  idGrupo: string;
  metaCantidad: number;
  progresoActual: number;
  xpRecompensa: number;
  completado: boolean;
}

interface TemaItem {
  _id: string;
  titulo: string;
}

interface InsigniaItem {
  _id: string;
  idInsignia: string;
  fechaObtencion: string;
}

const GROUP_COLORS = ['#157F3C', '#2563EB', '#D97706', '#0F766E', '#4338CA'];

export default function Comunidades() {
  const { user, token } = useAuth();
  const xp = user?.xp ?? 0;

  const [groups, setGroups] = useState<GrupoItem[]>([]);
  const [temas, setTemas] = useState<TemaItem[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [challenges, setChallenges] = useState<RetoItem[]>([]);
  const [insignias, setInsignias] = useState<InsigniaItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [showNewGroupForm, setShowNewGroupForm] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupTemaId, setNewGroupTemaId] = useState('');

  const [showNewChallengeForm, setShowNewChallengeForm] = useState(false);
  const [newChallengeTitle, setNewChallengeTitle] = useState('');
  const [newChallengeDesc, setNewChallengeDesc] = useState('');

  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  const loadComunidades = useCallback(async () => {
    if (USE_MOCK || !token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await gqlRequest<{
        gruposEstudio: GrupoItem[];
        temas: TemaItem[];
        misInsignias: InsigniaItem[];
      }>(
        `query ComunidadesData {
          gruposEstudio {
            _id nombre descripcion esPrivado idTema
            miembros { idUsuario rolGrupo fechaUnion }
          }
          temas { _id titulo }
          misInsignias { _id idInsignia fechaObtencion }
        }`,
        {},
        token,
      );
      const grpList = data.gruposEstudio ?? [];
      const temaList = data.temas ?? [];
      setGroups(grpList);
      setTemas(temaList);
      setInsignias(data.misInsignias ?? []);
      if (grpList.length > 0 && !selectedGroupId) {
        setSelectedGroupId(grpList[0]._id);
      }
      if (temaList.length > 0 && !newGroupTemaId) {
        setNewGroupTemaId(temaList[0]._id);
      }
    } catch (err: any) {
      setStatusNotice(err.message || 'No se pudieron cargar las comunidades.');
    } finally {
      setLoading(false);
    }
  }, [token, selectedGroupId, newGroupTemaId]);

  useEffect(() => {
    loadComunidades();
  }, [loadComunidades]);

  useEffect(() => {
    if (USE_MOCK || !token || !selectedGroupId) {
      setChallenges([]);
      return;
    }
    gqlRequest<{ retosComunitarios: RetoItem[] }>(
      `query RetosGrupo($idGrupo: ID) {
        retosComunitarios(idGrupo: $idGrupo) {
          _id titulo descripcion idGrupo metaCantidad progresoActual xpRecompensa completado
        }
      }`,
      { idGrupo: selectedGroupId },
      token,
    )
      .then((res) => setChallenges(res.retosComunitarios ?? []))
      .catch(() => setChallenges([]));
  }, [token, selectedGroupId]);

  const temaMap = useMemo(() => new Map(temas.map((t) => [t._id, t.titulo])), [temas]);
  const selectedGroup = groups.find((g) => g._id === selectedGroupId) ?? groups[0] ?? null;

  const xpProgress = Math.round(((xp % 200) / 200) * 100);

  async function handleCreateGroup(e: FormEvent) {
    e.preventDefault();
    const nombre = newGroupName.trim();
    if (!nombre || !newGroupTemaId || !token) return;
    try {
      assertNoScriptInjection(nombre, 'grupo');
      const res = await gqlRequest<{ crearGrupoEstudio: GrupoItem }>(
        `mutation CrearGrupo($nombre: String!, $idTema: ID!) {
          crearGrupoEstudio(nombre: $nombre, idTema: $idTema, esPrivado: false) {
            _id nombre descripcion esPrivado idTema
            miembros { idUsuario rolGrupo fechaUnion }
          }
        }`,
        { nombre, idTema: newGroupTemaId },
        token,
      );
      setGroups((prev) => [res.crearGrupoEstudio, ...prev]);
      setSelectedGroupId(res.crearGrupoEstudio._id);
      setNewGroupName('');
      setShowNewGroupForm(false);
      setStatusNotice(`Grupo "${nombre}" creado correctamente.`);
    } catch (err: any) {
      setStatusNotice(err.message || 'No se pudo crear el grupo.');
    }
  }

  async function handleJoinGroup() {
    if (!selectedGroup || !token) return;
    try {
      const res = await gqlRequest<{ unirseAGrupo: GrupoItem }>(
        `mutation Unirse($id: ID!) {
          unirseAGrupo(grupoId: $id) {
            _id miembros { idUsuario rolGrupo fechaUnion }
          }
        }`,
        { id: selectedGroup._id },
        token,
      );
      setGroups((prev) =>
        prev.map((g) => (g._id === selectedGroup._id ? { ...g, miembros: res.unirseAGrupo.miembros } : g)),
      );
      setStatusNotice(`Te uniste a ${selectedGroup.nombre}.`);
    } catch (err: any) {
      setStatusNotice(err.message || 'No se pudo unir al grupo.');
    }
  }

  async function handleCreateChallenge(e: FormEvent) {
    e.preventDefault();
    const titulo = newChallengeTitle.trim();
    const descripcion = newChallengeDesc.trim() || 'Reto semanal de la comunidad';
    if (!titulo || !selectedGroup || !token) return;
    try {
      assertNoScriptInjection({ titulo, descripcion }, 'reto');
      const res = await gqlRequest<{ crearRetoComunitario: RetoItem }>(
        `mutation CrearReto($idGrupo: ID!, $titulo: String!, $descripcion: String!) {
          crearRetoComunitario(idGrupo: $idGrupo, titulo: $titulo, descripcion: $descripcion, metaCantidad: 5, xpRecompensa: 25) {
            _id titulo descripcion idGrupo metaCantidad progresoActual xpRecompensa completado
          }
        }`,
        { idGrupo: selectedGroup._id, titulo, descripcion },
        token,
      );
      setChallenges((prev) => [...prev, res.crearRetoComunitario]);
      setNewChallengeTitle('');
      setNewChallengeDesc('');
      setShowNewChallengeForm(false);
      setStatusNotice(`Reto "${titulo}" publicado.`);
    } catch (err: any) {
      setStatusNotice(err.message || 'No se pudo publicar el reto.');
    }
  }

  return (
    <div className="module6-wrap">
      <section className="module-banner module-banner-orange" aria-label="Encabezado del Módulo 6">
        <div className="banner-deco-circle banner-deco-1" aria-hidden="true" />
        <div className="banner-deco-circle banner-deco-2" aria-hidden="true" />

        <div className="banner-content">
          <span className="banner-pill">Módulo 6</span>
          <h1 className="banner-title">Comunidades, retos y gamificación</h1>
          <p className="banner-subtitle">Estudia en equipo, gana XP e insignias</p>
        </div>

        <button type="button" className="btn-banner-action" onClick={() => setShowNewGroupForm((v) => !v)}>
          + Crear grupo
        </button>
      </section>

      {showNewGroupForm && (
        <form className="kolab-card inline-create-form" onSubmit={handleCreateGroup}>
          <div className="inline-form-fields">
            <input
              type="text"
              className="composer-input"
              placeholder="Nombre del grupo (ej. Cálculo Integral)"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              required
            />
            <select
              className="composer-input"
              value={newGroupTemaId}
              onChange={(e) => setNewGroupTemaId(e.target.value)}
              required
            >
              {temas.length === 0 && <option value="">Sin temas registrados</option>}
              {temas.map((t) => (
                <option key={t._id} value={t._id}>{t.titulo}</option>
              ))}
            </select>
          </div>
          <div className="inline-form-actions">
            <button type="submit" className="btn-green" disabled={!newGroupTemaId}>Guardar grupo</button>
            <button type="button" className="btn-outline-green" onClick={() => setShowNewGroupForm(false)}>Cancelar</button>
          </div>
        </form>
      )}

      {statusNotice && (
        <div className="module6-notice" role="status">
          <span>{statusNotice}</span>
          <button type="button" className="notice-close" onClick={() => setStatusNotice(null)} aria-label="Cerrar aviso">×</button>
        </div>
      )}

      <div className="module6-grid">
        <section className="kolab-card" aria-label="Grupos de estudio">
          <header className="card-header-row">
            <h2 className="card-title">Grupos de estudio</h2>
          </header>

          {loading ? (
            <p className="muted">Cargando comunidades…</p>
          ) : groups.length === 0 ? (
            <p className="empty">No hay comunidades creadas todavía. ¡Crea el primer grupo de estudio!</p>
          ) : (
            <div className="group-list">
              {groups.map((group, idx) => {
                const isSelected = group._id === selectedGroup?._id;
                const temaNombre = temaMap.get(group.idTema) || 'Tema';
                return (
                  <button
                    key={group._id}
                    type="button"
                    className={`group-item ${isSelected ? 'is-selected' : ''}`}
                    onClick={() => setSelectedGroupId(group._id)}
                  >
                    <span className="group-avatar" style={{ backgroundColor: GROUP_COLORS[idx % GROUP_COLORS.length] }}>
                      {group.nombre[0]?.toUpperCase() || 'G'}
                    </span>
                    <span className="group-name">{group.nombre}</span>
                    <span className="group-topic-pill">{temaNombre}</span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <section className="kolab-card members-card" aria-label="Integrantes del grupo">
          <header className="card-header-row">
            <h2 className="card-title">Integrantes del grupo</h2>
          </header>

          {!selectedGroup ? (
            <p className="empty">Selecciona o crea un grupo para ver sus integrantes.</p>
          ) : selectedGroup.miembros.length === 0 ? (
            <p className="empty">Este grupo aún no tiene integrantes registrados.</p>
          ) : (
            <div className="member-list">
              {selectedGroup.miembros.map((member, idx) => (
                <div key={`${member.idUsuario}-${idx}`} className="member-row">
                  <div className="member-info">
                    <span className="member-avatar" style={{ backgroundColor: '#86EFAC' }} aria-hidden="true" />
                    <span className="member-name">Integrante #{idx + 1}</span>
                  </div>
                  <div className="member-meta">
                    <span className={`role-pill ${member.rolGrupo === 'LIDER' ? 'role-leader' : 'role-member'}`}>
                      {member.rolGrupo}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {selectedGroup && (
            <div className="members-actions">
              <button type="button" className="btn-outline-green" onClick={handleJoinGroup}>
                Unirme al grupo
              </button>
            </div>
          )}
        </section>

        <section className="kolab-card challenges-card" aria-label="Retos comunitarios">
          <header className="card-header-row">
            <h2 className="card-title">Retos comunitarios</h2>
          </header>

          {!selectedGroup ? (
            <p className="empty">Selecciona un grupo para ver sus retos.</p>
          ) : challenges.length === 0 ? (
            <p className="empty">Este grupo aún no tiene retos semanales activos.</p>
          ) : (
            <div className="challenge-list">
              {challenges.map((challenge, idx) => (
                <div key={challenge._id} className={`challenge-item ${challenge.completado ? 'is-done' : ''}`}>
                  <span className="challenge-num">{idx + 1}</span>
                  <div className="challenge-body">
                    <span className="challenge-title">{challenge.titulo}</span>
                    <span className="challenge-resource">
                      {challenge.descripcion || `Meta: ${challenge.progresoActual}/${challenge.metaCantidad}`}
                    </span>
                  </div>
                  <span className="challenge-xp-pill">
                    {challenge.completado ? 'Listo' : `+${challenge.xpRecompensa} XP`}
                  </span>
                </div>
              ))}
            </div>
          )}

          {showNewChallengeForm && selectedGroup && (
            <form className="challenge-mini-form" onSubmit={handleCreateChallenge}>
              <input
                type="text"
                className="composer-input"
                placeholder="Título del reto..."
                value={newChallengeTitle}
                onChange={(e) => setNewChallengeTitle(e.target.value)}
                required
              />
              <input
                type="text"
                className="composer-input"
                placeholder="Descripción breve..."
                value={newChallengeDesc}
                onChange={(e) => setNewChallengeDesc(e.target.value)}
              />
              <div className="inline-form-actions">
                <button type="submit" className="btn-sol">Publicar</button>
                <button type="button" className="btn-outline-green" onClick={() => setShowNewChallengeForm(false)}>Cancelar</button>
              </div>
            </form>
          )}

          {selectedGroup && (
            <div className="challenges-footer">
              <button type="button" className="btn-sol btn-full" onClick={() => setShowNewChallengeForm((v) => !v)}>
                + Publicar reto
              </button>
            </div>
          )}
        </section>
      </div>

      <section className="kolab-card badges-card" aria-label="Mis insignias y progreso">
        <header className="card-header-row">
          <h2 className="card-title">Mis insignias y progreso</h2>
          <span className="chip chip--soft">{insignias.length} obtenidas</span>
        </header>

        <div className="badges-layout">
          {insignias.length === 0 ? (
            <p className="empty">Aún no has desbloqueado insignias. Participa en comunidades y retos para ganarlas.</p>
          ) : (
            <div className="badges-row">
              {insignias.map((ins, idx) => (
                <div className="badge-item" key={ins._id}>
                  <div className="badge-medal badge-green">★</div>
                  <span className="badge-label">Insignia #{idx + 1}</span>
                </div>
              ))}
            </div>
          )}

          <div className="xp-progress-box">
            <div className="xp-progress-header">
              <span>XP total · {xp}</span>
              <span className="xp-progress-pct">{xpProgress}%</span>
            </div>
            <div className="xp-track">
              <div className="xp-fill" style={{ width: `${xpProgress}%` }} />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
