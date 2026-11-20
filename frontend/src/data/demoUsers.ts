export interface DemoUser {
  id: number;
  nombre: string;
  apellidos: string;
  email: string;
  password?: string;
  rol: string;
  carrera: string;
  xp: number;
  insignias: number;
  retos: number;
}

export const ROLES: Record<string, string> = {
  estudiante: 'Estudiante',
  docente: 'Docente',
  tutor: 'Tutor entre pares',
  lider: 'Líder de grupo',
  moderador: 'Moderador',
  admin: 'Administrador',
};

// SOLO para trabajar sin backend (VITE_USE_MOCK=true). Datos de ejemplo.
export const DEMO_USERS: DemoUser[] = [
  { id: 1, nombre: 'Ana', apellidos: 'Demo Estudiante', email: 'estudiante@utvt.edu.mx', password: 'kolab123', rol: 'estudiante', carrera: 'Carrera por definir', xp: 620, insignias: 3, retos: 2 },
  { id: 2, nombre: 'Luis', apellidos: 'Demo Docente', email: 'docente@utvt.edu.mx', password: 'kolab123', rol: 'docente', carrera: 'Carrera por definir', xp: 0, insignias: 0, retos: 0 },
  { id: 3, nombre: 'Sofía', apellidos: 'Demo Admin', email: 'admin@utvt.edu.mx', password: 'kolab123', rol: 'admin', carrera: 'Carrera por definir', xp: 0, insignias: 0, retos: 0 },
  { id: 4, nombre: 'Mario', apellidos: 'Demo Moderador', email: 'moderador@utvt.edu.mx', password: 'kolab123', rol: 'moderador', carrera: 'Carrera por definir', xp: 120, insignias: 1, retos: 0 },
];
