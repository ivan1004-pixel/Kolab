import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { USE_MOCK, gqlRequest } from '../services/api';
import { RowListSkeleton } from '../components/Skeleton';

interface SolicitudItem {
  _id: string;
  idEstudiante: string;
  idTema: string;
  esDuelo: boolean;
  estado: 'PENDIENTE' | 'ACEPTADA' | 'COMPLETADA' | 'CANCELADA';
  createdAt: string;
}

interface ReporteItem {
  _id: string;
  motivo: string;
  estado: 'PENDIENTE' | 'EN_REVISION' | 'RESUELTO' | 'DESCARTADO';
  createdAt: string;
}

interface TemaItem {
  _id: string;
  titulo: string;
}

const ESTADO_LABELS: Record<string, { label: string; cls: string }> = {
  PENDIENTE: { label: 'Pendiente', cls: 'status-pending' },
  ACEPTADA: { label: 'En proceso', cls: 'status-progress' },
  COMPLETADA: { label: 'Finalizada', cls: 'status-done' },
  CANCELADA: { label: 'Cancelada', cls: 'status-rejected' },
};

export default function Tutorias() {
  const { user, token } = useAuth();
  const [requests, setRequests] = useState<SolicitudItem[]>([]);
  const [reports, setReports] = useState<ReporteItem[]>([]);
  const [temas, setTemas] = useState<TemaItem[]>([]);
  const [selectedTemaId, setSelectedTemaId] = useState('');
  const [requestMode, setRequestMode] = useState<'Tutoría' | 'Duelo'>('Duelo');
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  const isAdmin = user?.rol === 'admin';

  const loadData = useCallback(async () => {
    if (USE_MOCK || !token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await gqlRequest<{
        solicitudesTutoria: SolicitudItem[];
        temas: TemaItem[];
      }>(
        `query TutoriasData {
          solicitudesTutoria { _id idEstudiante idTema esDuelo estado createdAt }
          temas { _id titulo }
        }`,
        {},
        token,
      );
      setRequests(data.solicitudesTutoria ?? []);
      const temaList = data.temas ?? [];
      setTemas(temaList);
      if (temaList.length > 0 && !selectedTemaId) {
        setSelectedTemaId(temaList[0]._id);
      }

      if (isAdmin) {
        const repData = await gqlRequest<{ reportes: ReporteItem[] }>(
          `query ReportesAdmin { reportes { _id motivo estado createdAt } }`,
          {},
          token,
        ).catch(() => ({ reportes: [] }));
        setReports(repData.reportes ?? []);
      }
    } catch (err: any) {
      setNotice(err.message || 'No se pudieron cargar las tutorías.');
    } finally {
      setLoading(false);
    }
  }, [token, isAdmin, selectedTemaId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const temaMap = useMemo(() => new Map(temas.map((t) => [t._id, t.titulo])), [temas]);

  async function handleAcceptRequest(id: string) {
    if (!token) return;
    try {
      const res = await gqlRequest<{ aceptarTutoriaODuelo: SolicitudItem }>(
        `mutation AceptarTutoria($id: ID!) {
          aceptarTutoriaODuelo(solicitudId: $id) { _id estado }
        }`,
        { id },
        token,
      );
      setRequests((prev) =>
        prev.map((req) => (req._id === id ? { ...req, estado: res.aceptarTutoriaODuelo.estado } : req)),
      );
      setNotice('Solicitud aceptada correctamente.');
    } catch (err: any) {
      setNotice(err.message || 'No se pudo aceptar la solicitud.');
    }
  }

  async function handleSendChallengeOrTutoring(e: FormEvent) {
    e.preventDefault();
    if (!selectedTemaId || !token) return;
    try {
      const esDuelo = requestMode === 'Duelo';
      const res = await gqlRequest<{ solicitarTutoriaODuelo: SolicitudItem }>(
        `mutation SolicitarTutoria($idTema: ID!, $esDuelo: Boolean!) {
          solicitarTutoriaODuelo(idTema: $idTema, esDuelo: $esDuelo) {
            _id idEstudiante idTema esDuelo estado createdAt
          }
        }`,
        { idTema: selectedTemaId, esDuelo },
        token,
      );
      setRequests((prev) => [res.solicitarTutoriaODuelo, ...prev]);
      const temaNombre = temaMap.get(selectedTemaId) || 'el tema seleccionado';
      setNotice(
        esDuelo
          ? `¡Duelo académico 1 a 1 sobre "${temaNombre}" enviado!`
          : `Solicitud de tutoría sobre "${temaNombre}" enviada.`,
      );
    } catch (err: any) {
      setNotice(err.message || 'No se pudo enviar la solicitud.');
    }
  }

  async function handleResolveReport(id: string, estado: 'EN_REVISION' | 'RESUELTO') {
    if (!token) return;
    try {
      const res = await gqlRequest<{ resolverReporte: ReporteItem }>(
        `mutation ResolverReporte($id: ID!, $estado: EstadoReporte!, $res: String!) {
          resolverReporte(reporteId: $id, estado: $estado, resolucionAdmin: $res) { _id estado }
        }`,
        {
          id,
          estado,
          res: estado === 'RESUELTO' ? 'Atendido por moderación' : 'En revisión por moderador',
        },
        token,
      );
      setReports((prev) =>
        prev.map((rep) => (rep._id === id ? { ...rep, estado: res.resolverReporte.estado } : rep)),
      );
      setNotice(estado === 'RESUELTO' ? 'Reporte marcado como resuelto.' : 'Reporte puesto en revisión.');
    } catch (err: any) {
      setNotice(err.message || 'No se pudo actualizar el reporte.');
    }
  }

  return (
    <div className="module7-wrap">
      <section className="module-banner module-banner-crimson" aria-label="Encabezado de tutorías">
        <div className="banner-deco-circle banner-deco-1" aria-hidden="true" />
        <div className="banner-deco-circle banner-deco-2" aria-hidden="true" />

        <div className="banner-content">
          <h1 className="banner-title">Tutorías, duelos y moderación</h1>
          <p className="banner-subtitle">Ayuda entre pares, retos 1 a 1 y comunidad segura</p>
        </div>

        <button
          type="button"
          className="btn-banner-action"
          onClick={() => {
            setRequestMode('Tutoría');
            setNotice('Selecciona un tema en el panel derecho y envía tu solicitud de tutoría.');
          }}
        >
          Solicitar tutoría
        </button>
      </section>

      {notice && (
        <div className="module6-notice" role="status">
          <span>{notice}</span>
          <button type="button" className="notice-close" onClick={() => setNotice(null)} aria-label="Cerrar aviso">×</button>
        </div>
      )}

      <div className="module7-grid">
        <section className="kolab-card" aria-label="Solicitudes de tutoría">
          <header className="card-header-row">
            <h2 className="card-title">Solicitudes de tutoría y duelos</h2>
          </header>

          {loading ? (
            <RowListSkeleton count={4} />
          ) : requests.length === 0 ? (
            <p className="empty">No hay solicitudes de tutoría o duelos pendientes en este momento.</p>
          ) : (
            <>
              <div className="m7-table-head m7-tutor-cols">
                <span>Modalidad</span><span>Tema</span><span>Estado</span><span>Acción</span>
              </div>
              <div className="m7-tutor-rows">
                {requests.map((req) => {
                  const st = ESTADO_LABELS[req.estado] ?? { label: req.estado, cls: 'status-pending' };
                  return (
                    <div key={req._id} className="m7-tutor-row m7-tutor-cols">
                      <span className="m7-student-name">{req.esDuelo ? 'Duelo 1v1' : 'Tutoría'}</span>
                      <span className="m7-topic-text">{temaMap.get(req.idTema) || 'Tema general'}</span>
                      <div><span className={`status-pill ${st.cls}`}>{st.label}</span></div>
                      <div className="m7-actions-cell">
                        {req.estado === 'PENDIENTE' && (
                          <button type="button" className="btn-green btn-sm" onClick={() => handleAcceptRequest(req._id)}>
                            Aceptar
                          </button>
                        )}
                        {req.estado !== 'PENDIENTE' && (
                          <span className="muted">{new Date(req.createdAt).toLocaleDateString('es-MX')}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </section>

        <section className="kolab-card duel-card" aria-label="Duelo académico">
          <header className="card-header-row"><h2 className="card-title">Nueva solicitud</h2></header>
          <div className="duel-vs-box" aria-hidden="true">
            <span className="duel-circle duel-circle-left" /><span className="duel-vs-text">VS</span><span className="duel-circle duel-circle-right" />
          </div>
          <form className="duel-form" onSubmit={handleSendChallengeOrTutoring}>
            <select
              className="duel-select"
              value={selectedTemaId}
              onChange={(e) => setSelectedTemaId(e.target.value)}
              aria-label="Tema"
            >
              {temas.length === 0 && <option value="">Sin temas disponibles</option>}
              {temas.map((t) => <option key={t._id} value={t._id}>{t.titulo}</option>)}
            </select>
            <div className="duel-mode-pills">
              <button
                type="button"
                className={`mode-pill mode-tutoring ${requestMode === 'Tutoría' ? 'is-active' : ''}`}
                onClick={() => setRequestMode('Tutoría')}
              >
                Tutoría
              </button>
              <button
                type="button"
                className={`mode-pill mode-duel ${requestMode === 'Duelo' ? 'is-active' : ''}`}
                onClick={() => setRequestMode('Duelo')}
              >
                Duelo
              </button>
            </div>
            <button type="submit" className="btn-crimson btn-full-center" disabled={!selectedTemaId}>
              Enviar solicitud
            </button>
          </form>
        </section>
      </div>

      {isAdmin && (
        <section className="kolab-card" aria-label="Moderación de reportes">
          <header className="card-header-row">
            <h2 className="card-title">Moderación de reportes</h2>
            <span className="chip-ia">Admin</span>
          </header>
          {reports.length === 0 ? (
            <p className="empty">No hay reportes pendientes de moderación.</p>
          ) : (
            <>
              <div className="m7-table-head m7-mod-cols">
                <span>Motivo</span><span>Fecha</span><span>Estado</span><span>Acción</span>
              </div>
              <div className="m7-mod-rows">
                {reports.map((rep) => (
                  <div key={rep._id} className="m7-mod-row m7-mod-cols">
                    <span className="m7-reason-text">{rep.motivo}</span>
                    <span className="muted">{new Date(rep.createdAt).toLocaleDateString('es-MX')}</span>
                    <div><span className="status-pill status-pending">{rep.estado}</span></div>
                    <div className="m7-mod-actions">
                      <button type="button" className="btn-crimson btn-sm" onClick={() => handleResolveReport(rep._id, 'EN_REVISION')}>
                        Revisar
                      </button>
                      <button type="button" className="btn-outline-green btn-sm" onClick={() => handleResolveReport(rep._id, 'RESUELTO')}>
                        Resolver
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}
