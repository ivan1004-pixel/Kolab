import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { USE_MOCK, gqlRequest } from '../services/api';

type TipoNotificacion =
  | 'RESPUESTA_PREGUNTA'
  | 'VALIDACION_RECURSO'
  | 'REVISION_PENDIENTE'
  | 'RACHA_EN_RIESGO'
  | 'SISTEMA';

interface NotificacionItem {
  _id: string;
  tipo: TipoNotificacion;
  titulo: string;
  mensaje: string;
  leida: boolean;
  createdAt: string;
}

const TIPO_META: Record<TipoNotificacion, { label: string; route?: string }> = {
  RESPUESTA_PREGUNTA: { label: 'Foro', route: '/foro' },
  VALIDACION_RECURSO: { label: 'Recursos', route: '/recursos' },
  REVISION_PENDIENTE: { label: 'Revisión', route: '/recursos' },
  RACHA_EN_RIESGO: { label: 'Racha', route: '/perfil' },
  SISTEMA: { label: 'Sistema' },
};

const MOCK_NOTIFICACIONES: NotificacionItem[] = [
  {
    _id: 'mock-1',
    tipo: 'RESPUESTA_PREGUNTA',
    titulo: 'Nueva respuesta en tu duda',
    mensaje: 'Respondieron tu pregunta sobre árboles binarios en Estructura de Datos.',
    leida: false,
    createdAt: new Date(Date.now() - 8 * 60 * 1000).toISOString(),
  },
  {
    _id: 'mock-2',
    tipo: 'VALIDACION_RECURSO',
    titulo: 'Recurso validado',
    mensaje: 'Tu guía de Cálculo Integral fue aprobada (+25 XP).',
    leida: false,
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  },
  {
    _id: 'mock-3',
    tipo: 'SISTEMA',
    titulo: 'Bienvenido a Kolab',
    mensaje: 'Explora recursos revisados, comunidades y tutorías entre pares.',
    leida: true,
    createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
  },
];

const MIS_NOTIFICACIONES_QUERY = `
  query MisNotificaciones {
    misNotificaciones {
      _id
      tipo
      titulo
      mensaje
      leida
      createdAt
    }
  }
`;

const MARCAR_LEIDA_MUTATION = `
  mutation MarcarNotificacionLeida($notificacionId: ID!) {
    marcarNotificacionLeida(notificacionId: $notificacionId) {
      _id
      leida
    }
  }
`;

function formatRelativeTime(isoDate: string): string {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  if (Number.isNaN(diffMs) || diffMs < 60_000) return 'Ahora';
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return `Hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `Hace ${days} d`;
}

export default function NotificationBell() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificacionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchNotifications = useCallback(async (silent = false) => {
    if (USE_MOCK) {
      setItems((prev) => (prev.length > 0 ? prev : MOCK_NOTIFICACIONES));
      return;
    }
    if (!token) return;
    if (!silent) setLoading(true);
    setError('');
    try {
      const data = await gqlRequest<{ misNotificaciones: NotificacionItem[] }>(
        MIS_NOTIFICACIONES_QUERY,
        {},
        token,
      );
      setItems(data.misNotificaciones ?? []);
    } catch (err: any) {
      if (!silent) setError(err.message || 'No se pudieron cargar las notificaciones.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchNotifications(true);
    const timer = window.setInterval(() => fetchNotifications(true), 30_000);
    return () => window.clearInterval(timer);
  }, [fetchNotifications]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const unreadCount = items.filter((n) => !n.leida).length;

  function toggleOpen() {
    const next = !open;
    setOpen(next);
    if (next) fetchNotifications();
  }

  async function markAsRead(notif: NotificacionItem) {
    if (!notif.leida) {
      setItems((prev) => prev.map((n) => (n._id === notif._id ? { ...n, leida: true } : n)));
      if (!USE_MOCK && token) {
        try {
          await gqlRequest(MARCAR_LEIDA_MUTATION, { notificacionId: notif._id }, token);
        } catch {
          // Revertir si falla la mutación
          setItems((prev) => prev.map((n) => (n._id === notif._id ? { ...n, leida: false } : n)));
        }
      }
    }
    const route = TIPO_META[notif.tipo]?.route;
    if (route) {
      setOpen(false);
      navigate(route);
    }
  }

  async function markAllAsRead() {
    const unread = items.filter((n) => !n.leida);
    if (unread.length === 0) return;
    setItems((prev) => prev.map((n) => ({ ...n, leida: true })));
    if (!USE_MOCK && token) {
      await Promise.allSettled(
        unread.map((n) => gqlRequest(MARCAR_LEIDA_MUTATION, { notificacionId: n._id }, token)),
      );
    }
  }

  return (
    <div className="notif-wrap" ref={wrapperRef}>
      <button
        type="button"
        className="notif-btn"
        aria-label={unreadCount > 0 ? `Notificaciones (${unreadCount} sin leer)` : 'Notificaciones'}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={toggleOpen}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="notif-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
        )}
      </button>

      {open && (
        <div className="notif-panel" role="dialog" aria-label="Notificaciones">
          <div className="notif-panel__head">
            <div className="notif-panel__title-row">
              <strong>Notificaciones</strong>
              {unreadCount > 0 && <span className="notif-panel__count">{unreadCount}</span>}
            </div>
            {unreadCount > 0 && (
              <button type="button" className="notif-panel__clear" onClick={markAllAsRead}>
                Marcar todas leídas
              </button>
            )}
          </div>

          <div className="notif-panel__body">
            {loading && items.length === 0 ? (
              <p className="notif-panel__empty">Cargando notificaciones…</p>
            ) : error ? (
              <p className="notif-panel__empty">{error}</p>
            ) : items.length === 0 ? (
              <p className="notif-panel__empty">No tienes notificaciones por ahora.</p>
            ) : (
              items.map((notif) => {
                const meta = TIPO_META[notif.tipo] ?? { label: 'Aviso' };
                return (
                  <button
                    key={notif._id}
                    type="button"
                    className={`notif-item ${notif.leida ? '' : 'notif-item--unread'}`}
                    onClick={() => markAsRead(notif)}
                  >
                    <div className="notif-item__top">
                      <span className="notif-item__tag">{meta.label}</span>
                      <span className="notif-item__time">{formatRelativeTime(notif.createdAt)}</span>
                    </div>
                    <strong className="notif-item__title">{notif.titulo}</strong>
                    <p className="notif-item__msg">{notif.mensaje}</p>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
