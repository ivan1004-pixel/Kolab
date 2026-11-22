import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Bot,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileDown,
  FileSearch,
  FileText,
  Flag,
  History,
  Send,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { USE_MOCK, gqlRequest } from '../services/api';
import { assertNoScriptInjection } from '../utils/inputSecurity';
import { toFriendlyError } from '../utils/friendlyError';
import { downloadCsv, escapeHtml, exportHtmlToPdf } from '../utils/exportUtils';
import ReportModal from '../components/ReportModal';
import Skeleton, { RowListSkeleton } from '../components/Skeleton';

interface TemaItem {
  _id: string;
  titulo: string;
}

interface RecursoOpcion {
  _id: string;
  titulo: string;
  descripcion?: string;
  archivoUrl?: string;
  tipoArchivo: string;
  idTema: string;
  estadoValidacion: string;
  esMaterialOficial: boolean;
}

interface FuenteCitada {
  tituloRecurso: string;
  fragmento: string;
}

interface RecursoRecomendadoItem {
  idRecurso: string;
  titulo: string;
  motivo: string;
  archivoUrl?: string;
}

interface ChatMsg {
  id: string;
  sender: 'student' | 'ai' | 'system-ready';
  text: string;
  respuestaRecurso?: string;
  respuestaComplementaria?: string;
  sourceLabel?: string;
  temasClave?: string[];
  isTeacherReviewed?: boolean;
  rated?: boolean | null;
}

interface Reactivo {
  numero: number;
  pregunta: string;
  tipo: string;
  opciones: string[];
  respuestaCorrecta: string;
  explicacion: string;
}

interface CuestionarioItem {
  _id: string;
  titulo: string;
  idTema: string;
  reactivos: Reactivo[];
}

interface IntentoItem {
  _id: string;
  idTema: string;
  tituloCuestionario?: string;
  aciertos: number;
  totalReactivos: number;
  calificacion: number;
  retroalimentacion: string;
  conceptosPorReforzar: string[];
  recursosRecomendados?: RecursoRecomendadoItem[];
  createdAt: string;
}

