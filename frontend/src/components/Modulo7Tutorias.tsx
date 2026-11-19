import { FormEvent, useState } from 'react';

type TutoringStatus = 'Pendiente' | 'En proceso' | 'Finalizada' | 'Rechazada';

interface TutoringRequest {
  id: string;
  student: string;
  avatarColor: string;
  topic: string;
  status: TutoringStatus;
}

type ReportAlert = 'Riesgo alto' | 'Sin alerta';
type ReportStatus = 'Abierto' | 'En revisión' | 'Resuelto';

interface ModerationReport {
  id: string;
  reason: string;
  reporterColor: string;
  aiAlert: ReportAlert;
  status: ReportStatus;
}

const INITIAL_REQUESTS: TutoringRequest[] = [
  {
    id: 't1',
    student: 'Sofía R.',
    avatarColor: '#FACC15',
    topic: 'Normalización 3FN',
    status: 'Pendiente',
  },
  {
    id: 't2',
    student: 'Diego M.',
    avatarColor: '#A5B4FC',
    topic: 'Árboles binarios',
    status: 'En proceso',
  },
  {
    id: 't3',
    student: 'Valeria C.',
    avatarColor: '#86EFAC',
    topic: 'Consultas JOIN',
    status: 'Finalizada',
  },
];

const INITIAL_REPORTS: ModerationReport[] = [
  {
    id: 'r1',
    reason: 'Contenido inapropiado',
    reporterColor: '#FB7185',
    aiAlert: 'Riesgo alto',
    status: 'Abierto',
  },
  {
    id: 'r2',
    reason: 'Comportamiento',
    reporterColor: '#A5B4FC',
    aiAlert: 'Sin alerta',
    status: 'En revisión',
  },
];

const TOPIC_OPTIONS = [
  'Bases de Datos Relacionales',
  'Estructuras de Datos',
  'Desarrollo Web y APIs',
  'Cálculo Integral',
];

interface Modulo7Props {
  onEarnXp: (amount: number) => void;
}

