import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Flag,
  ThumbsUp,
  UserRound,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { MODULES } from '../data/modules';
import { USE_MOCK, gqlRequest } from '../services/api';
import { assertNoScriptInjection } from '../utils/inputSecurity';
import { toFriendlyError } from '../utils/friendlyError';
import ModuleBanner from '../components/ModuleBanner';
import ReportModal from '../components/ReportModal';
import { CardListSkeleton } from '../components/Skeleton';

const MAX_LIKES_PER_USER = 5;
const ANSWERS_STEP = 3;

function parseSemesterNumber(raw?: string): number {
  if (!raw) return Number.MAX_SAFE_INTEGER;
  const match = raw.match(/\d+/);
  return match ? parseInt(match[0], 10) : Number.MAX_SAFE_INTEGER - 1;
}

function normalizeSemesterKey(raw?: string): string {
  const trimmed = raw?.trim();
  if (!trimmed) return 'Sin semestre asignado';
  if (/^\d+$/.test(trimmed)) return `${trimmed}° Semestre`;
  return trimmed;
}

function formatDateTime(iso?: string): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const day = date.toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const time = date.toLocaleTimeString('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${day} · ${time}`;
}

interface RespuestaItem {
  _id: string;
  idPregunta: string;
  idUsuario: string;
  nombreAutor?: string;
  fotoAutor?: string;
  texto: string;
  esValida: boolean;
  votosUtilidad: number;
  misVotos?: number;
  createdAt: string;
}

interface PreguntaItem {
  _id: string;
  texto: string;
  idTema: string;
  idUsuario: string;
  nombreAutor?: string;
  fotoAutor?: string;
  resuelta: boolean;
  esBancoColaborativo: boolean;
  validadaPorDocente: boolean;
  votosUtilidad: number;
  misVotos?: number;
  etiquetas: string[];
  fragmentoRecurso?: string;
  createdAt: string;
  respuestas: RespuestaItem[];
}

interface CarreraItem {
  _id: string;
  nombre: string;
}

interface AsignaturaItem {
  _id: string;
  nombre: string;
  cuatrimestre?: string;
  idCarrera?: string;
}

interface TemaItem {
  _id: string;
  titulo: string;
  idAsignatura: string;
}

