import { FormEvent, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { assertNoScriptInjection } from '../utils/inputSecurity';

const INITIAL_GROUPS = [
  {
    id: 'g1',
    initial: 'B',
    name: 'Bases de Datos UTVT',
    topic: 'SQL y Modelado',
    badgeColor: '#157F3C',
    members: [
      { id: 'u1', name: 'Sofía Ramírez', role: 'Líder', xp: 420, avatarColor: '#FACC15' },
      { id: 'u2', name: 'Diego Morales', role: 'Colaborador', xp: 310, avatarColor: '#A5B4FC' },
      { id: 'u3', name: 'Valeria Cruz', role: 'Integrante', xp: 185, avatarColor: '#86EFAC' },
    ],
  },
  {
    id: 'g2',
    initial: 'E',
    name: 'Estructuras y Grafos',
    topic: 'Algoritmos',
    badgeColor: '#2563EB',
    members: [
      { id: 'u4', name: 'Mateo Hernández', role: 'Líder', xp: 390, avatarColor: '#FACC15' },
      { id: 'u5', name: 'Camila Ortiz', role: 'Colaborador', xp: 275, avatarColor: '#A5B4FC' },
      { id: 'u6', name: 'Iván Pérez', role: 'Integrante', xp: 140, avatarColor: '#86EFAC' },
    ],
  },
  {
    id: 'g3',
    initial: 'D',
    name: 'Desarrollo Web API',
    topic: 'React y GraphQL',
    badgeColor: '#D97706',
    members: [
      { id: 'u7', name: 'Andrea López', role: 'Líder', xp: 450, avatarColor: '#FACC15' },
      { id: 'u8', name: 'Luis Navarro', role: 'Colaborador', xp: 295, avatarColor: '#A5B4FC' },
      { id: 'u9', name: 'Fernanda Silva', role: 'Integrante', xp: 210, avatarColor: '#86EFAC' },
    ],
  },
];

interface ChallengeItem {
  id: string;
  title: string;
  resource: string;
  xpReward: number;
  completed?: boolean;
}

const INITIAL_CHALLENGES: ChallengeItem[] = [
  {
    id: 'c1',
    title: 'Resumen de Normalización 3FN',
    resource: 'Apunte: Modelado Relacional U2',
    xpReward: 30,
  },
  {
    id: 'c2',
    title: '5 consultas con INNER JOIN',
    resource: 'Guía práctica: SQL UTVT',
    xpReward: 25,
  },
];

export default function Comunidades() {
  const { user, updateProfile } = useAuth();
  const xp = user?.xp ?? 120;

  const [groups, setGroups] = useState(INITIAL_GROUPS);
  const [selectedGroupId, setSelectedGroupId] = useState(INITIAL_GROUPS[0].id);
  const [challenges, setChallenges] = useState<ChallengeItem[]>(INITIAL_CHALLENGES);

  const [showNewGroupForm, setShowNewGroupForm] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupTopic, setNewGroupTopic] = useState('');

  const [showNewChallengeForm, setShowNewChallengeForm] = useState(false);
  const [newChallengeTitle, setNewChallengeTitle] = useState('');
  const [newChallengeResource, setNewChallengeResource] = useState('');

  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  const selectedGroup =
    groups.find((g) => g.id === selectedGroupId) ?? groups[0];

  const xpProgress = Math.min(100, Math.max(10, Math.round(((xp % 200) / 200) * 100) || 62));
  const teamBadgeUnlocked = xp >= 150;

  function addXp(amount: number) {
    updateProfile({ xp: (user?.xp ?? 0) + amount });
  }

  function handleCreateGroup(e: FormEvent) {
    e.preventDefault();
    const name = newGroupName.trim();
    const topic = newGroupTopic.trim();
    if (!name || !topic) return;
    try {
      assertNoScriptInjection({ name, topic }, 'grupo');
    } catch (err: any) {
      setStatusNotice(err.message);
      return;
    }

    const created = {
      id: `g-${Date.now()}`,
      initial: name[0].toUpperCase(),
      name,
      topic,
      badgeColor: '#0F766E',
      members: [
        {
          id: `u-${Date.now()}`,
          name: user?.nombre ?? 'Tú (Estudiante)',
          role: 'Líder',
          xp,
          avatarColor: '#FACC15',
        },
      ],
    };

    setGroups((prev) => [created, ...prev]);
    setSelectedGroupId(created.id);
    setNewGroupName('');
    setNewGroupTopic('');
    setShowNewGroupForm(false);
    addXp(15);
    setStatusNotice(`Grupo "${name}" creado. Ganaste +15 XP.`);
  }

  function handleInviteMember() {
    const sampleNames = ['Carlos Vega', 'Paola Méndez', 'Jorge Ríos', 'Elena Castro'];
    const nextName = sampleNames[selectedGroup.members.length % sampleNames.length];
    const newMember = {
      id: `m-${Date.now()}`,
      name: nextName,
      role: 'Integrante',
      xp: 110,
      avatarColor: '#86EFAC',
    };

    setGroups((prev) =>
      prev.map((g) =>
        g.id === selectedGroup.id
          ? { ...g, members: [...g.members, newMember] }
          : g,
      ),
    );
    setStatusNotice(`Invitación enviada a ${nextName} para unirse a ${selectedGroup.name}.`);
  }

  function handleAcceptRequest() {
    addXp(10);
    setStatusNotice(`Te uniste activamente a ${selectedGroup.name}. +10 XP.`);
  }

  function handleCreateChallenge(e: FormEvent) {
    e.preventDefault();
    const title = newChallengeTitle.trim();
    const resource = newChallengeResource.trim();
    if (!title) return;
    try {
      assertNoScriptInjection({ title, resource }, 'reto');
    } catch (err: any) {
      setStatusNotice(err.message);
      return;
    }

    const created: ChallengeItem = {
      id: `c-${Date.now()}`,
      title,
      resource: resource || 'Apunte de la comunidad',
      xpReward: 20,
    };

    setChallenges((prev) => [...prev, created]);
    setNewChallengeTitle('');
    setNewChallengeResource('');
    setShowNewChallengeForm(false);
    addXp(10);
    setStatusNotice(`Reto "${title}" publicado. +10 XP.`);
  }

  function handleCompleteChallenge(challengeId: string) {
    const target = challenges.find((c) => c.id === challengeId);
    if (!target || target.completed) return;

    setChallenges((prev) =>
      prev.map((c) => (c.id === challengeId ? { ...c, completed: true } : c)),
    );
    addXp(target.xpReward);
    setStatusNotice(`¡Reto "${target.title}" completado! Ganaste +${target.xpReward} XP.`);
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

        <button
          type="button"
          className="btn-banner-action"
          onClick={() => setShowNewGroupForm((v) => !v)}
        >
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
            <input
              type="text"
              className="composer-input"
              placeholder="Tema principal (ej. Integrales)"
              value={newGroupTopic}
              onChange={(e) => setNewGroupTopic(e.target.value)}
              required
            />
          </div>
          <div className="inline-form-actions">
            <button type="submit" className="btn-green">
              Guardar grupo
            </button>
            <button
              type="button"
              className="btn-outline-green"
              onClick={() => setShowNewGroupForm(false)}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {statusNotice && (
        <div className="module6-notice" role="status">
          <span>{statusNotice}</span>
          <button
            type="button"
            className="notice-close"
            onClick={() => setStatusNotice(null)}
            aria-label="Cerrar aviso"
          >
            ×
          </button>
        </div>
      )}

      <div className="module6-grid">
        <section className="kolab-card" aria-label="Grupos de estudio">
          <header className="card-header-row">
            <h2 className="card-title">Grupos de estudio</h2>
          </header>

          <div className="group-list">
            {groups.map((group) => {
              const isSelected = group.id === selectedGroup.id;
              return (
                <button
                  key={group.id}
                  type="button"
                  className={`group-item ${isSelected ? 'is-selected' : ''}`}
                  onClick={() => setSelectedGroupId(group.id)}
                >
                  <span
                    className="group-avatar"
                    style={{ backgroundColor: group.badgeColor }}
                  >
                    {group.initial}
                  </span>
                  <span className="group-name">{group.name}</span>
                  <span className="group-topic-pill">{group.topic}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="kolab-card members-card" aria-label="Integrantes del grupo">
          <header className="card-header-row">
            <h2 className="card-title">Integrantes del grupo</h2>
          </header>

          <div className="member-list">
            {selectedGroup.members.map((member, idx) => (
              <div
                key={member.id}
                className={`member-row ${idx === 1 ? 'is-highlighted' : ''}`}
              >
                <div className="member-info">
                  <span
                    className="member-avatar"
                    style={{ backgroundColor: member.avatarColor }}
                    aria-hidden="true"
                  />
                  <span className="member-name">{member.name}</span>
                </div>

                <div className="member-meta">
                  <span
                    className={`role-pill ${
                      member.role === 'Líder'
                        ? 'role-leader'
                        : member.role === 'Colaborador'
                          ? 'role-collab'
                          : 'role-member'
                    }`}
                  >
                    {member.role}
                  </span>
                  <span className="member-xp">{member.xp} XP</span>
                </div>
              </div>
            ))}
          </div>

          <div className="members-actions">
            <button type="button" className="btn-green" onClick={handleInviteMember}>
              Invitar
            </button>
            <button type="button" className="btn-outline-green" onClick={handleAcceptRequest}>
              Aceptar
            </button>
          </div>
        </section>

        <section className="kolab-card challenges-card" aria-label="Retos comunitarios">
          <header className="card-header-row">
            <h2 className="card-title">Retos comunitarios</h2>
          </header>

          <div className="challenge-list">
            {challenges.map((challenge, idx) => (
              <button
                key={challenge.id}
                type="button"
                className={`challenge-item ${challenge.completed ? 'is-done' : ''}`}
                onClick={() => handleCompleteChallenge(challenge.id)}
                title={
                  challenge.completed
                    ? 'Reto completado'
                    : 'Haz clic para completar este reto y ganar XP'
                }
              >
                <span className="challenge-num">{idx + 1}</span>
                <div className="challenge-body">
                  <span className="challenge-title">{challenge.title}</span>
                  <span className="challenge-resource">{challenge.resource}</span>
                </div>
                <span className="challenge-xp-pill">
                  {challenge.completed ? 'Listo' : `+${challenge.xpReward} XP`}
                </span>
              </button>
            ))}
          </div>

          {showNewChallengeForm && (
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
                placeholder="Recurso de referencia..."
                value={newChallengeResource}
                onChange={(e) => setNewChallengeResource(e.target.value)}
              />
              <div className="inline-form-actions">
                <button type="submit" className="btn-sol">
                  Publicar
                </button>
                <button
                  type="button"
                  className="btn-outline-green"
                  onClick={() => setShowNewChallengeForm(false)}
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}

          <div className="challenges-footer">
            <button
              type="button"
              className="btn-sol btn-full"
              onClick={() => setShowNewChallengeForm((v) => !v)}
            >
              + Publicar reto
            </button>
          </div>
        </section>
      </div>

      <section className="kolab-card badges-card" aria-label="Mis insignias y progreso">
        <header className="card-header-row">
          <h2 className="card-title">Mis insignias y progreso</h2>
        </header>

        <div className="badges-layout">
          <div className="badges-row">
            <div className="badge-item">
              <div className="badge-medal badge-amber">★</div>
              <span className="badge-label">Primer aporte</span>
            </div>

            <div className="badge-item">
              <div className="badge-medal badge-green">★</div>
              <span className="badge-label">Compañero colaborador</span>
            </div>

            <div className="badge-item">
              <div className="badge-medal badge-indigo">★</div>
              <span className="badge-label">Experto del tema</span>
            </div>

            <div className="badge-item">
              <div
                className={`badge-medal ${
                  teamBadgeUnlocked ? 'badge-green' : 'badge-locked'
                }`}
              >
                ★
              </div>
              <span className="badge-label">Trabajo en equipo</span>
            </div>
          </div>

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