export function Modulo7Tutorias({ onEarnXp }: Modulo7Props) {
  const [requests, setRequests] = useState<TutoringRequest[]>(INITIAL_REQUESTS);
  const [reports, setReports] = useState<ModerationReport[]>(INITIAL_REPORTS);
  const [selectedTopic, setSelectedTopic] = useState<string>(TOPIC_OPTIONS[0]);
  const [requestMode, setRequestMode] = useState<'Tutoría' | 'Duelo'>('Duelo');
  const [notice, setNotice] = useState<string | null>(null);

  function handleUpdateRequest(id: string, nextStatus: TutoringStatus, xpBonus = 0) {
    setRequests((prev) =>
      prev.map((req) => (req.id === id ? { ...req, status: nextStatus } : req)),
    );
    if (xpBonus > 0) {
      onEarnXp(xpBonus);
    }
    setNotice(
      nextStatus === 'En proceso'
        ? `Tutoría aceptada y marcada "En proceso". +${xpBonus} XP.`
        : nextStatus === 'Rechazada'
          ? 'Solicitud de tutoría rechazada.'
          : `Estado actualizado a ${nextStatus}.`,
    );
  }

  function handleSendChallengeOrTutoring(e: FormEvent) {
    e.preventDefault();
    if (requestMode === 'Tutoría') {
      const created: TutoringRequest = {
        id: `t-${Date.now()}`,
        student: 'Tú (Estudiante)',
        avatarColor: '#86EFAC',
        topic: selectedTopic,
        status: 'Pendiente',
      };
      setRequests((prev) => [created, ...prev]);
      setNotice(`Solicitud de tutoría sobre "${selectedTopic}" enviada.`);
    } else {
      onEarnXp(10);
      setNotice(`¡Duelo académico 1 a 1 sobre "${selectedTopic}" enviado! +10 XP.`);
    }
  }

  function handleReviewReport(id: string) {
    setReports((prev) =>
      prev.map((rep) => (rep.id === id ? { ...rep, status: 'En revisión' } : rep)),
    );
    setNotice('Reporte abierto para revisión del moderador.');
  }

  function handleResolveReport(id: string) {
    setReports((prev) =>
      prev.map((rep) => (rep.id === id ? { ...rep, status: 'Resuelto' } : rep)),
    );
    onEarnXp(10);
    setNotice('Acción registrada por el moderador. Reporte resuelto (+10 XP).');
  }

  return (
    <div className="module7-wrap">
      {/* Banner del Módulo 7 */}
      <section className="module-banner module-banner-crimson" aria-label="Encabezado del Módulo 7">
        <div className="banner-deco-circle banner-deco-1" aria-hidden="true" />
        <div className="banner-deco-circle banner-deco-2" aria-hidden="true" />

        <div className="banner-content">
          <span className="banner-pill">Módulo 7</span>
          <h1 className="banner-title">Tutorías, duelos y moderación</h1>
          <p className="banner-subtitle">
            Ayuda entre pares, retos 1 a 1 y comunidad segura
          </p>
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
          <button
            type="button"
            className="notice-close"
            onClick={() => setNotice(null)}
            aria-label="Cerrar aviso"
          >
            ×
          </button>
        </div>
      )}

      {/* Fila media: Solicitudes de tutoría + Duelo académico */}
      <div className="module7-grid">
        {/* Izquierda: Solicitudes de tutoría */}
        <section className="kolab-card" aria-label="Solicitudes de tutoría">
          <header className="card-header-row">
            <h2 className="card-title">Solicitudes de tutoría</h2>
          </header>

          <div className="m7-table-head m7-tutor-cols">
            <span>Estudiante</span>
            <span>Tema</span>
            <span>Estado</span>
            <span>Acción</span>
          </div>

          <div className="m7-tutor-rows">
            {requests.map((req, idx) => (
              <div
                key={req.id}
                className={`m7-tutor-row m7-tutor-cols ${idx === 0 ? 'is-soft' : ''}`}
              >
                <div className="m7-student-cell">
                  <span
                    className="member-avatar"
                    style={{ backgroundColor: req.avatarColor }}
                    aria-hidden="true"
                  />
                  <span className="m7-student-name">{req.student}</span>
                </div>

                <span className="m7-topic-text">{req.topic}</span>

                <div>
                  <span
                    className={`status-pill ${
                      req.status === 'Pendiente'
                        ? 'status-pending'
                        : req.status === 'En proceso'
                          ? 'status-progress'
                          : req.status === 'Finalizada'
                            ? 'status-done'
                            : 'status-rejected'
                    }`}
                  >
                    {req.status}
                  </span>
                </div>

                <div className="m7-actions-cell">
                  {req.status === 'Pendiente' && (
                    <>
                      <button
                        type="button"
                        className="btn-green btn-sm"
                        onClick={() => handleUpdateRequest(req.id, 'En proceso', 15)}
                      >
                        Aceptar
                      </button>
                      <button
                        type="button"
                        className="btn-outline-green btn-sm"
                        onClick={() => handleUpdateRequest(req.id, 'Rechazada')}
                      >
                        Rechazar
                      </button>
                    </>
                  )}
                  {req.status === 'En proceso' && (
                    <button
                      type="button"
                      className="btn-outline-green btn-sm"
                      onClick={() => handleUpdateRequest(req.id, 'Finalizada', 15)}
                    >
                      Ver sesión
                    </button>
                  )}
                  {(req.status === 'Finalizada' || req.status === 'Rechazada') && (
                    <button
                      type="button"
                      className="btn-outline-green btn-sm"
                      onClick={() =>
                        setNotice(`Historial: tutoría de "${req.topic}" con ${req.student} (${req.status}).`)
                      }
                    >
                      Historial
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Derecha: Duelo académico */}
        <section className="kolab-card duel-card" aria-label="Duelo académico">
          <header className="card-header-row">
            <h2 className="card-title">Duelo académico</h2>
          </header>

          <div className="duel-vs-box" aria-hidden="true">
            <span className="duel-circle duel-circle-left" />
            <span className="duel-vs-text">VS</span>
            <span className="duel-circle duel-circle-right" />
          </div>

          <form className="duel-form" onSubmit={handleSendChallengeOrTutoring}>
            <select
              className="duel-select"
              value={selectedTopic}
              onChange={(e) => setSelectedTopic(e.target.value)}
              aria-label="Tema"
            >
              {TOPIC_OPTIONS.map((topic) => (
                <option key={topic} value={topic}>
                  {topic}
                </option>
              ))}
            </select>

            <div className="duel-mode-pills">
              <button
                type="button"
                className={`mode-pill mode-tutoring ${
                  requestMode === 'Tutoría' ? 'is-active' : ''
                }`}
                onClick={() => setRequestMode('Tutoría')}
              >
                Tutoría
              </button>
              <button
                type="button"
                className={`mode-pill mode-duel ${
                  requestMode === 'Duelo' ? 'is-active' : ''
                }`}
                onClick={() => setRequestMode('Duelo')}
              >
                Duelo
              </button>
            </div>

            <button type="submit" className="btn-crimson btn-full-center">
              Enviar solicitud
            </button>
          </form>
        </section>
      </div>

      {/* Fila inferior: Moderación de reportes */}
      <section className="kolab-card" aria-label="Moderación de reportes">
        <header className="card-header-row">
          <h2 className="card-title">Moderación de reportes</h2>
          <span className="chip-ia">Llama-Guard 3</span>
        </header>

        <div className="m7-table-head m7-mod-cols">
          <span>Motivo</span>
          <span>Reporta</span>
          <span>Alerta IA</span>
          <span>Estado</span>
          <span>Acción</span>
        </div>

        <div className="m7-mod-rows">
          {reports.map((rep) => (
            <div key={rep.id} className="m7-mod-row m7-mod-cols">
              <span className="m7-reason-text">{rep.reason}</span>

              <div>
                <span
                  className="reporter-dot"
                  style={{ backgroundColor: rep.reporterColor }}
                  aria-label="Usuario que reporta"
                />
              </div>

              <div>
                <span
                  className={`status-pill ${
                    rep.aiAlert === 'Riesgo alto' ? 'status-danger' : 'status-mint'
                  }`}
                >
                  {rep.aiAlert}
                </span>
              </div>

              <div>
                <span
                  className={`status-pill ${
                    rep.status === 'Abierto'
                      ? 'status-danger'
                      : rep.status === 'En revisión'
                        ? 'status-pending'
                        : 'status-done'
                  }`}
                >
                  {rep.status}
                </span>
              </div>

              <div className="m7-mod-actions">
                <button
                  type="button"
                  className="btn-crimson btn-sm"
                  onClick={() => handleReviewReport(rep.id)}
                >
                  Revisar
                </button>
                <button
                  type="button"
                  className="btn-outline-green btn-sm"
                  onClick={() => handleResolveReport(rep.id)}
                >
                  Registrar acción
                </button>
              </div>
            </div>
          ))}
        </div>

        <p className="ai-disclaimer mod-disclaimer">
          La IA sugiere; decide el moderador
        </p>
      </section>
    </div>
  );
}
