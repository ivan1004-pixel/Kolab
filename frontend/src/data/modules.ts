export interface KolabModule {
  id: number;
  path: string;
  short: string;
  name: string;
  built?: boolean;
  ink?: boolean;
  desc: string;
  c1: string;
  c2: string;
  features?: string[];
}

// c1 → c2 = degradado del banner. ink = texto oscuro (para fondos claros como el Sol).
export const MODULES: KolabModule[] = [
  { id: 1, path: '/perfil', short: 'Perfil', name: 'Identidad y perfiles', built: true,
    desc: 'Tu perfil académico y acceso según tu rol', c1: '#157f3c', c2: '#22a559' },
  { id: 2, path: '/curricular', short: 'Curricular', name: 'Gestión curricular y carga académica',
    desc: 'Carreras, asignaturas, temas y tus materias inscritas', c1: '#0f766e', c2: '#14b8a6',
    features: ['Mis materias inscritas', 'Temas y unidades', 'Administración curricular (solo Administrador)'] },
  { id: 3, path: '/recursos', short: 'Recursos', name: 'Repositorio de recursos y validación docente',
    desc: 'Comparte, busca y confía en materiales revisados', c1: '#4d7c0f', c2: '#6aa51a',
    features: ['Subir recurso (PDF, imagen, presentación)', 'Filtros por carrera, asignatura y tema', 'Sello “Revisado por docente”'] },
  { id: 4, path: '/foro', short: 'Foro de dudas', name: 'Foro contextual de dudas', built: true,
    desc: 'Pregunta justo donde no entendiste', c1: '#2563eb', c2: '#38a6f0' },
  { id: 5, path: '/asistente', short: 'Asistente IA', name: 'Asistente con IA y autoevaluación',
    desc: 'Respuestas basadas en los materiales de tu escuela', c1: '#4338ca', c2: '#7c6df0',
    features: ['Chat con el asistente (siempre rotulado como IA)', 'Cuestionarios de autoevaluación', 'Calificación de preguntas abiertas'] },
  { id: 6, path: '/comunidades', short: 'Comunidades', name: 'Comunidades, retos y gamificación',
    desc: 'Estudia en equipo, gana XP e insignias', c1: '#b45309', c2: '#e08a1e',
    features: ['Grupos de estudio e integrantes', 'Retos comunitarios', 'Insignias y progreso'] },
  { id: 7, path: '/tutorias', short: 'Tutorías', name: 'Tutorías, duelos y moderación',
    desc: 'Ayuda entre pares, retos 1 a 1 y comunidad segura', c1: '#9f1239', c2: '#e04a6e',
    features: ['Solicitudes de tutoría', 'Duelo académico', 'Moderación de reportes'] },
  { id: 8, path: '/radar', short: 'Radar y PWA', name: 'Radar de dificultades e infraestructura PWA', ink: true,
    desc: 'Dónde se atoran tus estudiantes y cómo instalar KOLAB', c1: '#f9cb15', c2: '#fde68a',
    features: ['Tema con más dudas y dificultad por unidad', 'Preguntas frecuentes', 'Instalar KOLAB en el móvil'] },
];