export default function Foro() {
  const { user, token } = useAuth();
  const [params] = useSearchParams();
  const q = (params.get('q') ?? '').toLowerCase();

  const [preguntas, setPreguntas] = useState<PreguntaItem[]>([]);
  const [carreras, setCarreras] = useState<CarreraItem[]>([]);
  const [asignaturas, setAsignaturas] = useState<AsignaturaItem[]>([]);
  const [temas, setTemas] = useState<TemaItem[]>([]);
  const [selectedCareerId, setSelectedCareerId] = useState('TODAS');
  const [selectedSemester, setSelectedSemester] = useState('TODOS');
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [loading, setLoading] = useState(true);
  const [onlyBank, setOnlyBank] = useState(false);
  const [form, setForm] = useState({
    texto: '',
    fragmento: '',
    etiquetas: '',
    idTema: '',
    esBancoColaborativo: false,
  });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [creatingQuestion, setCreatingQuestion] = useState(false);
  const creatingRef = useRef(false);
  const [reportTarget, setReportTarget] = useState<{ id: string; preview: string } | null>(null);

  const loadForo = useCallback(async () => {
    if (USE_MOCK || !token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await gqlRequest<{
        preguntas: Array<Omit<PreguntaItem, 'respuestas'>>;
        carreras: CarreraItem[];
        asignaturas: AsignaturaItem[];
        temas: TemaItem[];
      }>(
        `query ForoData {
          preguntas {
            _id texto idTema idUsuario nombreAutor fotoAutor resuelta esBancoColaborativo validadaPorDocente votosUtilidad misVotos etiquetas fragmentoRecurso createdAt
          }
          carreras { _id nombre }
          asignaturas { _id nombre cuatrimestre idCarrera }
          temas { _id titulo idAsignatura }
        }`,
        {},
        token,
      );
      const rawPreguntas = data.preguntas ?? [];
      setCarreras(data.carreras ?? []);
      setAsignaturas(data.asignaturas ?? []);
      setTemas(data.temas ?? []);

      const respuestasList = await Promise.all(
        rawPreguntas.map((p) =>
          gqlRequest<{ respuestas: RespuestaItem[] }>(
            `query Respuestas($id: ID!) {
              respuestas(idPregunta: $id) { _id idPregunta idUsuario nombreAutor fotoAutor texto esValida votosUtilidad misVotos createdAt }
            }`,
            { id: p._id },
            token,
          )
            .then((r) => r.respuestas ?? [])
            .catch(() => []),
        ),
      );

      setPreguntas(
        rawPreguntas.map((p, idx) => ({
          ...p,
          respuestas: respuestasList[idx] ?? [],
        })),
      );
    } catch (err: any) {
      setError(err.message || 'No se pudieron cargar las preguntas del foro.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  const coursesByCareer = useMemo(
    () => (selectedCareerId === 'TODAS' ? asignaturas : asignaturas.filter((a) => a.idCarrera === selectedCareerId)),
    [asignaturas, selectedCareerId],
  );

  const availableSemesters = useMemo(() => {
    const keys = Array.from(new Set(coursesByCareer.map((a) => normalizeSemesterKey(a.cuatrimestre))));
    return keys.sort((a, b) => parseSemesterNumber(a) - parseSemesterNumber(b) || a.localeCompare(b));
  }, [coursesByCareer]);

  const filteredSubjects = useMemo(
    () =>
      selectedSemester === 'TODOS'
        ? coursesByCareer
        : coursesByCareer.filter((a) => normalizeSemesterKey(a.cuatrimestre) === selectedSemester),
    [coursesByCareer, selectedSemester],
  );

  const filteredTopics = useMemo(
    () => (selectedSubjectId ? temas.filter((t) => t.idAsignatura === selectedSubjectId) : []),
    [temas, selectedSubjectId],
  );

  useEffect(() => {
    if (selectedSemester !== 'TODOS' && !availableSemesters.includes(selectedSemester)) {
      setSelectedSemester('TODOS');
    }
  }, [availableSemesters, selectedSemester]);

  useEffect(() => {
    if (filteredSubjects.length === 0) {
      if (selectedSubjectId !== '') setSelectedSubjectId('');
      return;
    }
    if (!filteredSubjects.some((s) => s._id === selectedSubjectId)) {
      setSelectedSubjectId(filteredSubjects[0]._id);
    }
  }, [filteredSubjects, selectedSubjectId]);

  useEffect(() => {
    if (filteredTopics.length === 0) {
      if (form.idTema !== '') setForm((f) => ({ ...f, idTema: '' }));
      return;
    }
    if (!filteredTopics.some((t) => t._id === form.idTema)) {
      setForm((f) => ({ ...f, idTema: filteredTopics[0]._id }));
    }
  }, [filteredTopics, form.idTema]);

  useEffect(() => {
    loadForo();
  }, [loadForo]);

  const temaMap = useMemo(() => new Map(temas.map((t) => [t._id, t.titulo])), [temas]);

  const onChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setForm((f) => ({
      ...f,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value,
    }));
  };

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token || creatingRef.current) return;
    try {
      assertNoScriptInjection(form, 'foro');
    } catch (err: any) {
      return setError(toFriendlyError(err));
    }
    if (form.texto.trim().length < 8) return setError('Escribe tu pregunta con un poco más de detalle (al menos 8 caracteres).');
    if (!form.idTema) return setError('Selecciona un tema para publicar tu pregunta.');

    const etiquetas = form.etiquetas
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    creatingRef.current = true;
    setCreatingQuestion(true);
    try {
      const res = await gqlRequest<{ crearPregunta: Omit<PreguntaItem, 'respuestas'> }>(
        `mutation CrearPregunta($idTema: ID!, $texto: String!, $fragmento: String, $etiquetas: [String!], $banco: Boolean) {
          crearPregunta(idTema: $idTema, texto: $texto, fragmentoRecurso: $fragmento, etiquetas: $etiquetas, esBancoColaborativo: $banco) {
            _id texto idTema idUsuario nombreAutor fotoAutor resuelta esBancoColaborativo validadaPorDocente votosUtilidad misVotos etiquetas fragmentoRecurso createdAt
          }
        }`,
        {
          idTema: form.idTema,
          texto: form.texto.trim(),
          ...(form.fragmento.trim() ? { fragmento: form.fragmento.trim() } : {}),
          etiquetas,
          banco: form.esBancoColaborativo,
        },
        token,
      );
      setPreguntas((p) =>
        p.some((item) => item._id === res.crearPregunta._id)
          ? p
          : [{ ...res.crearPregunta, respuestas: [] }, ...p],
      );
      setForm((f) => ({ ...f, texto: '', fragmento: '', etiquetas: '', esBancoColaborativo: false }));
      setError('');
      setNotice('Pregunta publicada correctamente.');
      setShowForm(false);
    } catch (err: any) {
      setError(toFriendlyError(err, 'No se pudo publicar tu pregunta. Intenta de nuevo.'));
    } finally {
      creatingRef.current = false;
      setCreatingQuestion(false);
    }
  }

  async function responder(idPregunta: string, texto: string) {
    if (!token) return;
    const res = await gqlRequest<{ responderPregunta: RespuestaItem }>(
      `mutation Responder($idPregunta: ID!, $texto: String!) {
        responderPregunta(idPregunta: $idPregunta, texto: $texto) {
          _id idPregunta idUsuario nombreAutor fotoAutor texto esValida votosUtilidad misVotos createdAt
        }
      }`,
      { idPregunta, texto },
      token,
    );
    setPreguntas((p) =>
      p.map((x) => {
        if (x._id !== idPregunta) return x;
        if (x.respuestas.some((r) => r._id === res.responderPregunta._id)) return x;
        return { ...x, respuestas: [...x.respuestas, res.responderPregunta] };
      }),
    );
  }

  async function validar(qid: string, rid: string) {
    if (!token) return;
    setError('');
    try {
      await gqlRequest(
        `mutation MarcarRelevante($id: ID!) {
          marcarRespuestaRelevante(respuestaId: $id) { _id esValida }
        }`,
        { id: rid },
        token,
      );
      setPreguntas((p) =>
        p.map((x) =>
          x._id === qid
            ? { ...x, resuelta: true, respuestas: x.respuestas.map((r) => (r._id === rid ? { ...r, esValida: true } : r)) }
            : x,
        ),
      );
      setNotice('Respuesta marcada como relevante.');
    } catch (err: any) {
      setError(toFriendlyError(err, 'No se pudo marcar esta respuesta como relevante.'));
    }
  }

  async function cerrarResuelta(qid: string) {
    if (!token) return;
    setError('');
    try {
      await gqlRequest(`mutation Cerrar($id: ID!) { cerrarPreguntaResuelta(preguntaId: $id) { _id resuelta } }`, { id: qid }, token);
      setPreguntas((p) => p.map((x) => (x._id === qid ? { ...x, resuelta: true } : x)));
      setNotice('Pregunta marcada como resuelta.');
    } catch (err: any) {
      setError(toFriendlyError(err, 'No se pudo cerrar la pregunta.'));
    }
  }

  async function validarBanco(qid: string) {
    if (!token) return;
    setError('');
    try {
      await gqlRequest(`mutation ValidarBanco($id: ID!) { validarPreguntaBanco(preguntaId: $id) { _id validadaPorDocente } }`, { id: qid }, token);
      setPreguntas((p) => p.map((x) => (x._id === qid ? { ...x, validadaPorDocente: true } : x)));
      setNotice('Pregunta validada para el banco colaborativo.');
    } catch (err: any) {
      setError(toFriendlyError(err, 'No se pudo validar esta pregunta.'));
    }
  }

  async function votarPregunta(qid: string) {
    if (!token) return;
    setError('');
    try {
      const res = await gqlRequest<{ votarPregunta: { votosUtilidad: number; misVotos: number } }>(
        `mutation VotarP($id: ID!) { votarPregunta(preguntaId: $id) { votosUtilidad misVotos } }`,
        { id: qid },
        token,
      );
      setPreguntas((p) =>
        p.map((x) =>
          x._id === qid
            ? {
                ...x,
                votosUtilidad: res.votarPregunta.votosUtilidad,
                misVotos: res.votarPregunta.misVotos,
              }
            : x,
        ),
      );
    } catch (err: any) {
      setError(toFriendlyError(err, `Solo puedes dar un máximo de ${MAX_LIKES_PER_USER} likes por pregunta.`));
    }
  }

  async function votarRespuesta(qid: string, rid: string) {
    if (!token) return;
    setError('');
    try {
      const res = await gqlRequest<{ votarRespuesta: { votosUtilidad: number; misVotos: number } }>(
        `mutation VotarR($id: ID!) { votarRespuesta(respuestaId: $id) { votosUtilidad misVotos } }`,
        { id: rid },
        token,
      );
      setPreguntas((p) =>
        p.map((x) =>
          x._id === qid
            ? {
                ...x,
                respuestas: x.respuestas.map((r) =>
                  r._id === rid
                    ? {
                        ...r,
                        votosUtilidad: res.votarRespuesta.votosUtilidad,
                        misVotos: res.votarRespuesta.misVotos,
                      }
                    : r,
                ),
              }
            : x,
        ),
      );
    } catch (err: any) {
      setError(toFriendlyError(err, `Solo puedes dar un máximo de ${MAX_LIKES_PER_USER} likes por respuesta.`));
    }
  }

  async function submitReport(motivo: string) {
    if (!token || !reportTarget) return;
    await gqlRequest(
      `mutation ReportarP($id: ID!, $motivo: String!) {
        reportarContenido(tipoObjetivo: "PREGUNTA", idObjetivo: $id, motivo: $motivo) { _id }
      }`,
      { id: reportTarget.id, motivo },
      token,
    );
    setNotice('Pregunta reportada a moderación. Gracias por ayudar a mantener la comunidad segura.');
  }

  const puedeValidar = user?.rol === 'docente' || user?.rol === 'admin';
  const lista = preguntas.filter((x) => {
    if (onlyBank && !x.esBancoColaborativo) return false;
    const temaNombre = temaMap.get(x.idTema) ?? '';
    return `${x.texto} ${x.fragmentoRecurso ?? ''} ${x.etiquetas.join(' ')} ${temaNombre}`.toLowerCase().includes(q);
  });

  return (
    <>
      <ModuleBanner module={MODULES[3]}>
        <div className="row">
          <button
            type="button"
            className={`btn btn--sm ${onlyBank ? 'btn--primary' : 'btn--ghost'}`}
            onClick={() => setOnlyBank((b) => !b)}
          >
            {onlyBank && <Check size={14} aria-hidden="true" />}
            <span>{onlyBank ? 'Banco colaborativo' : 'Ver banco colaborativo'}</span>
          </button>
          <button className="btn btn--action" onClick={() => setShowForm((s) => !s)}>
            {showForm ? 'Cerrar' : 'Nueva pregunta'}
          </button>
        </div>
      </ModuleBanner>

      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <p className="form-ok" role="status">{notice}</p>}

      {showForm && (
        <form className="card" onSubmit={onSubmit} noValidate>
          <h2 className="card__title">Nueva pregunta</h2>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="foro-career">Carrera</label>
              <select
                id="foro-career"
                value={selectedCareerId}
                onChange={(e) => {
                  setSelectedCareerId(e.target.value);
                  setSelectedSemester('TODOS');
                }}
              >
                <option value="TODAS">Todas las carreras</option>
                {carreras.map((c) => (
                  <option key={c._id} value={c._id}>{c.nombre}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="foro-semester">Semestre / Cuatrimestre</label>
              <select
                id="foro-semester"
                value={selectedSemester}
                onChange={(e) => setSelectedSemester(e.target.value)}
                disabled={availableSemesters.length === 0}
              >
                <option value="TODOS">Todos los semestres</option>
                {availableSemesters.map((sem) => (
                  <option key={sem} value={sem}>{sem}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="foro-subject">Asignatura</label>
              <select
                id="foro-subject"
                value={selectedSubjectId}
                onChange={(e) => setSelectedSubjectId(e.target.value)}
              >
                {filteredSubjects.length === 0 && <option value="">Sin asignaturas disponibles</option>}
                {filteredSubjects.map((a) => (
                  <option key={a._id} value={a._id}>{a.nombre}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="idTema">Tema</label>
              <select id="idTema" name="idTema" value={form.idTema} onChange={onChange}>
                {filteredTopics.length === 0 && <option value="">Sin temas para esta asignatura</option>}
                {filteredTopics.map((t) => (
                  <option key={t._id} value={t._id}>{t.titulo}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="field">
            <label htmlFor="texto">Pregunta</label>
            <input id="texto" name="texto" value={form.texto} onChange={onChange} />
          </div>
          <div className="field">
            <label htmlFor="fragmento">Detalle o fragmento del recurso que no entendiste</label>
            <textarea id="fragmento" name="fragmento" value={form.fragmento} onChange={onChange} />
          </div>
          <div className="field">
            <label htmlFor="etiquetas">Etiquetas separadas por coma</label>
            <input id="etiquetas" name="etiquetas" value={form.etiquetas} onChange={onChange} placeholder="SQL, parcial 1" />
          </div>
          <label className="row" style={{ cursor: 'pointer' }}>
            <input type="checkbox" name="esBancoColaborativo" checked={form.esBancoColaborativo} onChange={onChange} />
            <span>Compartir también en el <strong>Banco Colaborativo de preguntas</strong></span>
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="row">
            <button type="submit" className="btn btn--primary" disabled={!form.idTema || creatingQuestion}>
              {creatingQuestion ? 'Publicando…' : 'Publicar'}
            </button>
          </div>
        </form>
      )}

      {q && <p className="muted">Resultados para “{params.get('q')}”</p>}
      {loading ? (
        <CardListSkeleton count={3} />
      ) : lista.length === 0 ? (
        <p className="empty">
          {preguntas.length === 0
            ? 'No hay preguntas todavía. ¡Sé el primero en preguntar!'
            : 'No se encontraron preguntas con esos criterios.'}
        </p>
      ) : (
        lista.map((p) => (
          <Pregunta
            key={p._id}
            p={p}
            currentUserId={String(user?.id ?? '')}
            temaNombre={temaMap.get(p.idTema) || 'Tema general'}
            puedeValidar={puedeValidar}
            onResponder={responder}
            onValidar={validar}
            onCerrar={cerrarResuelta}
            onValidarBanco={validarBanco}
            onVotarPregunta={votarPregunta}
            onVotarRespuesta={votarRespuesta}
            onReportar={(qid, preview) => setReportTarget({ id: qid, preview })}
          />
        ))
      )}

      <ReportModal
        open={Boolean(reportTarget)}
        targetLabel="Pregunta del foro"
        targetPreview={reportTarget?.preview}
        onClose={() => setReportTarget(null)}
        onSubmit={submitReport}
      />
    </>
  );
}

function Pregunta({
  p,
  currentUserId,
  temaNombre,
  puedeValidar,
  onResponder,
  onValidar,
  onCerrar,
  onValidarBanco,
  onVotarPregunta,
  onVotarRespuesta,
  onReportar,
}: {
  p: PreguntaItem;
  currentUserId: string;
  temaNombre: string;
  puedeValidar: boolean;
  onResponder: (id: string, texto: string) => Promise<void>;
  onValidar: (qid: string, rid: string) => Promise<void>;
  onCerrar: (qid: string) => Promise<void>;
  onValidarBanco: (qid: string) => Promise<void>;
  onVotarPregunta: (qid: string) => Promise<void>;
  onVotarRespuesta: (qid: string, rid: string) => Promise<void>;
  onReportar: (qid: string, preview: string) => void;
}) {
  const [texto, setTexto] = useState('');
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const [respError, setRespError] = useState('');
  const [visibleAnswersCount, setVisibleAnswersCount] = useState(ANSWERS_STEP);
  const resuelta = p.resuelta || p.respuestas.some((r) => r.esValida);
  const puedeCerrar = !resuelta && (puedeValidar || String(p.idUsuario) === currentUserId);
  const pMyLikes = p.misVotos ?? 0;
  const pLikesMaxed = pMyLikes >= MAX_LIKES_PER_USER;
  const visibleAnswers = p.respuestas.slice(0, visibleAnswersCount);
  const hiddenAnswersCount = Math.max(0, p.respuestas.length - visibleAnswers.length);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (sendingRef.current) return;
    const clean = texto.trim();
    if (!clean) return;
    try {
      assertNoScriptInjection(clean, 'respuesta');
      setRespError('');
      sendingRef.current = true;
      setSending(true);
      setTexto('');
      await onResponder(p._id, clean);
      setVisibleAnswersCount((c) => Math.max(c, p.respuestas.length + 1));
    } catch (err: any) {
      setTexto(clean);
      setRespError(toFriendlyError(err, 'No se pudo enviar tu respuesta. Intenta de nuevo.'));
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  return (
    <article className="card question">
      <div className="question__head">
        <div>
          <div className="forum-author" style={{ marginBottom: '0.45rem' }}>
            <div className="forum-avatar">
              {p.fotoAutor ? (
                <img src={p.fotoAutor} alt={p.nombreAutor || 'Usuario'} />
              ) : (
                <UserRound size={16} aria-hidden="true" />
              )}
            </div>
            <div className="forum-author__meta">
              <strong>{p.nombreAutor || 'Estudiante Kolab'}</strong>
              <span className="forum-author__time">
                <Clock size={12} aria-hidden="true" />
                <span>{formatDateTime(p.createdAt)}</span>
              </span>
            </div>
          </div>

          <div className="row">
            <span className="chip chip--soft">{temaNombre}</span>
            {p.esBancoColaborativo && <span className="chip chip--xp">Banco colaborativo</span>}
            {p.validadaPorDocente && (
              <span className="chip chip--solid">
                <CheckCircle2 size={13} aria-hidden="true" /> Revisada por docente
              </span>
            )}
          </div>
          <h2 style={{ marginTop: '0.4rem' }}>{p.texto}</h2>
          {p.fragmentoRecurso && <p className="muted">Fragmento: “{p.fragmentoRecurso}”</p>}
          {p.etiquetas?.length > 0 && (
            <div className="td-tags" style={{ marginTop: 6 }}>
              {p.etiquetas.map((et) => <span key={et} className="td-tag">#{et}</span>)}
            </div>
          )}
        </div>
        <span className={`chip ${resuelta ? 'chip--solid' : 'chip--xp'}`}>
          {resuelta ? (
            <><CheckCircle2 size={13} aria-hidden="true" /> Resuelta</>
          ) : (
            'Abierta'
          )}
        </span>
      </div>

      <div className="row">
        <button
          type="button"
          className={`btn btn--ghost btn--sm forum-like-btn ${pMyLikes > 0 ? 'is-liked' : ''} ${pLikesMaxed ? 'is-maxed' : ''}`}
          onClick={() => onVotarPregunta(p._id)}
          disabled={pLikesMaxed}
          title={pLikesMaxed ? 'Ya diste el máximo de likes en esta pregunta' : 'Marcar como útil'}
        >
          <ThumbsUp size={14} fill={pMyLikes > 0 ? 'currentColor' : 'none'} aria-hidden="true" />
          <span>Útil ({p.votosUtilidad})</span>
        </button>
        {puedeCerrar && (
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => onCerrar(p._id)}>
            <CheckCircle2 size={14} aria-hidden="true" />
            <span>Cerrar resuelta</span>
          </button>
        )}
        {puedeValidar && !p.validadaPorDocente && (
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => onValidarBanco(p._id)}>
            Validar para banco
          </button>
        )}
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() => onReportar(p._id, p.texto)}
        >
          <Flag size={14} aria-hidden="true" />
          <span>Reportar</span>
        </button>
      </div>

      {p.respuestas.length > 0 && (
        <div className="answers">
          {visibleAnswers.map((r) => {
            const rMyLikes = r.misVotos ?? 0;
            const rLikesMaxed = rMyLikes >= MAX_LIKES_PER_USER;
            return (
              <div className="answer" key={r._id}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <div className="forum-author">
                    <div className="forum-avatar">
                      {r.fotoAutor ? (
                        <img src={r.fotoAutor} alt={r.nombreAutor || 'Usuario'} />
                      ) : (
                        <UserRound size={16} aria-hidden="true" />
                      )}
                    </div>
                    <div className="forum-author__meta">
                      <strong>{r.nombreAutor || 'Estudiante Kolab'}</strong>
                      <span className="forum-author__time">
                        <Clock size={12} aria-hidden="true" />
                        <span>{formatDateTime(r.createdAt)}</span>
                      </span>
                    </div>
                  </div>
                  {r.esValida && (
                    <span className="chip chip--solid">
                      <CheckCircle2 size={13} aria-hidden="true" /> Relevante
                    </span>
                  )}
                </div>
                <p style={{ marginTop: '0.2rem' }}>{r.texto}</p>
                <div className="row">
                  <button
                    type="button"
                    className={`btn btn--ghost btn--sm forum-like-btn ${rMyLikes > 0 ? 'is-liked' : ''} ${rLikesMaxed ? 'is-maxed' : ''}`}
                    onClick={() => onVotarRespuesta(p._id, r._id)}
                    disabled={rLikesMaxed}
                    title={rLikesMaxed ? 'Ya diste el máximo de likes en esta respuesta' : 'Me parece útil'}
                  >
                    <ThumbsUp size={14} fill={rMyLikes > 0 ? 'currentColor' : 'none'} aria-hidden="true" />
                    <span>{r.votosUtilidad}</span>
                  </button>
                  {puedeValidar && !r.esValida && (
                    <button
                      type="button"
                      className="btn btn--primary btn--sm"
                      onClick={() => onValidar(p._id, r._id)}
                    >
                      <Check size={14} aria-hidden="true" />
                      <span>Marcar relevante</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {p.respuestas.length > ANSWERS_STEP && (
            <div className="row" style={{ marginTop: '0.25rem' }}>
              {hiddenAnswersCount > ANSWERS_STEP && (
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => setVisibleAnswersCount((c) => c + ANSWERS_STEP)}
                >
                  <ChevronDown size={14} aria-hidden="true" />
                  <span>Ver {ANSWERS_STEP} más</span>
                </button>
              )}
              {hiddenAnswersCount > 0 ? (
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => setVisibleAnswersCount(p.respuestas.length)}
                >
                  <ChevronDown size={14} aria-hidden="true" />
                  <span>Mostrar todas las respuestas ({p.respuestas.length})</span>
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => setVisibleAnswersCount(ANSWERS_STEP)}
                >
                  <ChevronUp size={14} aria-hidden="true" />
                  <span>Mostrar menos respuestas</span>
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <form className="row" onSubmit={enviar}>
        <label className="sr-only" htmlFor={`r-${p._id}`}>Responder</label>
        <input
          id={`r-${p._id}`}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          disabled={sending}
          placeholder="Escribe una respuesta útil…"
          style={{ flex: 1, minHeight: 44, padding: '0 1rem', borderRadius: 14, border: '2px solid var(--borde)' }}
        />
        <button type="submit" className="btn btn--primary btn--sm" disabled={sending || !texto.trim()}>
          {sending ? 'Enviando…' : 'Responder'}
        </button>
      </form>
      {respError && <p className="form-error" role="alert">{respError}</p>}
    </article>
  );
}
