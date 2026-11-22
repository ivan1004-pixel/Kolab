import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { FileDown, Flag, ThumbsDown, ThumbsUp } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { USE_MOCK, gqlRequest } from '../services/api';
import { assertNoScriptInjection } from '../utils/inputSecurity';
import { downloadCsv, escapeHtml, exportHtmlToPdf } from '../utils/exportUtils';
import ReportModal from '../components/ReportModal';
import Skeleton, { RowListSkeleton } from '../components/Skeleton';

interface TemaItem {
  _id: string;
  titulo: string;
}

interface FuenteCitada {
  tituloRecurso: string;
  fragmento: string;
}

interface ChatMsg {
  id: string;
  sender: 'student' | 'ai';
  text: string;
  sourceLabel?: string;
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
  aciertos: number;
  totalReactivos: number;
  calificacion: number;
  retroalimentacion: string;
  conceptosPorReforzar: string[];
  createdAt: string;
}

export default function Asistente() {
  const { token } = useAuth();
  const [temas, setTemas] = useState<TemaItem[]>([]);
  const [historial, setHistorial] = useState<IntentoItem[]>([]);
  const [loadingTemas, setLoadingTemas] = useState(!USE_MOCK && Boolean(token));
  const [selectedTemaId, setSelectedTemaId] = useState('');
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [questionInput, setQuestionInput] = useState('');
  const [asking, setAsking] = useState(false);
  const [securityError, setSecurityError] = useState('');
  const [statusOk, setStatusOk] = useState('');
  const [reportTarget, setReportTarget] = useState<{ id: string; preview: string } | null>(null);

  const [quizCount, setQuizCount] = useState(5);
  const [activeQuiz, setActiveQuiz] = useState<CuestionarioItem | null>(null);
  const [generatingQuiz, setGeneratingQuiz] = useState(false);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [evaluationFeedback, setEvaluationFeedback] = useState<{
    ok: boolean;
    message: string;
    conceptos?: string[];
  } | null>(null);

  const loadTemas = useCallback(async () => {
    if (USE_MOCK || !token) {
      setLoadingTemas(false);
      return;
    }
    setLoadingTemas(true);
    try {
      const data = await gqlRequest<{
        temas: TemaItem[];
        miHistorialCuestionarios: IntentoItem[];
      }>(
        `query AsistenteInit {
          temas { _id titulo }
          miHistorialCuestionarios {
            _id idTema aciertos totalReactivos calificacion retroalimentacion conceptosPorReforzar createdAt
          }
        }`,
        {},
        token,
      );
      const list = data.temas ?? [];
      setTemas(list);
      setHistorial(data.miHistorialCuestionarios ?? []);
      if (list.length > 0 && !selectedTemaId) {
        setSelectedTemaId(list[0]._id);
      }
    } catch (err: any) {
      setSecurityError(err.message || 'No se pudieron cargar los temas disponibles.');
    } finally {
      setLoadingTemas(false);
    }
  }, [token, selectedTemaId]);

  useEffect(() => {
    loadTemas();
  }, [loadTemas]);

  const temaMap = useMemo(() => new Map(temas.map((t) => [t._id, t.titulo])), [temas]);

  async function handleSendQuestion(e: FormEvent) {
    e.preventDefault();
    const trimmed = questionInput.trim();
    if (!trimmed || !selectedTemaId || !token) return;
    try {
      assertNoScriptInjection(trimmed, 'pregunta');
      setSecurityError('');
    } catch (err: any) {
      setSecurityError(err.message);
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
          esValida: boolean;
          fuentesCitadas: FuenteCitada[];
        };
      }>(
        `mutation ConsultarIa($idTema: ID!, $prompt: String!) {
          consultarIa(idTema: $idTema, promptPregunta: $prompt) {
            _id respuestaIa esValida fuentesCitadas { tituloRecurso fragmento }
          }
        }`,
        { idTema: selectedTemaId, prompt: trimmed },
        token,
      );
      const fuentes = res.consultarIa.fuentesCitadas ?? [];
      const aiMsg: ChatMsg = {
        id: res.consultarIa._id,
        sender: 'ai',
        text: res.consultarIa.respuestaIa,
        sourceLabel: fuentes.length > 0 ? `Fuente: ${fuentes[0].tituloRecurso} — "${fuentes[0].fragmento.slice(0, 80)}…"` : 'Sin fuentes citadas',
        isTeacherReviewed: res.consultarIa.esValida && fuentes.length > 0,
        rated: null,
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (err: any) {
      setSecurityError(err.message || 'No se pudo consultar al asistente de IA.');
    } finally {
      setAsking(false);
    }
  }

  // RF-73: Calificar respuesta de IA (útil / no útil)
  async function handleRateAi(consultaId: string, util: boolean) {
    if (!token) return;
    try {
      await gqlRequest(
        `mutation CalificarIA($id: ID!, $util: Boolean!) { calificarRespuestaIa(consultaId: $id, util: $util) { _id } }`,
        { id: consultaId, util },
        token,
      );
      setMessages((prev) => prev.map((m) => (m.id === consultaId ? { ...m, rated: util } : m)));
      setStatusOk(util ? 'Gracias por valorar la respuesta de IA.' : 'Respuesta marcada para revisión y corrección docente (RF-74).');
    } catch (err: any) {
      setSecurityError(err.message || 'No se pudo calificar la respuesta.');
    }
  }

  async function submitAiReport(motivo: string) {
    if (!token || !reportTarget) return;
    await gqlRequest(
      `mutation ReportarIA($id: ID!, $motivo: String!) {
        reportarContenido(tipoObjetivo: "ConsultaIa", idObjetivo: $id, motivo: $motivo) { _id }
      }`,
      { id: reportTarget.id, motivo },
      token,
    );
    await handleRateAi(reportTarget.id, false);
  }

  async function handleGenerateQuiz() {
    if (!selectedTemaId || !token) {
      setSecurityError('Selecciona un tema primero para generar el cuestionario.');
      return;
    }
    setSecurityError('');
    setEvaluationFeedback(null);
    setGeneratingQuiz(true);
    try {
      const temaNombre = temas.find((t) => t._id === selectedTemaId)?.titulo || 'Práctica';
      const res = await gqlRequest<{ generarCuestionarioIa: CuestionarioItem }>(
        `mutation GenerarCuestionario($idTema: ID!, $cantidad: Int!, $titulo: String) {
          generarCuestionarioIa(cantidadReactivos: $cantidad, idTema: $idTema, titulo: $titulo) {
            _id titulo idTema
            reactivos { numero pregunta tipo opciones respuestaCorrecta explicacion }
          }
        }`,
        { idTema: selectedTemaId, cantidad: quizCount, titulo: `Autoevaluación: ${temaNombre}` },
        token,
      );
      setActiveQuiz(res.generarCuestionarioIa);
      setAnswers({});
    } catch (err: any) {
      setSecurityError(err.message || 'No se pudo generar el cuestionario.');
    } finally {
      setGeneratingQuiz(false);
    }
  }

  async function handleGradeQuiz() {
    if (!activeQuiz || !token) return;
    const ordered = activeQuiz.reactivos.map((r) => (answers[r.numero] ?? '').trim());
    try {
      assertNoScriptInjection(ordered, 'respuestas');
      setSecurityError('');
      const res = await gqlRequest<{ responderCuestionario: IntentoItem }>(
        `mutation ResponderCuestionario($id: ID!, $respuestas: [String!]!) {
          responderCuestionario(cuestionarioId: $id, respuestas: $respuestas) {
            _id idTema aciertos calificacion totalReactivos retroalimentacion conceptosPorReforzar createdAt
          }
        }`,
        { id: activeQuiz._id, respuestas: ordered },
        token,
      );
      const r = res.responderCuestionario;
      setEvaluationFeedback({
        ok: r.calificacion >= 60,
        message: `Calificación: ${Math.round(r.calificacion)}% (${r.aciertos}/${r.totalReactivos} aciertos). ${r.retroalimentacion}`,
        conceptos: r.conceptosPorReforzar,
      });
      setHistorial((prev) => [r, ...prev]);
    } catch (err: any) {
      setSecurityError(err.message || 'No se pudo calificar el cuestionario.');
    }
  }

  // RF-81: Descargar historial de autoevaluaciones
  function handleExportHistoryCsv() {
    downloadCsv(
      `kolab-historial-autoevaluaciones-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Fecha', 'Tema', 'Aciertos', 'Total', 'Calificación (%)', 'Conceptos por reforzar'],
      historial.map((h) => [
        new Date(h.createdAt).toLocaleDateString('es-MX'),
        temaMap.get(h.idTema) || h.idTema,
        h.aciertos,
        h.totalReactivos,
        Math.round(h.calificacion),
        (h.conceptosPorReforzar || []).join(' | ') || 'Ninguno',
      ]),
    );
  }

  function handleExportHistoryPdf() {
    const rows = historial
      .map(
        (h) => `<tr>
          <td>${new Date(h.createdAt).toLocaleDateString('es-MX')}</td>
          <td>${escapeHtml(temaMap.get(h.idTema) || h.idTema)}</td>
          <td>${h.aciertos}/${h.totalReactivos}</td>
          <td><strong>${Math.round(h.calificacion)}%</strong></td>
          <td>${escapeHtml((h.conceptosPorReforzar || []).join(', ') || '—')}</td>
        </tr>`,
      )
      .join('');
    exportHtmlToPdf(
      'Historial de Autoevaluaciones',
      `<table><thead><tr><th>Fecha</th><th>Tema</th><th>Aciertos</th><th>Calificación</th><th>Conceptos a reforzar</th></tr></thead><tbody>${rows}</tbody></table>`,
    );
  }

  return (
    <div className="kolab-module module5-page">
      <section className="module-banner banner-indigo" aria-label="Módulo 5">
        <div className="banner-content">
          <span className="banner-eyebrow">MÓDULO 5 · LÍMITE 10 CONSULTAS/DÍA</span>
          <h1 className="banner-title">Asistente con IA (RAG) y autoevaluación</h1>
          <p className="banner-subtitle">Respuestas basadas únicamente en los materiales autorizados de tu escuela</p>
        </div>

        <div className="row">
          <select
            className="duel-select"
            value={quizCount}
            onChange={(e) => setQuizCount(Number(e.target.value))}
            aria-label="Número de reactivos"
            style={{ width: 'auto' }}
          >
            <option value={3}>3 reactivos</option>
            <option value={5}>5 reactivos</option>
            <option value={10}>10 reactivos</option>
            <option value={15}>15 reactivos</option>
          </select>
          <button
            type="button"
            className="btn-banner-action"
            onClick={handleGenerateQuiz}
            disabled={generatingQuiz || !selectedTemaId}
          >
            {generatingQuiz ? 'Generando…' : 'Nuevo cuestionario'}
          </button>
        </div>
      </section>

      {securityError && <p className="form-error" role="alert">{securityError}</p>}
      {statusOk && <p className="form-ok" role="status">{statusOk}</p>}

      <div className="module5-grid">
        <section className="kolab-card assistant-card" aria-label="Asistente académico">
          <header className="card-header-row">
            <h2 className="card-title">Asistente académico</h2>
            {loadingTemas && temas.length === 0 ? (
              <Skeleton width="200px" height="38px" />
            ) : (
              <select
                className="duel-select"
                style={{ maxWidth: 220 }}
                value={selectedTemaId}
                onChange={(e) => setSelectedTemaId(e.target.value)}
                aria-label="Tema de consulta"
              >
                {temas.length === 0 && <option value="">Sin temas disponibles</option>}
                {temas.map((t) => (
                  <option key={t._id} value={t._id}>{t.titulo}</option>
                ))}
              </select>
            )}
          </header>

          <div className="chat-feed">
            {messages.length === 0 ? (
              <p className="empty">
                {temas.length === 0
                  ? 'Aún no hay temas registrados para consultar con la IA.'
                  : 'Haz una pregunta sobre el tema seleccionado para recibir ayuda basada en material autorizado.'}
              </p>
            ) : (
              messages.map((msg) =>
                msg.sender === 'student' ? (
                  <div key={msg.id} className="chat-row chat-row-student">
                    <div className="bubble-student">{msg.text}</div>
                  </div>
                ) : (
                  <div key={msg.id} className="chat-row chat-row-ai">
                    <div className="ai-avatar" aria-hidden="true">IA</div>
                    <div className="ai-bubble-group">
                      <div className="bubble-ai">
                        <p className="bubble-ai-text">{msg.text}</p>
                        {msg.sourceLabel && (
                          <span className={`source-badge ${msg.isTeacherReviewed ? 'is-reviewed' : 'is-unreviewed'}`}>
                            {msg.sourceLabel}
                          </span>
                        )}
                      </div>
                      <div className="row" style={{ marginTop: 4 }}>
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
                              `Resumen IA · ${temaMap.get(selectedTemaId) || 'Tema'}`,
                              `<div class="card"><p>${escapeHtml(msg.text).replace(/\n/g, '<br/>')}</p><p><em>${escapeHtml(msg.sourceLabel || '')}</em></p></div>`,
                            )
                          }
                        >
                          <FileDown size={14} aria-hidden="true" />
                          <span>PDF</span>
                        </button>
                      </div>
                      <p className="ai-disclaimer">Contenido generado por IA (RF-76): no sustituye validación docente oficial</p>
                    </div>
                  </div>
                ),
              )
            )}
          </div>

          <form className="chat-composer" onSubmit={handleSendQuestion}>
            <input
              type="text"
              className="composer-input"
              value={questionInput}
              onChange={(e) => setQuestionInput(e.target.value)}
              placeholder="Escribe tu pregunta..."
              aria-label="Escribe tu pregunta"
              disabled={!selectedTemaId || asking}
            />
            <div className="composer-actions">
              <button type="submit" className="btn-indigo" disabled={!selectedTemaId || asking}>
                {asking ? 'Consultando…' : 'Enviar'}
              </button>
              <button
                type="button"
                className="btn-outline-green"
                onClick={handleGenerateQuiz}
                disabled={!selectedTemaId || generatingQuiz}
              >
                Generar cuestionario ({quizCount})
              </button>
            </div>
          </form>
        </section>

        <section className="kolab-card quiz-card" aria-label="Autoevaluación">
          <header className="card-header-row quiz-header-row">
            <h2 className="card-title">Autoevaluación (hasta 15 reactivos)</h2>
            {activeQuiz && <span className="quiz-topic-chip">{activeQuiz.titulo}</span>}
          </header>

          {!activeQuiz ? (
            <p className="empty">
              Aún no hay un cuestionario activo. Selecciona un tema, elige de 3 a 15 reactivos y pulsa «Nuevo cuestionario».
            </p>
          ) : (
            <>
              {activeQuiz.reactivos.map((r) => (
                <div className="quiz-block" key={r.numero}>
                  <h3 className="quiz-question-title">{r.numero} · {r.tipo || 'Reactivo'}</h3>
                  <p className="quiz-question-prompt">{r.pregunta}</p>
                  {r.opciones && r.opciones.length > 0 ? (
                    <div className="mc-options">
                      {r.opciones.map((opt) => {
                        const isSelected = answers[r.numero] === opt;
                        return (
                          <button
                            key={opt}
                            type="button"
                            className={`mc-option ${isSelected ? 'is-selected' : ''}`}
                            onClick={() => setAnswers((prev) => ({ ...prev, [r.numero]: opt }))}
                            aria-pressed={isSelected}
                          >
                            <span>{opt}</span>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <textarea
                      className="open-answer-input"
                      rows={3}
                      value={answers[r.numero] ?? ''}
                      onChange={(e) => setAnswers((prev) => ({ ...prev, [r.numero]: e.target.value }))}
                      placeholder="Tu respuesta..."
                    />
                  )}
                </div>
              ))}

              {evaluationFeedback && (
                <div className={`quiz-feedback ${evaluationFeedback.ok ? 'is-good' : 'is-warn'}`}>
                  <p>{evaluationFeedback.message}</p>
                  {evaluationFeedback.conceptos && evaluationFeedback.conceptos.length > 0 && (
                    <div className="td-tags" style={{ marginTop: 6 }}>
                      {evaluationFeedback.conceptos.map((c, idx) => (
                        <span key={idx} className="td-tag">Reforzar: {c}</span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <button type="button" className="btn-green btn-full" onClick={handleGradeQuiz}>
                Calificar cuestionario
              </button>
            </>
          )}
        </section>
      </div>

      {/* Historial de resultados de autoevaluación y descarga (RF-26 / RF-81) */}
      <section className="kolab-card" aria-label="Historial de autoevaluaciones">
        <header className="card-header-row">
          <h2 className="card-title">Mi historial de autoevaluaciones (RF-26 / RF-81)</h2>
          <div className="row">
            <button type="button" className="btn btn--ghost btn--sm" onClick={handleExportHistoryCsv} disabled={historial.length === 0}>
              Descargar CSV
            </button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={handleExportHistoryPdf} disabled={historial.length === 0}>
              Exportar PDF
            </button>
          </div>
        </header>
        {loadingTemas ? (
          <RowListSkeleton count={3} />
        ) : historial.length === 0 ? (
          <p className="empty">Aún no has completado cuestionarios de autoevaluación.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Tema</th>
                  <th>Aciertos</th>
                  <th>Calificación</th>
                  <th>Conceptos a reforzar</th>
                </tr>
              </thead>
              <tbody>
                {historial.map((h) => (
                  <tr key={h._id}>
                    <td>{new Date(h.createdAt).toLocaleDateString('es-MX')}</td>
                    <td>{temaMap.get(h.idTema) || 'Tema'}</td>
                    <td>{h.aciertos}/{h.totalReactivos}</td>
                    <td>
                      <span className={`chip ${h.calificacion >= 70 ? 'chip--soft' : 'chip--xp'}`}>
                        {Math.round(h.calificacion)}%
                      </span>
                    </td>
                    <td>{h.conceptosPorReforzar?.join(', ') || '—'}</td>
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
