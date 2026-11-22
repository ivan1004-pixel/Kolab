import { ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { MODULES } from './data/modules';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import DocenteDashboard from './pages/DocenteDashboard';
import Perfil from './pages/Perfil';
import Foro from './pages/Foro';
import ModulePlaceholder from './pages/ModulePlaceholder';
import Curricular from './pages/Curricular';
import Recursos from './pages/Recursos';
import Asistente from './pages/Asistente';
import Comunidades from './pages/Comunidades';
import Tutorias from './pages/Tutorias';
import Radar from './pages/Radar';

function Protected({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  return user ? <>{children}</> : <Navigate to="/login" state={{ from: location }} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/verify-email" element={<Login />} />
      <Route path="/reset-password" element={<Login />} />
      <Route element={<Protected><Layout /></Protected>}>
        <Route index element={<Dashboard />} />
        <Route path="docente" element={<DocenteDashboard />} />
        <Route path="perfil" element={<Perfil />} />
        <Route path="foro" element={<Foro />} />
        <Route path="curricular" element={<Curricular />} />
        <Route path="recursos" element={<Recursos />} />
        <Route path="asistente" element={<Asistente />} />
        <Route path="comunidades" element={<Comunidades />} />
        <Route path="tutorias" element={<Tutorias />} />
        <Route path="radar" element={<Radar />} />
        {/* Módulos que aún no se construyen: misma ruta, pantalla provisional */}
        {MODULES.filter((m) => !m.built && ![2, 3, 5, 6, 7, 8].includes(m.id)).map((m) => (
          <Route key={m.id} path={m.path.slice(1)} element={<ModulePlaceholder module={m} />} />
        ))}
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
