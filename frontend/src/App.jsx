import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import { MODULES } from './data/modules.js';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Perfil from './pages/Perfil.jsx';
import Foro from './pages/Foro.jsx';
import ModulePlaceholder from './pages/ModulePlaceholder.jsx';
import Curricular from './pages/Curricular.jsx';
import Recursos from './pages/Recursos.jsx';
import Asistente from './pages/Asistente.jsx';
import Comunidades from './pages/Comunidades.jsx';
import Tutorias from './pages/Tutorias.jsx';
import Radar from './pages/Radar.jsx';

function Protected({ children }) {
  const { user } = useAuth();
  const location = useLocation();
  return user ? children : <Navigate to="/login" state={{ from: location }} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/verify-email" element={<Login />} />
      <Route path="/reset-password" element={<Login />} />
      <Route element={<Protected><Layout /></Protected>}>
        <Route index element={<Dashboard />} />
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