export default function Asistente() {
  const { token } = useAuth();
  const [temas, setTemas] = useState<TemaItem[]>([]);
  const [recursos, setRecursos] = useState<RecursoOpcion[]>([]);
  const [historial, setHistorial] = useState<IntentoItem[]>([]);
  const [loadingInit, setLoadingInit] = useState(!USE_MOCK && Boolean(token));

  const [selectedTemaId, setSelectedTemaId] = useState('');
  const [selectedRecursoId, setSelectedRecursoId] = useState('');
  const [analyzingDoc, setAnalyzingDoc] = useState(false);
  const [analyzedDocTitle, setAnalyzedDocTitle] = useState('');

  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [questionInput, setQuestionInput] = useState('');
  const [asking, setAsking] = useState(false);
  const [securityError, setSecurityError] = useState('');
  const [statusOk, setStatusOk] = useState('');
  const [reportTarget, setReportTarget] = useState<{ id: string; preview: string } | null>(null);

  // Autoevaluación paso a paso (1 pregunta a la vez)
  const [quizCount, setQuizCount] = useState(5);
  const [activeQuiz, setActiveQuiz] = useState<CuestionarioItem | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [generatingQuiz, setGeneratingQuiz] = useState(false);
  const [gradingQuiz, setGradingQuiz] = useState(false);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [evaluationResult, setEvaluationResult] = useState<IntentoItem | null>(null);
  const [showReview, setShowReview] = useState(false);

  const autoAdvanceTimerRef = useRef<number | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    return () => {
      if (autoAdvanceTimerRef.current) window.clearTimeout(autoAdvanceTimerRef.current);
    };
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages, analyzingDoc, asking]);

  const loadData = useCallback(async () => {
    if (USE_MOCK || !token) {
      setLoadingInit(false);
      return;
    }
    setLoadingInit(true);
    try {
      const data = await gqlRequest<{
        temas: TemaItem[];
        recursos: RecursoOpcion[];
        miHistorialCuestionarios: IntentoItem[];
      }>(
        `query AsistenteInit {
          temas { _id titulo }
          recursos {
            _id titulo descripcion archivoUrl tipoArchivo idTema estadoValidacion esMaterialOficial
          }
          miHistorialCuestionarios {
            _id idTema tituloCuestionario aciertos totalReactivos calificacion
            retroalimentacion conceptosPorReforzar createdAt
            recursosRecomendados { idRecurso titulo motivo archivoUrl }
          }
        }`,
        {},
        token,
      );
      const temaList = data.temas ?? [];
      const recursoList = data.recursos ?? [];
      setTemas(temaList);
      setRecursos(recursoList);
      setHistorial(data.miHistorialCuestionarios ?? []);
      if (temaList.length > 0 && !selectedTemaId) {
        setSelectedTemaId(temaList[0]._id);
      }
    } catch (err: any) {
      setSecurityError(toFriendlyError(err, 'No se pudieron cargar los datos del asistente.'));
    } finally {
      setLoadingInit(false);
    }
  }, [token, selectedTemaId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const temaMap = useMemo(() => new Map(temas.map((t) => [t._id, t.titulo])), [temas]);
  const selectedRecurso = useMemo(
    () => recursos.find((r) => r._id === selectedRecursoId) ?? null,
    [recursos, selectedRecursoId],
  );

  // Al seleccionar un "Documento a leer" del repositorio, la IA lo analiza con animación
  async function handleSelectDocument(recursoId: string) {
    setSelectedRecursoId(recursoId);
    setSecurityError('');
    setStatusOk('');

    if (!recursoId) {
      setAnalyzedDocTitle('');
      return;
    }

    const doc = recursos.find((r) => r._id === recursoId);
    if (doc?.idTema) {
      setSelectedTemaId(doc.idTema);
    }

    if (!token) return;
    setAnalyzingDoc(true);
    setAnalyzedDocTitle(doc?.titulo || 'documento');

    try {
      const res = await gqlRequest<{
        analizarDocumentoIa: {
          idRecurso: string;
          tituloRecurso: string;
          resumen: string;
          temasClave: string[];
          mensajeBienvenida: string;
        };
      }>(
        `mutation AnalizarDoc($idRecurso: ID!) {
          analizarDocumentoIa(idRecurso: $idRecurso) {
            idRecurso tituloRecurso resumen temasClave mensajeBienvenida
          }
        }`,
        { idRecurso: recursoId },
        token,
      );

      const info = res.analizarDocumentoIa;
      setAnalyzedDocTitle(info.tituloRecurso);
      setMessages((prev) => [
        ...prev,
        {
          id: `doc-ready-${Date.now()}`,
          sender: 'system-ready',
          text: info.mensajeBienvenida || `Ya analicé "${info.tituloRecurso}". Pregunta lo que quieras.`,
          respuestaRecurso: info.resumen,
          temasClave: info.temasClave ?? [],
          sourceLabel: info.tituloRecurso,
        },
      ]);
    } catch (err: any) {
      setSecurityError(toFriendlyError(err, 'No se pudo analizar el documento seleccionado.'));
    } finally {
      setAnalyzingDoc(false);
    }
  }

  async function handleSendQuestion(e: FormEvent) {
    e.preventDefault();
    const trimmed = questionInput.trim();
    const effectiveTemaId = selectedRecurso?.idTema || selectedTemaId;
    if (!trimmed || !effectiveTemaId || !token || asking || analyzingDoc) return;
    try {
      assertNoScriptInjection(trimmed, 'pregunta');
      setSecurityError('');
    } catch (err: any) {
      setSecurityError(toFriendlyError(err));
      return;
    }

    const studentMsg: ChatMsg = { id: `st-${Date.now()}`, sender: 'student', text: trimmed };
    setMessages((prev) => [...prev, studentMsg]);
    setQuestionInput('');
    setAsking(true);

    try {
      const res = await gqlRequest<{
        consultarIa: {
          _id: string;
          respuestaIa: string;
          respuestaRecurso?: string;
          respuestaComplementaria?: string;
          esValida: boolean;
          fuentesCitadas: FuenteCitada[];
        };
      }>(
        `mutation ConsultarIa($idTema: ID!, $prompt: String!, $idRecurso: ID) {
          consultarIa(idTema: $idTema, promptPregunta: $prompt, idRecurso: $idRecurso) {
            _id respuestaIa respuestaRecurso respuestaComplementaria esValida
            fuentesCitadas { tituloRecurso fragmento }
          }
        }`,
        {
          idTema: effectiveTemaId,
          prompt: trimmed,
          ...(selectedRecursoId ? { idRecurso: selectedRecursoId } : {}),
        },
        token,
      );

      const fuentes = res.consultarIa.fuentesCitadas ?? [];
      const aiMsg: ChatMsg = {
        id: res.consultarIa._id,
        sender: 'ai',
        text: res.consultarIa.respuestaIa,
        respuestaRecurso: res.consultarIa.respuestaRecurso || res.consultarIa.respuestaIa,
        respuestaComplementaria: res.consultarIa.respuestaComplementaria || '',
        sourceLabel:
          fuentes.length > 0
            ? `Fuente: ${fuentes[0].tituloRecurso}`
            : selectedRecurso
              ? `Fuente: ${selectedRecurso.titulo}`
              : 'Sin fuentes citadas',
        isTeacherReviewed: res.consultarIa.esValida && fuentes.length > 0,
        rated: null,
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (err: any) {
      setSecurityError(toFriendlyError(err, 'No se pudo consultar al asistente de IA.'));
    } finally {
      setAsking(false);
    }
  }

  async function handleRateAi(consultaId: string, util: boolean) {
    if (!token) return;
    try {
      await gqlRequest(
        `mutation CalificarIA($id: ID!, $util: Boolean!) { calificarRespuestaIa(consultaId: $id, util: $util) { _id } }`,
        { id: consultaId, util },
        token,
      );
      setMessages((prev) => prev.map((m) => (m.id === consultaId ? { ...m, rated: util } : m)));
      setStatusOk(
        util
          ? 'Gracias por valorar la respuesta de IA.'
          : 'Respuesta marcada para revisión y corrección docente.',
      );
    } catch (err: any) {
      setSecurityError(toFriendlyError(err, 'No se pudo calificar la respuesta.'));
    }
  }

  async function submitAiReport(motivo: string) {
    if (!token || !reportTarget) return;
    await gqlRequest(
      `mutation ReportarIA($id: ID!, $motivo: String!) {
        reportarContenido(tipoObjetivo: "IA", idObjetivo: $id, motivo: $motivo) { _id }
      }`,
      { id: reportTarget.id, motivo },
      token,
    );
    await handleRateAi(reportTarget.id, false);
  }

  async function handleGenerateQuiz() {
    const effectiveTemaId = selectedRecurso?.idTema || selectedTemaId;
    if (!effectiveTemaId || !token) {
      setSecurityError('Selecciona un documento o un tema primero para generar el cuestionario.');
      return;
    }
    setSecurityError('');
    setStatusOk('');
    setEvaluationResult(null);
    setShowReview(false);
    setGeneratingQuiz(true);
    try {
      const labelBase =
        selectedRecurso?.titulo ||
        temas.find((t) => t._id === effectiveTemaId)?.titulo ||
        'Práctica';
      const res = await gqlRequest<{ generarCuestionarioIa: CuestionarioItem }>(
        `mutation GenerarCuestionario($idTema: ID!, $cantidad: Int!, $titulo: String, $idRecurso: ID) {
          generarCuestionarioIa(cantidadReactivos: $cantidad, idTema: $idTema, titulo: $titulo, idRecurso: $idRecurso) {
            _id titulo idTema
            reactivos { numero pregunta tipo opciones respuestaCorrecta explicacion }
          }
        }`,
        {
          idTema: effectiveTemaId,
          cantidad: quizCount,
          titulo: `Autoevaluación: ${labelBase}`,
          ...(selectedRecursoId ? { idRecurso: selectedRecursoId } : {}),
        },
        token,
      );
      setActiveQuiz(res.generarCuestionarioIa);
      setAnswers({});
      setCurrentStep(0);
    } catch (err: any) {
      setSecurityError(toFriendlyError(err, 'No se pudo generar el cuestionario.'));
    } finally {
      setGeneratingQuiz(false);
    }
  }

  function handleSelectOption(numero: number, opt: string) {
    if (!activeQuiz || evaluationResult) return;
    setAnswers((prev) => ({ ...prev, [numero]: opt }));

    if (autoAdvanceTimerRef.current) {
      window.clearTimeout(autoAdvanceTimerRef.current);
    }
    // Señala claramente la respuesta seleccionada y avanza suavemente a la siguiente pregunta
    if (currentStep < activeQuiz.reactivos.length - 1) {
      autoAdvanceTimerRef.current = window.setTimeout(() => {
        setCurrentStep((step) =>
          activeQuiz && step < activeQuiz.reactivos.length - 1 ? step + 1 : step,
        );
      }, 380);
    }
  }

  async function handleGradeQuiz() {
    if (!activeQuiz || !token || gradingQuiz) return;
    const ordered = activeQuiz.reactivos.map((r) => (answers[r.numero] ?? '').trim());
    try {
      assertNoScriptInjection(ordered, 'respuestas');
      setSecurityError('');
      setGradingQuiz(true);
      const res = await gqlRequest<{ responderCuestionario: IntentoItem }>(
        `mutation ResponderCuestionario($id: ID!, $respuestas: [String!]!) {
          responderCuestionario(cuestionarioId: $id, respuestas: $respuestas) {
            _id idTema tituloCuestionario aciertos calificacion totalReactivos
            retroalimentacion conceptosPorReforzar createdAt
            recursosRecomendados { idRecurso titulo motivo archivoUrl }
          }
        }`,
        { id: activeQuiz._id, respuestas: ordered },
        token,
      );
      const intento = res.responderCuestionario;
      setEvaluationResult(intento);
      setHistorial((prev) => [
        intento,
        ...prev.filter((item) => item._id !== intento._id),
      ]);
      setStatusOk('Autoevaluación calificada y guardada en tu historial.');
    } catch (err: any) {
      setSecurityError(toFriendlyError(err, 'No se pudo calificar el cuestionario.'));
    } finally {
      setGradingQuiz(false);
    }
  }

  function handleExportHistoryCsv() {
    downloadCsv(
      `kolab-historial-autoevaluaciones-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Fecha', 'Cuestionario / Tema', 'Aciertos', 'Total', 'Calificación (%)', 'Conceptos por reforzar', 'Recursos recomendados'],
      historial.map((h) => [
        new Date(h.createdAt).toLocaleDateString('es-MX'),
        h.tituloCuestionario || temaMap.get(h.idTema) || h.idTema,
        h.aciertos,
        h.totalReactivos,
        Math.round(h.calificacion),
        (h.conceptosPorReforzar || []).join(' | ') || 'Ninguno',
        (h.recursosRecomendados || []).map((r) => r.titulo).join(' | ') || 'Ninguno',
      ]),
    );
  }

  function handleExportHistoryPdf() {
    const rows = historial
      .map(
        (h) => `<tr>
          <td>${new Date(h.createdAt).toLocaleDateString('es-MX')}</td>
          <td>${escapeHtml(h.tituloCuestionario || temaMap.get(h.idTema) || h.idTema)}</td>
          <td>${h.aciertos}/${h.totalReactivos}</td>
          <td><strong>${Math.round(h.calificacion)}%</strong></td>
          <td>${escapeHtml((h.conceptosPorReforzar || []).join(', ') || '—')}</td>
        </tr>`,
      )
      .join('');
    exportHtmlToPdf(
      'Historial de Autoevaluaciones',
      `<table><thead><tr><th>Fecha</th><th>Cuestionario / Tema</th><th>Aciertos</th><th>Calificación</th><th>Conceptos a reforzar</th></tr></thead><tbody>${rows}</tbody></table>`,
    );
  }

  const totalReactivos = activeQuiz?.reactivos.length ?? 0;
  const currentReactivo = activeQuiz ? activeQuiz.reactivos[currentStep] : null;
  const answeredCount = useMemo(() => {
    if (!activeQuiz) return 0;
    return activeQuiz.reactivos.filter((r) => (answers[r.numero] ?? '').trim().length > 0).length;
  }, [activeQuiz, answers]);
  const answeredPct = totalReactivos > 0 ? Math.round((answeredCount / totalReactivos) * 100) : 0;

  return (
    <div className="kolab-module module5-page">
      <section className="module-banner banner-indigo" aria-label="Asistente con IA y autoevaluación">
        <div className="banner-content">
          <h1 className="banner-title">Asistente con IA y autoevaluación</h1>
          <p className="banner-subtitle">
            Selecciona un documento del repositorio de conocimientos, haz preguntas y practica paso a paso
          </p>
        </div>
      </section>

      {securityError && <p className="form-error" role="alert">{securityError}</p>}
      {statusOk && <p className="form-ok" role="status">{statusOk}</p>}

      <div className="module5-grid">
        {/* ==================== TARJETA 1: ASISTENTE ACADÉMICO ==================== */}
        <section className="kolab-card assistant-card" aria-label="Asistente académico">
          <header className="card-header-row">
            <h2 className="card-title inline-icon-row">
              <Bot size={20} aria-hidden="true" />
              <span>Asistente académico</span>
            </h2>
            {selectedRecurso && !analyzingDoc && (
              <span className="chip chip--soft">
                <FileText size={13} aria-hidden="true" /> Leyendo: {selectedRecurso.titulo}
              </span>
            )}
          </header>

          {/* Campo: Documento a leer (del Repositorio de conocimientos) */}
          <div className="ai-doc-selector-bar">
            <div className="field" style={{ flex: 2, minWidth: 210 }}>
              <label htmlFor="ai-doc-select" className="inline-icon-row">
                <BookOpen size={14} aria-hidden="true" />
                <span>Documento a leer</span>
              </label>
              {loadingInit && recursos.length === 0 ? (
                <Skeleton width="100%" height="40px" />
              ) : (
                <select
                  id="ai-doc-select"
                  className="duel-select"
                  value={selectedRecursoId}
                  onChange={(e) => handleSelectDocument(e.target.value)}
                  disabled={analyzingDoc}
                >
                  <option value="">Selecciona un documento del repositorio…</option>
                  {recursos.map((r) => (
                    <option key={r._id} value={r._id}>
                      {r.titulo} ({r.tipoArchivo.replace('application/', '').replace('image/', '').toUpperCase()})
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="field" style={{ flex: 1, minWidth: 160 }}>
              <label htmlFor="ai-tema-select">Tema</label>
              {loadingInit && temas.length === 0 ? (
                <Skeleton width="100%" height="40px" />
              ) : (
                <select
                  id="ai-tema-select"
                  className="duel-select"
                  value={selectedTemaId}
                  onChange={(e) => setSelectedTemaId(e.target.value)}
                  disabled={analyzingDoc}
                >
                  {temas.length === 0 && <option value="">Sin temas disponibles</option>}
                  {temas.map((t) => (
                    <option key={t._id} value={t._id}>{t.titulo}</option>
                  ))}
                </select>
              )}
            </div>
          </div>

          <div className="chat-feed">
            {analyzingDoc && (
              <div className="ai-analyzing-card" role="status" aria-live="polite">
                <div className="ai-analyzing-visual">
                  <div className="ai-analyzing-ring" aria-hidden="true" />
                  <FileSearch size={26} className="ai-analyzing-icon" aria-hidden="true" />
                </div>
                <div className="ai-analyzing-body">
                  <strong>Analizando documento…</strong>
                  <p className="muted" style={{ fontSize: '0.84rem', margin: 0 }}>
                    La IA está leyendo «{analyzedDocTitle}» para responder con precisión a tus preguntas.
                  </p>
                  <div className="ai-analyzing-bar" aria-hidden="true">
                    <div className="ai-analyzing-bar__fill" />
                  </div>
                </div>
              </div>
            )}

            {messages.length === 0 && !analyzingDoc ? (
              <p className="empty">
                {recursos.length === 0
                  ? 'Aún no hay documentos en el repositorio. Sube un recurso o elige un tema para consultar a la IA.'
                  : 'Elige un documento en «Documento a leer» arriba para que la IA lo analice y puedas preguntarle lo que quieras.'}
              </p>
            ) : (
              messages.map((msg) => {
                if (msg.sender === 'student') {
                  return (
                    <div key={msg.id} className="chat-row chat-row-student">
                      <div className="bubble-student">{msg.text}</div>
                    </div>
                  );
                }

                if (msg.sender === 'system-ready') {
                  return (
                    <div key={msg.id} className="chat-row chat-row-ai">
                      <div className="ai-avatar" aria-hidden="true">IA</div>
                      <div className="ai-bubble-group">
                        <div className="ai-ready-card">
                          <div className="ai-ready-head">
                            <CheckCircle2 size={17} aria-hidden="true" />
                            <strong>{msg.text}</strong>
                          </div>
                          {msg.respuestaRecurso && (
                            <p className="ai-ready-summary">{msg.respuestaRecurso}</p>
                          )}
                          {msg.temasClave && msg.temasClave.length > 0 && (
                            <div className="td-tags" style={{ marginTop: 6 }}>
                              {msg.temasClave.map((k, idx) => (
                                <span key={idx} className="td-tag">{k}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={msg.id} className="chat-row chat-row-ai">
                    <div className="ai-avatar" aria-hidden="true">IA</div>
                    <div className="ai-bubble-group">
                      <div className="ai-dual-response">
                        {/* Bloque 1: Respuesta del recurso */}
                        <div className="ai-block ai-block--resource">
                          <div className="ai-block__head">
                            <FileText size={15} aria-hidden="true" />
                            <span>Respuesta del recurso</span>
                          </div>
                          <p className="bubble-ai-text">{msg.respuestaRecurso || msg.text}</p>
                          {msg.sourceLabel && (
                            <span className={`source-badge ${msg.isTeacherReviewed ? 'is-reviewed' : 'is-unreviewed'}`}>
                              {msg.sourceLabel}
                            </span>
                          )}
                        </div>

                        {/* Bloque 2: Respuesta de la IA */}
                        {msg.respuestaComplementaria && (
                          <div className="ai-block ai-block--ai">
                            <div className="ai-block__head">
                              <Sparkles size={15} aria-hidden="true" />
                              <span>Respuesta de la IA</span>
                            </div>
                            <p className="bubble-ai-text">{msg.respuestaComplementaria}</p>
                          </div>
                        )}
                      </div>

                      <div className="row" style={{ marginTop: 6 }}>
                        <button
                          type="button"
                          className={`btn btn--sm ${msg.rated === true ? 'btn--primary' : 'btn--ghost'}`}
                          onClick={() => handleRateAi(msg.id, true)}
                        >
                          <ThumbsUp size={14} aria-hidden="true" />
                          <span>Útil</span>
                        </button>
                        <button
                          type="button"
                          className={`btn btn--sm ${msg.rated === false ? 'btn--danger' : 'btn--ghost'}`}
                          onClick={() => handleRateAi(msg.id, false)}
                        >
                          <ThumbsDown size={14} aria-hidden="true" />
                          <span>No útil</span>
                        </button>
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          onClick={() => setReportTarget({ id: msg.id, preview: msg.text })}
                        >
                          <Flag size={14} aria-hidden="true" />
                          <span>Reportar</span>
                        </button>
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          onClick={() =>
                            exportHtmlToPdf(
                              `Resumen IA · ${selectedRecurso?.titulo || temaMap.get(selectedTemaId) || 'Tema'}`,
                              `<div class="card">
                                <h3>Respuesta del recurso</h3>
                                <p>${escapeHtml(msg.respuestaRecurso || msg.text).replace(/\n/g, '<br/>')}</p>
                                ${msg.respuestaComplementaria ? `<h3>Respuesta de la IA</h3><p>${escapeHtml(msg.respuestaComplementaria).replace(/\n/g, '<br/>')}</p>` : ''}
                                <p><em>${escapeHtml(msg.sourceLabel || '')}</em></p>
                              </div>`,
                            )
                          }
                        >
                          <FileDown size={14} aria-hidden="true" />
                          <span>PDF</span>
                        </button>
                      </div>
                      <p className="ai-disclaimer">Contenido generado por IA: no sustituye la validación docente oficial.</p>
                    </div>
                  </div>
                );
              })
            )}

            {asking && (
              <div className="chat-row chat-row-ai">
                <div className="ai-avatar" aria-hidden="true">IA</div>
                <div className="ai-analyzing-card ai-analyzing-card--compact" role="status">
                  <Sparkles size={16} className="ai-analyzing-icon" aria-hidden="true" />
                  <span>Consultando el recurso y preparando respuesta…</span>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <form className="chat-composer" onSubmit={handleSendQuestion}>
            <input
              type="text"
              className="composer-input"
              value={questionInput}
              onChange={(e) => setQuestionInput(e.target.value)}
              placeholder={
                selectedRecurso
                  ? `Pregunta lo que quieras sobre "${selectedRecurso.titulo}"…`
                  : 'Escribe tu pregunta…'
              }
              aria-label="Escribe tu pregunta"
              disabled={(!selectedTemaId && !selectedRecursoId) || asking || analyzingDoc}
            />
            <div className="composer-actions">
              <button
                type="submit"
                className="btn-indigo inline-icon-row"
                disabled={(!selectedTemaId && !selectedRecursoId) || asking || analyzingDoc || !questionInput.trim()}
              >
                <Send size={15} aria-hidden="true" />
                <span>{asking ? 'Consultando…' : 'Enviar'}</span>
              </button>
            </div>
          </form>
        </section>

        {/* ==================== TARJETA 2: AUTOEVALUACIÓN PASO A PASO ==================== */}
        <section className="kolab-card quiz-card" aria-label="Autoevaluación">
          <header className="card-header-row quiz-header-row">
            <div>
              <h2 className="card-title">Autoevaluación</h2>
              {activeQuiz && (
                <p className="muted" style={{ fontSize: '0.82rem', margin: '2px 0 0' }}>
                  {activeQuiz.titulo}
                </p>
              )}
            </div>

            {/* Los 2 controles movidos del banner superior a la sección de Autoevaluación */}
            <div className="quiz-toolbar-actions">
              <select
                className="duel-select"
                value={quizCount}
                onChange={(e) => setQuizCount(Number(e.target.value))}
                aria-label="Número de reactivos"
                disabled={generatingQuiz}
              >
                <option value={3}>3 reactivos</option>
                <option value={5}>5 reactivos</option>
                <option value={10}>10 reactivos</option>
                <option value={15}>15 reactivos</option>
              </select>
              <button
                type="button"
                className="btn btn--primary btn--sm"
                onClick={handleGenerateQuiz}
                disabled={generatingQuiz || (!selectedTemaId && !selectedRecursoId)}
              >
                <Sparkles size={14} aria-hidden="true" />
                <span>{generatingQuiz ? 'Generando…' : 'Nuevo cuestionario'}</span>
              </button>
            </div>
          </header>

          {generatingQuiz ? (
            <div className="ai-analyzing-card" role="status">
              <div className="ai-analyzing-visual">
                <div className="ai-analyzing-ring" aria-hidden="true" />
                <Sparkles size={24} className="ai-analyzing-icon" aria-hidden="true" />
              </div>
              <div className="ai-analyzing-body">
                <strong>Generando tu cuestionario…</strong>
                <p className="muted" style={{ fontSize: '0.84rem', margin: 0 }}>
                  Preparando {quizCount} reactivos con base en {selectedRecurso ? `«${selectedRecurso.titulo}»` : 'el tema seleccionado'}.
                </p>
                <div className="ai-analyzing-bar" aria-hidden="true">
                  <div className="ai-analyzing-bar__fill" />
                </div>
              </div>
            </div>
          ) : !activeQuiz ? (
            <p className="empty">
              Aún no hay un cuestionario activo. Elige la cantidad de reactivos arriba y pulsa «Nuevo cuestionario» para practicar pregunta por pregunta.
            </p>
          ) : evaluationResult ? (
            /* ==================== RESULTADO Y RETROALIMENTACIÓN DE LA IA ==================== */
            <div className="quiz-result-panel">
              <div className={`quiz-feedback ${evaluationResult.calificacion >= 60 ? 'is-good' : 'is-warn'}`}>
                <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
                  <strong style={{ fontSize: '1.05rem' }}>
                    Calificación: {Math.round(evaluationResult.calificacion)}%
                  </strong>
                  <span className="chip chip--solid">
                    {evaluationResult.aciertos}/{evaluationResult.totalReactivos} aciertos
                  </span>
                </div>
                <p style={{ margin: 0, lineHeight: 1.5, fontWeight: 600 }}>
                  {evaluationResult.retroalimentacion}
                </p>
              </div>

              {evaluationResult.conceptosPorReforzar?.length > 0 && (
                <div className="quiz-result-section">
                  <strong className="quiz-result-label">Conceptos por reforzar</strong>
                  <div className="td-tags">
                    {evaluationResult.conceptosPorReforzar.map((c, idx) => (
                      <span key={idx} className="td-tag">{c}</span>
                    ))}
                  </div>
                </div>
              )}

              {evaluationResult.recursosRecomendados && evaluationResult.recursosRecomendados.length > 0 && (
                <div className="quiz-result-section">
                  <strong className="quiz-result-label inline-icon-row">
                    <BookOpen size={15} aria-hidden="true" />
                    <span>Recursos recomendados por la IA</span>
                  </strong>
                  <div className="quiz-rec-list">
                    {evaluationResult.recursosRecomendados.map((rec) => {
                      const hasUrl = Boolean(rec.archivoUrl && !rec.archivoUrl.includes('kolab.local'));
                      return (
                        <div key={rec.idRecurso} className="quiz-rec-card">
                          <div className="quiz-rec-card__info">
                            <strong>{rec.titulo}</strong>
                            <p className="muted" style={{ fontSize: '0.82rem', margin: '2px 0 0' }}>
                              {rec.motivo}
                            </p>
                          </div>
                          <div className="row">
                            <button
                              type="button"
                              className="btn btn--ghost btn--sm"
                              onClick={() => handleSelectDocument(rec.idRecurso)}
                            >
                              <FileSearch size={13} aria-hidden="true" />
                              <span>Leer con IA</span>
                            </button>
                            {hasUrl && (
                              <a
                                href={rec.archivoUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="btn btn--primary btn--sm"
                              >
                                <ExternalLink size={13} aria-hidden="true" />
                                <span>Abrir</span>
                              </a>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="row" style={{ justifyContent: 'space-between' }}>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => setShowReview((v) => !v)}
                >
                  {showReview ? 'Ocultar revisión' : 'Revisar mis respuestas'}
                </button>
                <button
                  type="button"
                  className="btn btn--primary btn--sm"
                  onClick={handleGenerateQuiz}
                >
                  <Sparkles size={14} aria-hidden="true" />
                  <span>Practicar otra vez</span>
                </button>
              </div>

              {showReview && (
                <div className="quiz-review-list">
                  {activeQuiz.reactivos.map((r) => {
                    const userAns = (answers[r.numero] ?? '').trim() || 'Sin responder';
                    const isRight =
                      userAns.toLowerCase() === (r.respuestaCorrecta || '').trim().toLowerCase();
                    return (
                      <div key={r.numero} className={`quiz-review-item ${isRight ? 'is-right' : 'is-wrong'}`}>
                        <strong>{r.numero}. {r.pregunta}</strong>
                        <p style={{ margin: '4px 0 2px', fontSize: '0.84rem' }}>
                          Tu respuesta: <strong>{userAns}</strong>
                        </p>
                        {!isRight && (
                          <p style={{ margin: '0 0 2px', fontSize: '0.84rem' }}>
                            Respuesta esperada: <strong>{r.respuestaCorrecta}</strong>
                          </p>
                        )}
                        <p className="muted" style={{ margin: 0, fontSize: '0.8rem' }}>{r.explicacion}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            /* ==================== WIZARD 1 PREGUNTA A LA VEZ ==================== */
            <div className="quiz-wizard">
              <div className="quiz-progress-box">
                <div className="quiz-progress-head">
                  <span>
                    Pregunta <strong>{currentStep + 1}</strong> de <strong>{totalReactivos}</strong>
                  </span>
                  <span className="quiz-answered-pill">
                    Contestadas: <strong>{answeredCount}/{totalReactivos}</strong> ({answeredPct}%)
                  </span>
                </div>
                <div className="quiz-progress-track" role="progressbar" aria-valuenow={answeredPct} aria-valuemin={0} aria-valuemax={100}>
                  <div className="quiz-progress-fill" style={{ width: `${answeredPct}%` }} />
                </div>
                <div className="quiz-steps-row" aria-label="Navegación de preguntas">
                  {activeQuiz.reactivos.map((r, idx) => {
                    const isAnswered = (answers[r.numero] ?? '').trim().length > 0;
                    const isCurrent = idx === currentStep;
                    return (
                      <button
                        key={r.numero}
                        type="button"
                        className={`quiz-step-dot ${isCurrent ? 'is-current' : ''} ${isAnswered ? 'is-answered' : ''}`}
                        onClick={() => setCurrentStep(idx)}
                        title={`Pregunta ${idx + 1}${isAnswered ? ' (contestada)' : ''}`}
                      >
                        {isAnswered && !isCurrent ? <Check size={12} aria-hidden="true" /> : idx + 1}
                      </button>
                    );
                  })}
                </div>
              </div>

              {currentReactivo && (
                <div className="quiz-block quiz-block--single" key={currentReactivo.numero}>
                  <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
                    <span className="chip chip--soft">
                      Pregunta {currentStep + 1} · {currentReactivo.opciones?.length > 0 ? 'Opción múltiple' : 'Abierta'}
                    </span>
                    {(answers[currentReactivo.numero] ?? '').trim() && (
                      <span className="chip chip--solid">
                        <CheckCircle2 size={12} aria-hidden="true" /> Contestada
                      </span>
                    )}
                  </div>

                  <p className="quiz-question-prompt quiz-question-prompt--lg">{currentReactivo.pregunta}</p>

                  {currentReactivo.opciones && currentReactivo.opciones.length > 0 ? (
                    <div className="mc-options">
                      {currentReactivo.opciones.map((opt, optIdx) => {
                        const isSelected = answers[currentReactivo.numero] === opt;
                        const letter = String.fromCharCode(65 + optIdx);
                        return (
                          <button
                            key={opt}
                            type="button"
                            className={`mc-option ${isSelected ? 'is-selected' : ''}`}
                            onClick={() => handleSelectOption(currentReactivo.numero, opt)}
                            aria-pressed={isSelected}
                          >
                            <span className="mc-option__indicator" aria-hidden="true">
                              {isSelected ? <Check size={14} /> : letter}
                            </span>
                            <span className="mc-option__text">{opt}</span>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <textarea
                      className="open-answer-input"
                      rows={4}
                      value={answers[currentReactivo.numero] ?? ''}
                      onChange={(e) =>
                        setAnswers((prev) => ({
                          ...prev,
                          [currentReactivo.numero]: e.target.value,
                        }))
                      }
                      placeholder="Escribe tu respuesta aquí…"
                    />
                  )}
                </div>
              )}

              {gradingQuiz && (
                <div className="ai-analyzing-card ai-analyzing-card--compact" role="status">
                  <Sparkles size={16} className="ai-analyzing-icon" aria-hidden="true" />
                  <span>La IA está analizando tus respuestas y preparando tus recomendaciones…</span>
                </div>
              )}

              <div className="quiz-nav-footer">
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => setCurrentStep((s) => Math.max(0, s - 1))}
                  disabled={currentStep === 0 || gradingQuiz}
                >
                  <ChevronLeft size={15} aria-hidden="true" />
                  <span>Anterior</span>
                </button>

                {currentStep < totalReactivos - 1 ? (
                  <button
                    type="button"
                    className="btn btn--primary btn--sm"
                    onClick={() => setCurrentStep((s) => Math.min(totalReactivos - 1, s + 1))}
                    disabled={gradingQuiz}
                  >
                    <span>Siguiente</span>
                    <ChevronRight size={15} aria-hidden="true" />
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn--primary btn--sm"
                    onClick={handleGradeQuiz}
                    disabled={gradingQuiz || answeredCount === 0}
                  >
                    <CheckCircle2 size={15} aria-hidden="true" />
                    <span>{gradingQuiz ? 'Analizando con IA…' : 'Calificar cuestionario'}</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </section>
      </div>

      {/* ==================== TARJETA 3: HISTORIAL DE AUTOEVALUACIONES ==================== */}
      <section className="kolab-card" aria-label="Historial de autoevaluaciones">
        <header className="card-header-row">
          <h2 className="card-title inline-icon-row">
            <History size={20} aria-hidden="true" />
            <span>Mi historial de autoevaluaciones</span>
          </h2>
          <div className="row">
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={handleExportHistoryCsv}
              disabled={historial.length === 0}
            >
              <FileDown size={14} aria-hidden="true" />
              <span>Descargar CSV</span>
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={handleExportHistoryPdf}
              disabled={historial.length === 0}
            >
              <FileDown size={14} aria-hidden="true" />
              <span>Exportar PDF</span>
            </button>
          </div>
        </header>
        {loadingInit ? (
          <RowListSkeleton count={3} />
        ) : historial.length === 0 ? (
          <p className="empty">Aún no has completado cuestionarios de autoevaluación.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Cuestionario / Tema</th>
                  <th>Aciertos</th>
                  <th>Calificación</th>
                  <th>Conceptos a reforzar</th>
                  <th>Recursos recomendados</th>
                </tr>
              </thead>
              <tbody>
                {historial.map((h) => (
                  <tr key={h._id}>
                    <td>
                      {new Date(h.createdAt).toLocaleString('es-MX', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td>{h.tituloCuestionario || temaMap.get(h.idTema) || 'Tema'}</td>
                    <td>{h.aciertos}/{h.totalReactivos}</td>
                    <td>
                      <span className={`chip ${h.calificacion >= 70 ? 'chip--soft' : 'chip--xp'}`}>
                        {Math.round(h.calificacion)}%
                      </span>
                    </td>
                    <td>{h.conceptosPorReforzar?.join(', ') || 'Sin pendientes'}</td>
                    <td>
                      {h.recursosRecomendados && h.recursosRecomendados.length > 0
                        ? h.recursosRecomendados.map((r) => r.titulo).join(', ')
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ReportModal
        open={Boolean(reportTarget)}
        targetLabel="Respuesta del Asistente IA"
        targetPreview={reportTarget?.preview}
        onClose={() => setReportTarget(null)}
        onSubmit={submitAiReport}
      />
    </div>
  );
}
