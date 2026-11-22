import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, FileText, Sparkles, Star, XCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { USE_MOCK, gqlRequest, uploadResourceFile } from '../services/api';
import { assertNoScriptInjection } from '../utils/inputSecurity';
import { downloadCsv, escapeHtml, exportHtmlToPdf } from '../utils/exportUtils';
import Skeleton, { CardListSkeleton, RowListSkeleton } from '../components/Skeleton';

interface RecursoDocente {
  _id: string;
  titulo: string;
  descripcion?: string;
  archivoUrl?: string;
  tipoArchivo: string;
  tamanoBytes: number;
  estadoValidacion: 'PENDIENTE' | 'REVISADO_DOCENTE' | 'ARCHIVADO';
  retroalimentacionDocente?: string;
  esMaterialOficial: boolean;
  nombreAutor?: string;
  palabrasClave: string[];
  idAsignatura?: string;
  idTema: string;
  promedioCalificacion: number;
  totalCalificaciones: number;
  createdAt: string;
}

interface AsignaturaItem {
  _id: string;
  nombre: string;
  cuatrimestre?: string;
}

interface TemaItem {
  _id: string;
  titulo: string;
  idAsignatura: string;
}

interface RespuestaItem {
  _id: string;
  texto: string;
  esValida: boolean;
  votosUtilidad: number;
}

interface PreguntaDocente {
  _id: string;
  texto: string;
  idTema: string;
  resuelta: boolean;
  esBancoColaborativo: boolean;
  validadaPorDocente: boolean;
  votosUtilidad: number;
  createdAt: string;
  respuestas?: RespuestaItem[];
}

interface ConsultaIaItem {
  _id: string;
  promptPregunta: string;
  respuestaIa: string;
  idTema: string;
  calificacionUsuario?: boolean;
  correccionDocente?: string;
  createdAt: string;
}

interface EventoCalendario {
  _id: string;
  titulo: string;
  tipo: string;
  fecha: string;
  descripcion?: string;
  idAsignatura: string;
  idTema?: string;
}

