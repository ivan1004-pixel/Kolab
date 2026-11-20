import { FormEvent, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { assertNoScriptInjection } from '../utils/inputSecurity';

const QUIZ_PRESETS = [
  {
    id: 'db-relacional',
    topic: 'Bases de Datos Relacionales',
    stepIndex: 2,
    totalSteps: 5,
    mcNumber: 2,
    mcPrompt: '¿Qué garantiza una clave primaria (Primary Key) en una tabla?',
    mcOptions: [
      { id: 'A', label: 'A)', text: 'Permite valores duplicados si son nulos' },
      { id: 'B', label: 'B)', text: 'Identifica de forma única cada registro y no acepta nulos' },
      { id: 'C', label: 'C)', text: 'Conecta automáticamente con cualquier base externa' },
    ],
    correctOptionId: 'B',
    openNumber: 3,
    openPrompt: 'Explica con tus palabras para qué sirve una clave foránea.',
    expectedKeywords: ['relacion', 'tabla', 'referencia', 'primaria', 'integridad', 'conecta', 'vincula'],
  },
  {
    id: 'estructuras-datos',
    topic: 'Estructuras de Datos',
    stepIndex: 1,
    totalSteps: 5,
    mcNumber: 1,
    mcPrompt: '¿Qué principio sigue una estructura de tipo Pila (Stack)?',
    mcOptions: [
      { id: 'A', label: 'A)', text: 'FIFO: el primero en entrar es el primero en salir' },
      { id: 'B', label: 'B)', text: 'LIFO: el último en entrar es el primero en salir' },
      { id: 'C', label: 'C)', text: 'Acceso aleatorio directo por índice numérico' },
    ],
    correctOptionId: 'B',
    openNumber: 2,
    openPrompt: 'Menciona un caso real donde usarías una Cola (Queue) en lugar de una Pila.',
    expectedKeywords: ['turno', 'impresora', 'orden', 'llegada', 'primero', 'fifo', 'solicitud', 'fila'],
  },
  {
    id: 'redes-http',
    topic: 'Desarrollo Web y APIs',
    stepIndex: 3,
    totalSteps: 5,
    mcNumber: 3,
    mcPrompt: '¿Qué código de estado HTTP indica que un recurso fue creado con éxito?',
    mcOptions: [
      { id: 'A', label: 'A)', text: '200 OK' },
      { id: 'B', label: 'B)', text: '201 Created' },
      { id: 'C', label: 'C)', text: '404 Not Found' },
    ],
    correctOptionId: 'B',
    openNumber: 4,
    openPrompt: '¿Cuál es la diferencia principal entre una petición GET y una POST?',
    expectedKeywords: ['consultar', 'obtener', 'leer', 'enviar', 'crear', 'cuerpo', 'body', 'datos'],
  },
];

interface ChatMsg {
  id: string;
  sender: 'student' | 'ai';
  text: string;
  sourceLabel?: string;
  isTeacherReviewed?: boolean;
}

const INITIAL_MESSAGES: ChatMsg[] = [
  {
    id: 'm1',
    sender: 'student',
    text: '¿Cuál es la diferencia entre una clave primaria y una clave foránea en bases de datos?',
  },
  {
    id: 'm2',
    sender: 'ai',
    text: 'Según los apuntes de Modelado Relacional (Unidad 2), la clave primaria identifica de manera única cada fila de su propia tabla y nunca puede repetirse ni quedar vacía. En cambio, la clave foránea es un campo que apunta a la clave primaria de otra tabla para crear un vínculo seguro entre ambas.',
    sourceLabel: 'Fuente: revisado por docente',
    isTeacherReviewed: true,
  },
];

export default function Asistente() {
  const { user, updateProfile } = useAuth();
  const [messages, setMessages] = useState<ChatMsg[]>(INITIAL_MESSAGES);
  const [questionInput, setQuestionInput] = useState('');
  const [securityError, setSecurityError] = useState('');
  const [quizIndex, setQuizIndex] = useState(0);
  const [activeQuiz, setActiveQuiz] = useState(QUIZ_PRESETS[0]);
  const [selectedOption, setSelectedOption] = useState('B');
  const [openAnswer, setOpenAnswer] = useState('');
  const [nliScore, setNliScore] = useState(70);
  const [evaluationFeedback, setEvaluationFeedback] = useState<{ isCorrectMc: boolean; message: string } | null>(null);

  function addXp(amount: number) {
    updateProfile({ xp: (user?.xp ?? 0) + amount });
  }

  function buildMockAiReply(query: string): ChatMsg {
    const q = query.toLowerCase();
    let text =
      'Con base en los materiales compartidos de tu carrera, este concepto se apoya en tres ideas clave: definir el problema con claridad, validar la estructura de datos o flujo y comprobar el resultado con casos de prueba.';
    let sourceLabel = 'Fuente: revisado por docente';
    let isTeacherReviewed = true;

    if (q.includes('pila') || q.includes('cola') || q.includes('stack') || q.includes('queue')) {
      text =
        'En los apuntes de Estructuras de Datos (Semana 4), una Pila (LIFO) saca primero el último elemento agregado, ideal para deshacer acciones; mientras que una Cola (FIFO) atiende en orden de llegada, como en una lista de impresión.';
    } else if (q.includes('http') || q.includes('api') || q.includes('get') || q.includes('post') || q.includes('rest')) {
      text =
        'De acuerdo con la guía de Desarrollo Web de la escuela, GET se utiliza para consultar recursos sin alterar su estado y POST envía información en el cuerpo de la petición para registrar o procesar datos nuevos.';
    } else if (q.includes('normaliz') || q.includes('sql') || q.includes('tabla')) {
      text =
        'En la guía de Bases de Datos II, normalizar evita duplicar información separando entidades en tablas relacionadas mediante claves primarias y foráneas.';
    } else if (q.length < 15) {
      sourceLabel = 'Fuente: apunte de comunidad (sin revisar)';
      isTeacherReviewed = false;
    }

    return {
      id: `ai-${Date.now()}`,
      sender: 'ai',
      text,
      sourceLabel,
      isTeacherReviewed,
    };
  }

  function handleSendQuestion(e: FormEvent) {
    e.preventDefault();
    const trimmed = questionInput.trim();
    if (!trimmed) return;
    try {
      assertNoScriptInjection(trimmed, 'pregunta');
      setSecurityError('');
    } catch (err: any) {
      setSecurityError(err.message);
      return;
    }

    const studentMsg: ChatMsg = {
      id: `st-${Date.now()}`,
      sender: 'student',
      text: trimmed,
    };
    const aiMsg = buildMockAiReply(trimmed);

    setMessages((prev) => [...prev, studentMsg, aiMsg]);
    setQuestionInput('');
  }

  function loadQuizPreset(nextIdx: number) {
    const preset = QUIZ_PRESETS[nextIdx % QUIZ_PRESETS.length];
    setQuizIndex(nextIdx % QUIZ_PRESETS.length);
    setActiveQuiz(preset);
    setSelectedOption('');
    setOpenAnswer('');
    setNliScore(0);
    setEvaluationFeedback(null);
  }

  function handleNewQuiz() {
    loadQuizPreset(quizIndex + 1);
  }

  function handleCreateQuizFromChat() {
    const lastStudentMsg = [...messages]
      .reverse()
      .find((m) => m.sender === 'student');
    const q = (lastStudentMsg?.text ?? '').toLowerCase();

    if (q.includes('pila') || q.includes('cola') || q.includes('estructura')) {
      loadQuizPreset(1);
    } else if (q.includes('http') || q.includes('api') || q.includes('get') || q.includes('post')) {
      loadQuizPreset(2);
    } else {
      loadQuizPreset(0);
    }
  }

  function handleGradeQuiz() {
    try {
      assertNoScriptInjection(openAnswer, 'respuesta abierta');
      setSecurityError('');
    } catch (err: any) {
      setSecurityError(err.message);
      return;
    }

    const isCorrectMc = selectedOption === activeQuiz.correctOptionId;

    const normalized = openAnswer
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    let computedNli = 0;
    if (normalized.trim().length > 0) {
      const matched = activeQuiz.expectedKeywords.filter((kw) =>
        normalized.includes(kw),
      ).length;
      const ratio = matched / Math.min(3, activeQuiz.expectedKeywords.length);
      computedNli = Math.min(96, Math.max(35, Math.round(35 + ratio * 60)));
    }

    setNliScore(computedNli);

    const earnedXp = (isCorrectMc ? 10 : 0) + (computedNli >= 60 ? 15 : 5);
    addXp(earnedXp);

    setEvaluationFeedback({
      isCorrectMc,
      message: isCorrectMc
        ? `Opción múltiple correcta. Similitud semántica NLI: ${computedNli}%. Ganaste +${earnedXp} XP.`
        : `La opción correcta era ${activeQuiz.correctOptionId}. Similitud NLI: ${computedNli}%. Ganaste +${earnedXp} XP por practicar.`,
    });
  }

  return (
    <div className="module5-wrap">
      <section className="module-banner" aria-label="Encabezado del Módulo 5">
        <div className="banner-deco-circle banner-deco-1" aria-hidden="true" />
        <div className="banner-deco-circle banner-deco-2" aria-hidden="true" />

        <div className="banner-content">
          <span className="banner-pill">Módulo 5</span>
          <h1 className="banner-title">Asistente con IA (RAG) y autoevaluación</h1>
          <p className="banner-subtitle">
            Respuestas basadas en los materiales de tu escuela
          </p>
        </div>

        <button
          type="button"
          className="btn-banner-action"
          onClick={handleNewQuiz}
        >
          Nuevo cuestionario
        </button>
      </section>

      {securityError && <p className="form-error" role="alert">{securityError}</p>}

      <div className="module5-grid">
        <section className="kolab-card assistant-card" aria-label="Asistente académico">
          <header className="card-header-row">
            <h2 className="card-title">Asistente académico</h2>
            <span className="chip-ia">IA</span>
          </header>

          <div className="chat-feed">
            {messages.map((msg) =>
              msg.sender === 'student' ? (
                <div key={msg.id} className="chat-row chat-row-student">
                  <div className="bubble-student">{msg.text}</div>
                </div>
              ) : (
                <div key={msg.id} className="chat-row chat-row-ai">
                  <div className="ai-avatar" aria-hidden="true">
                    IA
                  </div>
                  <div className="ai-bubble-group">
                    <div className="bubble-ai">
                      <p className="bubble-ai-text">{msg.text}</p>
                      {msg.sourceLabel && (
                        <span
                          className={`source-badge ${
                            msg.isTeacherReviewed ? 'is-reviewed' : 'is-unreviewed'
                          }`}
                        >
                          {msg.sourceLabel}
                        </span>
                      )}
                    </div>
                    <p className="ai-disclaimer">
                      Respuesta generada por IA: no es una validación oficial
                    </p>
                  </div>
                </div>
              ),
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
            />
            <div className="composer-actions">
              <button type="submit" className="btn-indigo">
                Enviar
              </button>
              <button
                type="button"
                className="btn-outline-green"
                onClick={handleCreateQuizFromChat}
              >
                Crear cuestionario de esta consulta
              </button>
            </div>
          </form>
        </section>

        <section className="kolab-card quiz-card" aria-label="Autoevaluación">
          <header className="card-header-row quiz-header-row">
            <h2 className="card-title">Autoevaluación</h2>
            <span className="quiz-topic-chip">{activeQuiz.topic}</span>
          </header>

          <div
            className="step-segments"
            role="progressbar"
            aria-valuenow={activeQuiz.stepIndex}
            aria-valuemin={1}
            aria-valuemax={activeQuiz.totalSteps}
          >
            {Array.from({ length: activeQuiz.totalSteps }).map((_, idx) => (
              <span
                key={idx}
                className={`step-segment ${idx < activeQuiz.stepIndex ? 'is-filled' : ''}`}
              />
            ))}
          </div>

          <div className="quiz-block">
            <h3 className="quiz-question-title">
              {activeQuiz.mcNumber} · Pregunta de opción múltiple
            </h3>
            <p className="quiz-question-prompt">{activeQuiz.mcPrompt}</p>

            <div className="mc-options">
              {activeQuiz.mcOptions.map((opt) => {
                const isSelected = selectedOption === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    className={`mc-option ${isSelected ? 'is-selected' : ''}`}
                    onClick={() => setSelectedOption(opt.id)}
                    aria-pressed={isSelected}
                  >
                    <span className="mc-option-letter">{opt.label}</span>{' '}
                    <span>{opt.text}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="quiz-block">
            <h3 className="quiz-question-title">
              {activeQuiz.openNumber} · Pregunta abierta
            </h3>
            <p className="quiz-question-prompt">{activeQuiz.openPrompt}</p>
            <textarea
              className="open-answer-input"
              rows={3}
              value={openAnswer}
              onChange={(e) => setOpenAnswer(e.target.value)}
              placeholder="Tu respuesta..."
              aria-label="Tu respuesta"
            />
          </div>

          <div className="nli-section">
            <div className="nli-header">
              <span className="nli-label">Similitud semántica (NLI)</span>
              <span className="nli-percent">{nliScore}%</span>
            </div>
            <div className="nli-track">
              <div className="nli-fill" style={{ width: `${nliScore}%` }} />
            </div>
          </div>

          {evaluationFeedback && (
            <div
              className={`quiz-feedback ${
                evaluationFeedback.isCorrectMc ? 'is-good' : 'is-warn'
              }`}
            >
              {evaluationFeedback.message}
            </div>
          )}

          <div className="quiz-footer">
            <button
              type="button"
              className="btn-indigo"
              onClick={handleGradeQuiz}
            >
              Calificar
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
