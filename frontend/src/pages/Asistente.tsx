import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { USE_MOCK, gqlRequest } from '../services/api';
import { assertNoScriptInjection } from '../utils/inputSecurity';
import Skeleton from '../components/Skeleton';

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

export default function Asistente() {
  const { token } = useAuth();
  const [temas, setTemas] = useState<TemaItem[]>([]);
  const [loadingTemas, setLoadingTemas] = useState(!USE_MOCK && Boolean(token));
  const [selectedTemaId, setSelectedTemaId] = useState('');
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [questionInput, setQuestionInput] = useState('');
  const [asking, setAsking] = useState(false);
  const [securityError, setSecurityError] = useState('');

  const [activeQuiz, setActiveQuiz] = useState<CuestionarioItem | null>(null);
  const [generatingQuiz, setGeneratingQuiz] = useState(false);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [evaluationFeedback, setEvaluationFeedback] = useState<{ ok: boolean; message: string } | null>(null);

  const loadTemas = useCallback(async () => {
    if (USE_MOCK || !token) {
      setLoadingTemas(false);
      return;
    }
    setLoadingTemas(true);
    try {
      const data = await gqlRequest<{ temas: TemaItem[] }>(
        `query AsistenteTemas { temas { _id titulo } }`,
        {},
        token,
      );
      const list = data.temas ?? [];
      setTemas(list);
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
            _id
            respuestaIa
            esValida
            fuentesCitadas { tituloRecurso fragmento }
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
        sourceLabel: fuentes.length > 0 ? `Fuente: ${fuentes[0].tituloRecurso}` : 'Sin fuentes citadas',
        isTeacherReviewed: res.consultarIa.esValida && fuentes.length > 0,
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (err: any) {
      setSecurityError(err.message || 'No se pudo consultar al asistente de IA.');
    } finally {
      setAsking(false);
    }
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
        `mutation GenerarCuestionario($idTema: ID!, $titulo: String) {
          generarCuestionarioIa(cantidadReactivos: 3, idTema: $idTema, titulo: $titulo) {
            _id
            titulo
            idTema
            reactivos { numero pregunta tipo opciones respuestaCorrecta explicacion }
          }
        }`,
        { idTema: selectedTemaId, titulo: `Autoevaluación: ${temaNombre}` },
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
      const res = await gqlRequest<{
        responderCuestionario: {
          aciertos: number;
          calificacion: number;
          totalReactivos: number;
          retroalimentacion: string;
        };
      }>(
        `mutation ResponderCuestionario($id: ID!, $respuestas: [String!]!) {
          responderCuestionario(cuestionarioId: $id, respuestas: $respuestas) {
            aciertos calificacion totalReactivos retroalimentacion
          }
        }`,
        { id: activeQuiz._id, respuestas: ordered },
        token,
      );
      const r = res.responderCuestionario;
      setEvaluationFeedback({
        ok: r.calificacion >= 60,
        message: `Calificación: ${Math.round(r.calificacion)}% (${r.aciertos}/${r.totalReactivos} aciertos). ${r.retroalimentacion}`,
      });
    } catch (err: any) {
      setSecurityError(err.message || 'No se pudo calificar el cuestionario.');
    }
  }

  return (
    <div className="module5-wrap">
      <section className="module-banner" aria-label="Encabezado del Módulo 5">
        <div className="banner-deco-circle banner-deco-1" aria-hidden="true" />
        <div className="banner-deco-circle banner-deco-2" aria-hidden="true" />

        <div className="banner-content">
          <span className="banner-pill">Módulo 5</span>
          <h1 className="banner-title">Asistente con IA (RAG) y autoevaluación</h1>
          <p className="banner-subtitle">Respuestas basadas en los materiales de tu escuela</p>
        </div>

        <button
          type="button"
          className="btn-banner-action"
          onClick={handleGenerateQuiz}
          disabled={generatingQuiz || !selectedTemaId}
        >
          {generatingQuiz ? 'Generando…' : 'Nuevo cuestionario'}
        </button>
      </section>

      {securityError && <p className="form-error" role="alert">{securityError}</p>}

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
                      <p className="ai-disclaimer">Respuesta generada por IA: no es una validación oficial</p>
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
                Generar cuestionario del tema
              </button>
            </div>
          </form>
        </section>

        <section className="kolab-card quiz-card" aria-label="Autoevaluación">
          <header className="card-header-row quiz-header-row">
            <h2 className="card-title">Autoevaluación</h2>
            {activeQuiz && <span className="quiz-topic-chip">{activeQuiz.titulo}</span>}
          </header>

          {!activeQuiz ? (
            <p className="empty">
              Aún no hay un cuestionario activo. Selecciona un tema y pulsa «Nuevo cuestionario» para practicar.
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
                  {evaluationFeedback.message}
                </div>
              )}

              <div className="quiz-footer">
                <button type="button" className="btn-indigo" onClick={handleGradeQuiz}>
                  Calificar
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