interface GrupoItem {
  _id: string;
  nombre: string;
  idTema: string;
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

interface RadarItem {
  idTema: string;
  totalPreguntas: number;
  preguntasSinResolver: number;
  erroresAutoevaluacion: number;
  conceptosDebiles: string[];
  preguntaMasDebatidaSinSolucion?: {
    _id: string;
    texto: string;
    votosUtilidad: number;
  } | null;
}

type TabKey = 'validacion' | 'oficial' | 'foro_ia' | 'calendario' | 'radar';

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/webp']);

function detectAllowedFileType(file: File): string | null {
  if (ALLOWED_MIME.has(file.type)) {
    return file.type;
  }
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  if (['pdf', 'png', 'jpg', 'jpeg', 'webp'].includes(ext)) {
    return ext === 'jpg' ? 'jpeg' : ext;
  }
  return null;
}

export default function DocenteDashboard() {
  const { user, token } = useAuth();
  const [activeTab, setActiveTab] = useState<TabKey>('validacion');
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [recursosPendientes, setRecursosPendientes] = useState<RecursoDocente[]>([]);
  const [recursosValidados, setRecursosValidados] = useState<RecursoDocente[]>([]);
  const [recursosArchivados, setRecursosArchivados] = useState<RecursoDocente[]>([]);
  const [resourceFilter, setResourceFilter] = useState<'PENDIENTE' | 'REVISADO_DOCENTE' | 'ARCHIVADO'>('PENDIENTE');
  const [feedbackById, setFeedbackById] = useState<Record<string, string>>({});

  const [asignaturas, setAsignaturas] = useState<AsignaturaItem[]>([]);
  const [temas, setTemas] = useState<TemaItem[]>([]);
  const [preguntas, setPreguntas] = useState<PreguntaDocente[]>([]);
  const [consultasIa, setConsultasIa] = useState<ConsultaIaItem[]>([]);
  const [correccionById, setCorreccionById] = useState<Record<string, string>>({});
  const [eventos, setEventos] = useState<EventoCalendario[]>([]);
  const [grupos, setGrupos] = useState<GrupoItem[]>([]);
  const [retos, setRetos] = useState<RetoItem[]>([]);
  const [radar, setRadar] = useState<RadarItem[]>([]);

  // Formulario Material Oficial (RF-22)
  const [offTitle, setOffTitle] = useState('');
  const [offDesc, setOffDesc] = useState('');
  const [offKeywords, setOffKeywords] = useState('');
  const [offContent, setOffContent] = useState('');
  const [offSubjectId, setOffSubjectId] = useState('');
  const [offTopicId, setOffTopicId] = useState('');
  const [offFile, setOffFile] = useState<File | null>(null);
  const [uploadingOfficial, setUploadingOfficial] = useState(false);

  // Formulario Calendario (RF-77)
  const [calTitle, setCalTitle] = useState('');
  const [calType, setCalType] = useState<'EXAMEN' | 'ENTREGA' | 'PROYECTO'>('EXAMEN');
  const [calDate, setCalDate] = useState('');
  const [calSubjectId, setCalSubjectId] = useState('');
  const [calTopicId, setCalTopicId] = useState('');
  const [calDesc, setCalDesc] = useState('');

  // Formulario Reto Semanal (RF-49)
  const [retoTitle, setRetoTitle] = useState('');
  const [retoDesc, setRetoDesc] = useState('');
  const [retoGroupId, setRetoGroupId] = useState('');
  const [retoMeta, setRetoMeta] = useState(10);
  const [retoXp, setRetoXp] = useState(100);

  const loadTeacherData = useCallback(async () => {
    if (USE_MOCK || !token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await gqlRequest<{
        pendientes: RecursoDocente[];
        validados: RecursoDocente[];
        archivados: RecursoDocente[];
        asignaturas: AsignaturaItem[];
        temas: TemaItem[];
        preguntas: PreguntaDocente[];
        consultasIaPorRevisar: ConsultaIaItem[];
        calendarioEventos: EventoCalendario[];
        gruposEstudio: GrupoItem[];
        retosComunitarios: RetoItem[];
        radarDificultades: RadarItem[];
      }>(
        `query DocenteDashboardData {
          pendientes: recursos(filtros: { estadoValidacion: PENDIENTE }) {
            _id titulo descripcion archivoUrl tipoArchivo tamanoBytes estadoValidacion retroalimentacionDocente
            esMaterialOficial nombreAutor palabrasClave idAsignatura idTema promedioCalificacion totalCalificaciones createdAt
          }
          validados: recursos(filtros: { estadoValidacion: REVISADO_DOCENTE }) {
            _id titulo descripcion archivoUrl tipoArchivo tamanoBytes estadoValidacion retroalimentacionDocente
            esMaterialOficial nombreAutor palabrasClave idAsignatura idTema promedioCalificacion totalCalificaciones createdAt
          }
          archivados: recursos(filtros: { estadoValidacion: ARCHIVADO }) {
            _id titulo descripcion archivoUrl tipoArchivo tamanoBytes estadoValidacion retroalimentacionDocente
            esMaterialOficial nombreAutor palabrasClave idAsignatura idTema promedioCalificacion totalCalificaciones createdAt
          }
          asignaturas { _id nombre cuatrimestre }
          temas { _id titulo idAsignatura }
          preguntas { _id texto idTema resuelta esBancoColaborativo validadaPorDocente votosUtilidad createdAt }
          consultasIaPorRevisar { _id promptPregunta respuestaIa idTema calificacionUsuario correccionDocente createdAt }
          calendarioEventos { _id titulo tipo fecha descripcion idAsignatura idTema }
          gruposEstudio { _id nombre idTema }
          retosComunitarios { _id titulo descripcion idGrupo metaCantidad progresoActual xpRecompensa completado }
          radarDificultades {
            idTema totalPreguntas preguntasSinResolver erroresAutoevaluacion conceptosDebiles
            preguntaMasDebatidaSinSolucion { _id texto votosUtilidad }
          }
        }`,
        {},
        token,
      );

      setRecursosPendientes(data.pendientes ?? []);
      setRecursosValidados(data.validados ?? []);
      setRecursosArchivados(data.archivados ?? []);
      setAsignaturas(data.asignaturas ?? []);
      setTemas(data.temas ?? []);
      setConsultasIa(data.consultasIaPorRevisar ?? []);
      setEventos(data.calendarioEventos ?? []);
      setGrupos(data.gruposEstudio ?? []);
      setRetos(data.retosComunitarios ?? []);
      setRadar(data.radarDificultades ?? []);

      const rawPreguntas = (data.preguntas ?? []).slice(0, 15);
      const resps = await Promise.all(
        rawPreguntas.map((p) =>
          gqlRequest<{ respuestas: RespuestaItem[] }>(
            `query RespuestasDocente($id: ID!) { respuestas(idPregunta: $id) { _id texto esValida votosUtilidad } }`,
            { id: p._id },
            token,
          )
            .then((r) => r.respuestas ?? [])
            .catch(() => []),
        ),
      );
      setPreguntas(rawPreguntas.map((p, idx) => ({ ...p, respuestas: resps[idx] })));

      if (data.asignaturas?.length) {
        setOffSubjectId((prev) => prev || data.asignaturas[0]._id);
        setCalSubjectId((prev) => prev || data.asignaturas[0]._id);
      }
      if (data.temas?.length) {
        setOffTopicId((prev) => prev || data.temas[0]._id);
      }
      if (data.gruposEstudio?.length) {
        setRetoGroupId((prev) => prev || data.gruposEstudio[0]._id);
      }
    } catch (err: any) {
      setNotice({ type: 'err', text: err.message || 'No se pudo cargar el panel docente.' });
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadTeacherData();
  }, [loadTeacherData]);

  const subjectMap = useMemo(() => new Map(asignaturas.map((a) => [a._id, a.nombre])), [asignaturas]);
  const topicMap = useMemo(() => new Map(temas.map((t) => [t._id, t.titulo])), [temas]);
  const groupMap = useMemo(() => new Map(grupos.map((g) => [g._id, g.nombre])), [grupos]);

  const filteredResources =
    resourceFilter === 'PENDIENTE'
      ? recursosPendientes
      : resourceFilter === 'REVISADO_DOCENTE'
        ? recursosValidados
        : recursosArchivados;

  const officialResources = useMemo(
    () => recursosValidados.filter((r) => r.esMaterialOficial),
    [recursosValidados],
  );

  // RF-19, RF-20, RF-21: Validar o archivar recurso con retroalimentación
  async function handleValidateResource(recursoId: string, estado: 'REVISADO_DOCENTE' | 'ARCHIVADO') {
    if (!token) return;
    const retro = (feedbackById[recursoId] || '').trim();
    if (estado === 'ARCHIVADO' && retro.length < 5) {
      setNotice({ type: 'err', text: 'Indica el motivo del archivo (error grave o plagio) en la retroalimentación.' });
      return;
    }
    try {
      if (retro) assertNoScriptInjection(retro, 'retroalimentación');
      await gqlRequest(
        `mutation ValidarRecursoDocente($id: ID!, $estado: EstadoValidacionRecurso!, $retro: String) {
          validarRecurso(recursoId: $id, estado: $estado, retroalimentacion: $retro) {
            _id estadoValidacion retroalimentacionDocente
          }
        }`,
        { id: recursoId, estado, ...(retro ? { retro } : {}) },
        token,
      );
      setNotice({
        type: 'ok',
        text:
          estado === 'REVISADO_DOCENTE'
            ? 'Recurso aprobado con sello "Revisado por docente" y notificación enviada al autor.'
            : 'Recurso archivado correctamente y registrado en bitácora.',
      });
      await loadTeacherData();
    } catch (err: any) {
      setNotice({ type: 'err', text: err.message || 'No se pudo actualizar el estado del recurso.' });
    }
  }

  // RF-22 + RF-92 / RNF-14: Subir material oficial de clase
  async function handleUploadOfficial(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    if (!token || !offFile || !offTopicId) return;
    setNotice(null);

    if (offFile.size > MAX_BYTES) {
      setNotice({
        type: 'err',
        text: `El archivo "${offFile.name}" supera el límite de 10 MB (${(offFile.size / (1024 * 1024)).toFixed(1)} MB). Tus datos del formulario se conservaron.`,
      });
      return;
    }

    const fileType = detectAllowedFileType(offFile);
    if (!fileType) {
      setNotice({
        type: 'err',
        text: 'Formato no permitido. Solo se aceptan PDF e imágenes (PNG, JPG, WEBP). Tus datos del formulario se conservaron.',
      });
      return;
    }

    try {
      assertNoScriptInjection(
        { offTitle, offDesc, offKeywords, offContent, fileName: offFile.name },
        'material oficial',
      );
      setUploadingOfficial(true);

      const palabrasClave = offKeywords
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean);

      const uploaded = await uploadResourceFile(offFile, token);

      await gqlRequest(
        `mutation SubirOficial($input: CreateRecursoInput!) {
          subirRecurso(input: $input) { _id titulo estadoValidacion esMaterialOficial }
        }`,
        {
          input: {
            titulo: offTitle.trim() || offFile.name,
            descripcion: offDesc.trim() || undefined,
            archivoUrl: uploaded.url,
            tipoArchivo: uploaded.tipoArchivo || fileType,
            tamanoBytes: uploaded.tamanoBytes || offFile.size,
            contenidoTextoExtraido: offContent.trim() || offDesc.trim() || undefined,
            idTema: offTopicId,
            ...(offSubjectId ? { idAsignatura: offSubjectId } : {}),
            palabrasClave,
            esMaterialOficial: true,
          },
        },
        token,
      );

      setOffTitle('');
      setOffDesc('');
      setOffKeywords('');
      setOffContent('');
      setOffFile(null);
      formEl?.reset();
      setNotice({
        type: 'ok',
        text: 'Material oficial publicado y autorizado automáticamente para el repositorio y el Asistente IA.',
      });
      await loadTeacherData();
    } catch (err: any) {
      setNotice({ type: 'err', text: err.message || 'No se pudo subir el material oficial.' });
    } finally {
      setUploadingOfficial(false);
    }
  }

  // RF-17: Marcar respuesta relevante
  async function handleMarkRelevant(respuestaId: string) {
    if (!token) return;
    try {
      await gqlRequest(
        `mutation MarcarRel($id: ID!) { marcarRespuestaRelevante(respuestaId: $id) { _id esValida } }`,
        { id: respuestaId },
        token,
      );
      setNotice({ type: 'ok', text: 'Respuesta destacada como relevante (+25 XP e insignia otorgada).' });
      await loadTeacherData();
    } catch (err: any) {
      setNotice({ type: 'err', text: err.message || 'No se pudo destacar la respuesta.' });
    }
  }

  // RF-47: Validar pregunta del banco colaborativo
  async function handleValidateBankQuestion(preguntaId: string) {
    if (!token) return;
    try {
      await gqlRequest(
        `mutation ValidarBanco($id: ID!) { validarPreguntaBanco(preguntaId: $id) { _id validadaPorDocente } }`,
        { id: preguntaId },
        token,
      );
      setNotice({ type: 'ok', text: 'Pregunta validada con el sello "Revisada por docente".' });
      await loadTeacherData();
    } catch (err: any) {
      setNotice({ type: 'err', text: err.message || 'No se pudo validar la pregunta.' });
    }
  }

  // RF-18: Cerrar duda como resuelta
  async function handleCloseQuestion(preguntaId: string) {
    if (!token) return;
    try {
      await gqlRequest(
        `mutation CerrarDuda($id: ID!) { cerrarPreguntaResuelta(preguntaId: $id) { _id resuelta } }`,
        { id: preguntaId },
        token,
      );
      setNotice({ type: 'ok', text: 'Duda cerrada como resuelta.' });
      await loadTeacherData();
    } catch (err: any) {
      setNotice({ type: 'err', text: err.message || 'No se pudo cerrar la duda.' });
    }
  }

  // RF-74: Corregir respuesta de IA marcada como incorrecta
  async function handleCorrectAi(consultaId: string) {
    if (!token) return;
    const correccion = (correccionById[consultaId] || '').trim();
    if (correccion.length < 5) {
      setNotice({ type: 'err', text: 'Escribe la corrección académica antes de guardar.' });
      return;
    }
    try {
      assertNoScriptInjection(correccion, 'corrección IA');
      await gqlRequest(
        `mutation CorregirIA($id: ID!, $corr: String!) {
          corregirRespuestaIa(consultaId: $id, correccionDocente: $corr) { _id correccionDocente }
        }`,
        { id: consultaId, corr: correccion },
        token,
      );
      setNotice({ type: 'ok', text: 'Corrección docente guardada sobre la respuesta de IA.' });
      await loadTeacherData();
    } catch (err: any) {
      setNotice({ type: 'err', text: err.message || 'No se pudo guardar la corrección.' });
    }
  }

  // RF-77: Registrar evento de calendario (examen / entrega)
  async function handleCreateEvent(e: FormEvent) {
    e.preventDefault();
    if (!token || !calTitle.trim() || !calDate || !calSubjectId) return;
    try {
      assertNoScriptInjection({ calTitle, calDesc }, 'calendario');
      await gqlRequest(
        `mutation CrearEvento($input: CreateCalendarioEventoInput!) {
          registrarEventoCalendario(input: $input) { _id titulo tipo fecha }
        }`,
        {
          input: {
            titulo: calTitle.trim(),
            tipo: calType,
            fecha: new Date(calDate).toISOString(),
            idAsignatura: calSubjectId,
            ...(calTopicId ? { idTema: calTopicId } : {}),
            ...(calDesc.trim() ? { descripcion: calDesc.trim() } : {}),
          },
        },
        token,
      );
      setCalTitle('');
      setCalDesc('');
      setCalDate('');
      setNotice({ type: 'ok', text: 'Fecha registrada en el calendario académico de los estudiantes.' });
      await loadTeacherData();
    } catch (err: any) {
      setNotice({ type: 'err', text: err.message || 'No se pudo registrar el evento.' });
    }
  }

  // RF-49: Publicar reto semanal comunitario
  async function handleCreateChallenge(e: FormEvent) {
    e.preventDefault();
    if (!token || !retoTitle.trim() || !retoGroupId) return;
    try {
      assertNoScriptInjection({ retoTitle, retoDesc }, 'reto comunitario');
      await gqlRequest(
        `mutation CrearRetoDoc($titulo: String!, $desc: String!, $xp: Int!, $meta: Int!, $grupo: ID!) {
          crearRetoComunitario(titulo: $titulo, descripcion: $desc, xpRecompensa: $xp, metaCantidad: $meta, idGrupo: $grupo) {
            _id titulo
          }
        }`,
        {
          titulo: retoTitle.trim(),
          desc: retoDesc.trim() || `Meta semanal: ${retoMeta} aportaciones`,
          xp: Number(retoXp) || 100,
          meta: Number(retoMeta) || 10,
          grupo: retoGroupId,
        },
        token,
      );
      setRetoTitle('');
      setRetoDesc('');
      setNotice({ type: 'ok', text: 'Reto semanal comunitario publicado.' });
      await loadTeacherData();
    } catch (err: any) {
      setNotice({ type: 'err', text: err.message || 'No se pudo crear el reto comunitario.' });
    }
  }

  // RF-82: Exportar reporte del Radar de Dificultades (CSV y PDF)
  function handleExportRadarCsv() {
    const rows = radar.map((item) => [
      topicMap.get(item.idTema) || item.idTema,
      item.totalPreguntas,
      item.preguntasSinResolver,
      item.erroresAutoevaluacion,
      item.conceptosDebiles.join(' | ') || 'Sin datos',
      item.preguntaMasDebatidaSinSolucion?.texto || 'Ninguna',
    ]);
    downloadCsv(
      `kolab-radar-dificultades-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Tema', 'Total Preguntas', 'Sin Resolver', 'Errores Autoevaluación', 'Conceptos a Reforzar', 'Pregunta más debatida'],
      rows,
    );
  }

  function handleExportRadarPdf() {
    const rowsHtml = radar
      .map(
        (item) => `<tr>
          <td><strong>${escapeHtml(topicMap.get(item.idTema) || item.idTema)}</strong></td>
          <td>${item.totalPreguntas}</td>
          <td>${item.preguntasSinResolver}</td>
          <td>${item.erroresAutoevaluacion}</td>
          <td>${escapeHtml(item.conceptosDebiles.join(', ') || '—')}</td>
          <td>${escapeHtml(item.preguntaMasDebatidaSinSolucion?.texto || '—')}</td>
        </tr>`,
      )
      .join('');

    exportHtmlToPdf(
      'Reporte Docente · Radar de Dificultades',
      `<p><strong>Docente:</strong> ${escapeHtml(`${user?.nombre ?? ''} ${user?.apellidos ?? ''}`.trim())} &nbsp;|&nbsp; <strong>Recursos pendientes:</strong> ${recursosPendientes.length} &nbsp;|&nbsp; <strong>Temas monitoreados:</strong> ${radar.length}</p>
       <h2>Dificultades por Tema (Dudas y Autoevaluaciones)</h2>
       <table>
         <thead>
           <tr><th>Tema</th><th>Preguntas</th><th>Sin resolver</th><th>Errores quiz</th><th>Conceptos débiles</th><th>Pregunta más debatida</th></tr>
         </thead>
         <tbody>${rowsHtml || '<tr><td colspan="6">No hay datos registrados aún.</td></tr>'}</tbody>
       </table>`,
    );
  }

  const openQuestionsCount = preguntas.filter((p) => !p.resuelta).length;
  const aiPendingCount = consultasIa.filter((c) => !c.correccionDocente).length;

  return (
    <div className="td-wrap">
      <section className="td-hero">
        <div className="td-hero__info">
          <span className="chip chip--action" style={{ background: 'var(--sol)', color: 'var(--tinta)', alignSelf: 'flex-start' }}>
            {user?.rol === 'admin' ? 'Administrador · Vista Docente' : 'Panel Docente'}
          </span>
          <h1>Hola, Prof. {user?.nombre}</h1>
          <p>Valida apuntes, publica material oficial, corrige respuestas de IA, programa exámenes y monitorea el Radar.</p>
        </div>
        <div className="td-hero__actions">
          <button type="button" className="btn btn--action btn--sm" onClick={handleExportRadarCsv} disabled={radar.length === 0}>
            Exportar Radar CSV
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={handleExportRadarPdf}>
            Exportar Radar PDF
          </button>
        </div>
      </section>

      {notice && (
        <div className={`td-notice ${notice.type === 'ok' ? 'td-notice--ok' : 'td-notice--err'}`} role="status">
          <span>{notice.text}</span>
          <button type="button" className="notice-close" onClick={() => setNotice(null)} aria-label="Cerrar">×</button>
        </div>
      )}

      <section className="td-kpis" aria-label="Indicadores docentes">
        <div className="td-kpi td-kpi--warn">
          <span>Recursos por validar</span>
          {loading ? <Skeleton width="52px" height="28px" /> : <strong>{recursosPendientes.length}</strong>}
        </div>
        <div className="td-kpi td-kpi--info">
          <span>Dudas sin resolver</span>
          {loading ? <Skeleton width="52px" height="28px" /> : <strong>{openQuestionsCount}</strong>}
        </div>
        <div className="td-kpi td-kpi--danger">
          <span>Respuestas IA a revisar</span>
          {loading ? <Skeleton width="52px" height="28px" /> : <strong>{aiPendingCount}</strong>}
        </div>
        <div className="td-kpi td-kpi--ok">
          <span>Exámenes / entregas</span>
          {loading ? <Skeleton width="52px" height="28px" /> : <strong>{eventos.length}</strong>}
        </div>
      </section>

      <nav className="td-tabs" aria-label="Secciones del panel docente">
        <button type="button" className={`td-tab ${activeTab === 'validacion' ? 'is-active' : ''}`} onClick={() => setActiveTab('validacion')}>
          Validación de recursos
          {recursosPendientes.length > 0 && <span className="td-tab__badge">{recursosPendientes.length}</span>}
        </button>
        <button type="button" className={`td-tab ${activeTab === 'oficial' ? 'is-active' : ''}`} onClick={() => setActiveTab('oficial')}>
          Material oficial
        </button>
        <button type="button" className={`td-tab ${activeTab === 'foro_ia' ? 'is-active' : ''}`} onClick={() => setActiveTab('foro_ia')}>
          Foro, Banco e IA
          {aiPendingCount > 0 && <span className="td-tab__badge">{aiPendingCount}</span>}
        </button>
        <button type="button" className={`td-tab ${activeTab === 'calendario' ? 'is-active' : ''}`} onClick={() => setActiveTab('calendario')}>
          Calendario y Retos
        </button>
        <button type="button" className={`td-tab ${activeTab === 'radar' ? 'is-active' : ''}`} onClick={() => setActiveTab('radar')}>
          Radar y Reportes
        </button>
      </nav>

      {/* TAB 1: COLA DE VALIDACIÓN DOCENTE (RF-19, RF-20, RF-21) */}
      {activeTab === 'validacion' && (
        <section className="card">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div>
              <h2 className="card__title">Bandeja de validación docente</h2>
              <p className="muted">Revisa apuntes estudiantiles, deja retroalimentación, otorga el sello oficial o archiva por error/plagio.</p>
            </div>
            <div className="row">
              {(['PENDIENTE', 'REVISADO_DOCENTE', 'ARCHIVADO'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  className={`btn btn--sm ${resourceFilter === st ? 'btn--primary' : 'btn--ghost'}`}
                  onClick={() => setResourceFilter(st)}
                >
                  {st === 'PENDIENTE'
                    ? `Pendientes (${recursosPendientes.length})`
                    : st === 'REVISADO_DOCENTE'
                      ? `Validados (${recursosValidados.length})`
                      : `Archivados (${recursosArchivados.length})`}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <CardListSkeleton count={3} />
          ) : filteredResources.length === 0 ? (
            <p className="empty">No hay recursos en esta bandeja por el momento.</p>
          ) : (
            <div className="skeleton-stack">
              {filteredResources.map((r) => (
                <article key={r._id} className="td-item">
                  <div className="td-item__head">
                    <div>
                      <strong>{r.titulo}</strong>
                      <div className="td-item__meta">
                        <span>Autor: {r.nombreAutor || 'Estudiante'}</span>
                        <span>· {r.idAsignatura ? subjectMap.get(r.idAsignatura) || 'Asignatura' : 'General'}</span>
                        <span>· {topicMap.get(r.idTema) || 'Tema'}</span>
                        <span>· {r.tipoArchivo.toUpperCase()} ({(r.tamanoBytes / 1024).toFixed(0)} KB)</span>
                        <span>· {new Date(r.createdAt).toLocaleDateString('es-MX')}</span>
                      </div>
                    </div>
                    <span className={`chip ${r.estadoValidacion === 'REVISADO_DOCENTE' ? 'chip--soft' : r.estadoValidacion === 'ARCHIVADO' ? 'chip--danger' : 'chip--xp'}`}>
                      {r.estadoValidacion === 'REVISADO_DOCENTE' ? (
                        r.esMaterialOficial ? (
                          <><Sparkles size={12} aria-hidden="true" /> Material Oficial</>
                        ) : (
                          <><CheckCircle2 size={12} aria-hidden="true" /> Revisado por docente</>
                        )
                      ) : r.estadoValidacion === 'ARCHIVADO' ? (
                        'Archivado'
                      ) : (
                        'Pendiente'
                      )}
                    </span>
                  </div>

                  {r.descripcion && <p className="muted">{r.descripcion}</p>}

                  {r.archivoUrl && !r.archivoUrl.includes('kolab.local') && (
                    <div className="row">
                      <a
                        href={r.archivoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn--ghost btn--sm"
                      >
                        <FileText size={14} aria-hidden="true" />
                        <span>Abrir / revisar archivo adjunto</span>
                      </a>
                    </div>
                  )}

                  {r.palabrasClave?.length > 0 && (
                    <div className="td-tags">
                      {r.palabrasClave.map((k) => <span key={k} className="td-tag">#{k}</span>)}
                    </div>
                  )}

                  {r.retroalimentacionDocente && (
                    <p className="muted"><strong>Retroalimentación previa:</strong> {r.retroalimentacionDocente}</p>
                  )}

                  {r.estadoValidacion !== 'REVISADO_DOCENTE' && (
                    <>
                      <div className="field">
                        <label htmlFor={`fb-${r._id}`}>Retroalimentación docente (obligatoria al archivar)</label>
                        <textarea
                          id={`fb-${r._id}`}
                          rows={2}
                          placeholder="Comentarios de mejora, reconocimiento o motivo de archivo por error grave/plagio…"
                          value={feedbackById[r._id] ?? ''}
                          onChange={(e) => setFeedbackById((prev) => ({ ...prev, [r._id]: e.target.value }))}
                        />
                      </div>
                      <div className="row">
                        <button type="button" className="btn btn--primary btn--sm" onClick={() => handleValidateResource(r._id, 'REVISADO_DOCENTE')}>
                          <CheckCircle2 size={14} aria-hidden="true" />
                          <span>Aprobar ("Revisado por docente")</span>
                        </button>
                        {r.estadoValidacion !== 'ARCHIVADO' && (
                          <button type="button" className="btn btn--danger btn--sm" onClick={() => handleValidateResource(r._id, 'ARCHIVADO')}>
                            <XCircle size={14} aria-hidden="true" />
                            <span>Archivar (error grave / plagio)</span>
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {/* TAB 2: CARGAR MATERIAL OFICIAL (RF-22) */}
      {activeTab === 'oficial' && (
        <div className="td-grid-2">
          <form className="card" onSubmit={handleUploadOfficial}>
            <h2 className="card__title">Subir material oficial de clase (RF-22)</h2>
            <p className="muted">Guías, rúbricas o bibliografía. Se publican con sello oficial y alimentan directamente al Asistente IA.</p>
            <div className="field">
              <label htmlFor="off-title">Título del material oficial</label>
              <input id="off-title" value={offTitle} onChange={(e) => setOffTitle(e.target.value)} placeholder="Ej. Rúbrica de Proyecto Final o Guía Unidad 2" required />
            </div>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="off-subj">Asignatura</label>
                <select id="off-subj" value={offSubjectId} onChange={(e) => setOffSubjectId(e.target.value)}>
                  {asignaturas.map((a) => <option key={a._id} value={a._id}>{a.nombre}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="off-topic">Tema</label>
                <select id="off-topic" value={offTopicId} onChange={(e) => setOffTopicId(e.target.value)} required>
                  {temas.map((t) => <option key={t._id} value={t._id}>{t.titulo}</option>)}
                </select>
              </div>
            </div>
            <div className="field">
              <label htmlFor="off-desc">Descripción breve (RF-83)</label>
              <input id="off-desc" value={offDesc} onChange={(e) => setOffDesc(e.target.value)} placeholder="Resumen breve visible en búsquedas…" />
            </div>
            <div className="field">
              <label htmlFor="off-kw">Palabras clave separadas por coma (RF-84)</label>
              <input id="off-kw" value={offKeywords} onChange={(e) => setOffKeywords(e.target.value)} placeholder="guía, rúbrica, examen parcial" />
            </div>
            <div className="field">
              <label htmlFor="off-content">Texto clave para indexación de IA RAG (opcional)</label>
              <textarea id="off-content" rows={3} value={offContent} onChange={(e) => setOffContent(e.target.value)} placeholder="Pega definiciones o puntos clave para que Gemini AI responda con precisión usando tu material…" />
            </div>
            <div className="field">
              <label htmlFor="off-file">Archivo (PDF, PNG, JPG, WEBP · máx. 10 MB)</label>
              <input id="off-file" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" onChange={(e) => setOffFile(e.target.files?.[0] || null)} required />
            </div>
            <div className="row">
              <button type="submit" className="btn btn--primary" disabled={uploadingOfficial || !offFile || !offTopicId}>
                <Sparkles size={15} aria-hidden="true" />
                <span>{uploadingOfficial ? 'Publicando…' : 'Publicar material oficial'}</span>
              </button>
              <Link className="btn btn--ghost btn--sm" to="/curricular">Gestionar temas</Link>
            </div>
          </form>

          <section className="card">
            <h2 className="card__title">Material oficial publicado ({officialResources.length})</h2>
            {loading ? (
              <RowListSkeleton count={4} />
            ) : officialResources.length === 0 ? (
              <p className="empty">Aún no has publicado material oficial de clase.</p>
            ) : (
              <div className="skeleton-stack">
                {officialResources.map((r) => (
                  <article key={r._id} className="td-item">
                    <div className="td-item__head">
                      <strong>{r.titulo}</strong>
                      <span className="chip chip--soft">
                        <Sparkles size={12} aria-hidden="true" /> Oficial
                      </span>
                    </div>
                    <div className="td-item__meta">
                      <span>{topicMap.get(r.idTema) || 'Tema'}</span>
                      <span>· {r.tipoArchivo.toUpperCase()}</span>
                      <span className="inline-icon-row">
                        · <Star size={12} fill="#eab308" color="#eab308" aria-hidden="true" /> {r.promedioCalificacion.toFixed(1)} ({r.totalCalificaciones})
                      </span>
                    </div>
                    {r.descripcion && <p className="muted">{r.descripcion}</p>}

                  {r.archivoUrl && !r.archivoUrl.includes('kolab.local') && (
                    <div className="row">
                      <a
                        href={r.archivoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn--ghost btn--sm"
                      >
                        <FileText size={14} aria-hidden="true" />
                        <span>Abrir / revisar archivo adjunto</span>
                      </a>
                    </div>
                  )}
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* TAB 3: FORO, BANCO COLABORATIVO Y REVISIÓN DE IA (RF-17, RF-47, RF-74) */}
      {activeTab === 'foro_ia' && (
        <div className="td-grid-2">
          <section className="card">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h2 className="card__title">Dudas y Banco Colaborativo (RF-17 / RF-47)</h2>
              <Link className="btn btn--ghost btn--sm" to="/foro">Ir al Foro</Link>
            </div>
            {loading ? (
              <CardListSkeleton count={3} />
            ) : preguntas.length === 0 ? (
              <p className="empty">No hay preguntas registradas todavía.</p>
            ) : (
              <div className="skeleton-stack">
                {preguntas.map((p) => (
                  <article key={p._id} className="td-item">
                    <div className="td-item__head">
                      <span className="chip chip--soft">{topicMap.get(p.idTema) || 'Tema'}</span>
                      <div className="row">
                        {p.validadaPorDocente && (
                          <span className="chip chip--solid">
                            <CheckCircle2 size={12} aria-hidden="true" /> Revisada por docente
                          </span>
                        )}
                        {p.resuelta ? <span className="chip chip--soft">Resuelta</span> : <span className="chip chip--xp">Abierta</span>}
                      </div>
                    </div>
                    <strong>{p.texto}</strong>
                    <div className="row">
                      {!p.validadaPorDocente && (
                        <button type="button" className="btn btn--ghost btn--sm" onClick={() => handleValidateBankQuestion(p._id)}>
                          Validar para banco (RF-47)
                        </button>
                      )}
                      {!p.resuelta && (
                        <button type="button" className="btn btn--ghost btn--sm" onClick={() => handleCloseQuestion(p._id)}>
                          Cerrar duda (RF-18)
                        </button>
                      )}
                    </div>
                    {p.respuestas && p.respuestas.length > 0 && (
                      <div className="answers">
                        {p.respuestas.map((r) => (
                          <div key={r._id} className="answer">
                            <p>{r.texto}</p>
                            <div className="row" style={{ justifyContent: 'space-between' }}>
                              <span className="muted">{r.votosUtilidad} votos</span>
                              {r.esValida ? (
                                <span className="chip chip--solid">
                                  <Star size={12} fill="currentColor" aria-hidden="true" /> Relevante
                                </span>
                              ) : (
                                <button type="button" className="btn btn--primary btn--sm" onClick={() => handleMarkRelevant(r._id)}>
                                  Marcar relevante
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="card">
            <h2 className="card__title">Revisión y corrección de IA (RF-74)</h2>
            <p className="muted">Respuestas de Gemini AI marcadas como "No útiles" por estudiantes para que puedas corregirlas.</p>
            {loading ? (
              <CardListSkeleton count={3} />
            ) : consultasIa.length === 0 ? (
              <p className="empty">No hay respuestas de IA reportadas como incorrectas. ¡Todo en orden!</p>
            ) : (
              <div className="skeleton-stack">
                {consultasIa.map((c) => (
                  <article key={c._id} className="td-item">
                    <div className="td-item__head">
                      <span className="chip chip--soft">{topicMap.get(c.idTema) || 'Tema'}</span>
                      <span className={`chip ${c.correccionDocente ? 'chip--soft' : 'chip--danger'}`}>
                        {c.correccionDocente ? (
                          <><CheckCircle2 size={12} aria-hidden="true" /> Corregida</>
                        ) : (
                          'Requiere revisión'
                        )}
                      </span>
                    </div>
                    <p><strong>Pregunta:</strong> {c.promptPregunta}</p>
                    <p className="muted"><strong>Respuesta IA:</strong> {c.respuestaIa.slice(0, 260)}{c.respuestaIa.length > 260 ? '…' : ''}</p>
                    {c.correccionDocente && (
                      <p className="form-ok">Corrección actual: {c.correccionDocente}</p>
                    )}
                    <div className="field">
                      <label htmlFor={`ia-${c._id}`}>Corrección oficial del docente</label>
                      <textarea
                        id={`ia-${c._id}`}
                        rows={2}
                        placeholder="Escribe la explicación correcta para este tema…"
                        value={correccionById[c._id] ?? c.correccionDocente ?? ''}
                        onChange={(e) => setCorreccionById((prev) => ({ ...prev, [c._id]: e.target.value }))}
                      />
                    </div>
                    <div className="row">
                      <button type="button" className="btn btn--primary btn--sm" onClick={() => handleCorrectAi(c._id)}>
                        Guardar corrección
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* TAB 4: CALENDARIO DE EXÁMENES Y RETOS (RF-77, RF-49) */}
      {activeTab === 'calendario' && (
        <div className="td-grid-2">
          <section className="card">
            <h2 className="card__title">Calendario de exámenes y entregas (RF-77)</h2>
            <form onSubmit={handleCreateEvent} className="skeleton-stack">
              <div className="field">
                <label htmlFor="cal-title">Título del examen o entrega</label>
                <input id="cal-title" value={calTitle} onChange={(e) => setCalTitle(e.target.value)} placeholder="Ej. Examen Parcial 2" required />
              </div>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="cal-type">Tipo</label>
                  <select id="cal-type" value={calType} onChange={(e) => setCalType(e.target.value as any)}>
                    <option value="EXAMEN">Examen</option>
                    <option value="ENTREGA">Entrega</option>
                    <option value="PROYECTO">Proyecto</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="cal-date">Fecha</label>
                  <input id="cal-date" type="date" value={calDate} onChange={(e) => setCalDate(e.target.value)} required />
                </div>
              </div>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="cal-subj">Asignatura</label>
                  <select id="cal-subj" value={calSubjectId} onChange={(e) => setCalSubjectId(e.target.value)} required>
                    {asignaturas.map((a) => <option key={a._id} value={a._id}>{a.nombre}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="cal-topic">Tema (opcional)</label>
                  <select id="cal-topic" value={calTopicId} onChange={(e) => setCalTopicId(e.target.value)}>
                    <option value="">General de la materia</option>
                    {temas.map((t) => <option key={t._id} value={t._id}>{t.titulo}</option>)}
                  </select>
                </div>
              </div>
              <div className="field">
                <label htmlFor="cal-desc">Indicaciones</label>
                <input id="cal-desc" value={calDesc} onChange={(e) => setCalDesc(e.target.value)} placeholder="Temas incluidos o formato de entrega…" />
              </div>
              <button type="submit" className="btn btn--primary" disabled={!calSubjectId}>
                + Registrar fecha académica
              </button>
            </form>

            <h3 style={{ marginTop: '0.5rem' }}>Próximos eventos ({eventos.length})</h3>
            {eventos.length === 0 ? (
              <p className="empty">Aún no hay fechas registradas.</p>
            ) : (
              <div className="skeleton-stack">
                {eventos.map((ev) => (
                  <div key={ev._id} className="td-item">
                    <div className="td-item__head">
                      <strong>{ev.titulo}</strong>
                      <span className="chip chip--xp">{ev.tipo} · {new Date(ev.fecha).toLocaleDateString('es-MX')}</span>
                    </div>
                    <span className="muted">
                      {subjectMap.get(ev.idAsignatura) || 'Asignatura'}
                      {ev.idTema ? ` · ${topicMap.get(ev.idTema) || 'Tema'}` : ''}
                    </span>
                    {ev.descripcion && <p className="muted">{ev.descripcion}</p>}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="card">
            <h2 className="card__title">Retos semanales comunitarios (RF-49)</h2>
            <form onSubmit={handleCreateChallenge} className="skeleton-stack">
              <div className="field">
                <label htmlFor="reto-title">Título del reto</label>
                <input id="reto-title" value={retoTitle} onChange={(e) => setRetoTitle(e.target.value)} placeholder="Ej. Resolver 50 dudas de Unidad 2" required />
              </div>
              <div className="field">
                <label htmlFor="reto-group">Grupo de estudio</label>
                <select id="reto-group" value={retoGroupId} onChange={(e) => setRetoGroupId(e.target.value)} required>
                  {grupos.length === 0 && <option value="">Crea un grupo en Comunidades primero</option>}
                  {grupos.map((g) => <option key={g._id} value={g._id}>{g.nombre}</option>)}
                </select>
              </div>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="reto-meta">Meta (cantidad)</label>
                  <input id="reto-meta" type="number" min={1} max={500} value={retoMeta} onChange={(e) => setRetoMeta(Number(e.target.value))} />
                </div>
                <div className="field">
                  <label htmlFor="reto-xp">Recompensa XP</label>
                  <input id="reto-xp" type="number" min={10} max={1000} step={10} value={retoXp} onChange={(e) => setRetoXp(Number(e.target.value))} />
                </div>
              </div>
              <div className="field">
                <label htmlFor="reto-desc">Descripción</label>
                <input id="reto-desc" value={retoDesc} onChange={(e) => setRetoDesc(e.target.value)} placeholder="Describe cómo lograr el reto en equipo…" />
              </div>
              <button type="submit" className="btn btn--action" disabled={!retoGroupId}>
                + Publicar reto semanal
              </button>
            </form>

            <h3 style={{ marginTop: '0.5rem' }}>Retos activos ({retos.length})</h3>
            {retos.length === 0 ? (
              <p className="empty">Sin retos comunitarios publicados.</p>
            ) : (
              <div className="skeleton-stack">
                {retos.map((rt) => (
                  <div key={rt._id} className="td-item">
                    <div className="td-item__head">
                      <strong>{rt.titulo}</strong>
                      <span className="chip chip--xp">+{rt.xpRecompensa} XP</span>
                    </div>
                    <span className="muted">
                      {groupMap.get(rt.idGrupo) || 'Grupo'} · Progreso {rt.progresoActual}/{rt.metaCantidad}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* TAB 5: RADAR DE DIFICULTADES Y REPORTES (RF-27, RF-28, RF-82) */}
      {activeTab === 'radar' && (
        <section className="card">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div>
              <h2 className="card__title">Radar de Dificultades y Exportación (RF-27, RF-28, RF-82)</h2>
              <p className="muted">Dudas sin resolver cruzadas con errores en cuestionarios de autoevaluación por tema.</p>
            </div>
            <div className="row">
              <button type="button" className="btn btn--primary btn--sm" onClick={handleExportRadarCsv} disabled={radar.length === 0}>
                Descargar CSV
              </button>
              <button type="button" className="btn btn--ghost btn--sm" onClick={handleExportRadarPdf}>
                Imprimir / PDF
              </button>
            </div>
          </div>

          {loading ? (
            <CardListSkeleton count={3} />
          ) : radar.length === 0 ? (
            <p className="empty">Aún no hay suficientes preguntas ni intentos de cuestionarios para generar el radar.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Tema</th>
                    <th>Preguntas</th>
                    <th>Sin resolver</th>
                    <th>Errores Quiz</th>
                    <th>Conceptos a reforzar</th>
                    <th>Pregunta más debatida sin respuesta relevante</th>
                  </tr>
                </thead>
                <tbody>
                  {radar.map((item) => (
                    <tr key={item.idTema}>
                      <td><strong>{topicMap.get(item.idTema) || item.idTema}</strong></td>
                      <td>{item.totalPreguntas}</td>
                      <td>
                        <span className={`chip ${item.preguntasSinResolver > 2 ? 'chip--danger' : 'chip--xp'}`}>
                          {item.preguntasSinResolver}
                        </span>
                      </td>
                      <td>{item.erroresAutoevaluacion}</td>
                      <td>
                        {item.conceptosDebiles?.length > 0 ? (
                          <div className="td-tags">
                            {item.conceptosDebiles.map((c, idx) => (
                              <span key={idx} className="td-tag">{c}</span>
                            ))}
                          </div>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td>{item.preguntaMasDebatidaSinSolucion?.texto || <span className="muted">Ninguna</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
