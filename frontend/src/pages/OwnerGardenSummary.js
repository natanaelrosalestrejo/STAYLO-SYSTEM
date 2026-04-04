import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../utils/api';
import { useProperty } from '../contexts/PropertyContext';
import {
  Sparkles, ArrowLeft, RefreshCw, CalendarDays, TrendingUp, Layers,
  AlertCircle, Clock, Home,
} from 'lucide-react';

const fmt = (n) => `$${Number(n || 0).toLocaleString('es-MX')} MXN`;

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function OwnerGardenSummary() {
  const { propertyId } = useParams();
  const navigate = useNavigate();
  const { selectProperty } = useProperty();
  const [garden, setGarden] = useState(null);
  const [spaces, setSpaces] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = () => {
    if (!propertyId) return;
    setLoading(true);
    setError(null);
    Promise.all([
      api.get('/properties/stats'),
      api.get(`/event-spaces?property_id=${encodeURIComponent(propertyId)}`),
      api.get(`/event-bookings?property_id=${encodeURIComponent(propertyId)}`),
    ])
      .then(([statsRes, spacesRes, bookRes]) => {
        const g = statsRes.data.find(
          (p) => p.id === propertyId && p.type === 'event_garden' && p.status !== 'inactive'
        );
        if (!g) {
          setGarden(null);
          setError('not_found');
          return;
        }
        setGarden(g);
        setSpaces(spacesRes.data || []);
        setBookings(bookRes.data || []);
      })
      .catch(() => {
        setError('load');
        setGarden(null);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    selectProperty(propertyId);
    load();
  }, [propertyId]);

  const td = todayIso();

  const derived = useMemo(() => {
    const list = (bookings || []).filter((b) => b.booking_status !== 'cancelled');
    const upcoming = list
      .filter((b) => (b.event_date || '') >= td)
      .sort((a, b) => (a.event_date || '').localeCompare(b.event_date || ''));
    const lodgingOn = list.filter((b) => b.lodging_integration_enabled).length;
    return { upcoming, lodgingOn };
  }, [bookings, td]);

  const openJardines = () => {
    selectProperty(propertyId);
    navigate(`/jardines?propertyId=${encodeURIComponent(propertyId)}`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div
          className="w-8 h-8 border-2 rounded-full animate-spin"
          style={{ borderColor: '#625746', borderTopColor: 'transparent' }}
        />
      </div>
    );
  }

  if (error === 'load') {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => navigate('/event-gardens')}
          className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft size={16} /> Cartera de jardines
        </button>
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-500">
          No se pudieron cargar los datos. Intenta de nuevo.
        </div>
      </div>
    );
  }

  if (error === 'not_found' || !garden) {
    return (
      <div className="space-y-4">
        <Link
          to="/event-gardens"
          className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft size={16} /> Volver a jardines
        </Link>
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-500">
          No se encontró este jardín o no tienes acceso.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => navigate('/event-gardens')}
          className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft size={16} /> Cartera de jardines
        </button>
        <button
          type="button"
          onClick={load}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50"
        >
          <RefreshCw size={14} /> Actualizar
        </button>
      </div>

      <div>
        <h1
          className="text-2xl font-bold text-slate-900"
          style={{ fontFamily: 'Manrope, sans-serif' }}
        >
          {garden.name}
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">Resumen ejecutivo del jardín</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {[
          {
            label: 'Ingresos eventos (mes)',
            value: fmt(garden.monthly_revenue),
            icon: TrendingUp,
            bg: 'bg-emerald-50',
            ic: 'text-emerald-600',
          },
          {
            label: 'Eventos este mes',
            value: garden.events_this_month ?? 0,
            icon: CalendarDays,
            bg: 'bg-violet-50',
            ic: 'text-violet-600',
          },
          {
            label: 'Próximos (total)',
            value: garden.upcoming_events ?? 0,
            icon: Clock,
            bg: 'bg-blue-50',
            ic: 'text-blue-600',
          },
          {
            label: 'Cobros pendientes',
            value: garden.pending_payments ?? 0,
            icon: AlertCircle,
            bg: 'bg-amber-50',
            ic: 'text-amber-600',
          },
          {
            label: 'Espacios',
            value: spaces.length,
            icon: Layers,
            bg: 'bg-slate-50',
            ic: 'text-slate-600',
          },
          {
            label: 'Eventos con hospedaje',
            value: derived.lodgingOn,
            icon: Home,
            bg: 'bg-indigo-50',
            ic: 'text-indigo-600',
          },
        ].map(({ label, value, icon: Icon, bg, ic }) => (
          <div
            key={label}
            className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex items-start gap-3"
          >
            <div className={`w-9 h-9 ${bg} rounded-lg flex items-center justify-center flex-shrink-0`}>
              <Icon size={18} className={ic} strokeWidth={1.5} />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-slate-500">{label}</p>
              <p
                className="text-lg font-bold text-slate-900 truncate"
                style={{ fontFamily: 'Manrope, sans-serif' }}
              >
                {value}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles size={18} className="text-violet-600" strokeWidth={1.5} />
          <h2 className="font-semibold text-slate-800 text-sm" style={{ fontFamily: 'Manrope, sans-serif' }}>
            Próximos eventos
          </h2>
        </div>
        {derived.upcoming.length === 0 ? (
          <p className="text-sm text-slate-500">No hay eventos próximos registrados.</p>
        ) : (
          <ul className="space-y-2">
            {derived.upcoming.slice(0, 8).map((b) => (
              <li
                key={b.id}
                className="flex flex-wrap items-center justify-between gap-2 text-sm border-b border-slate-100 pb-2 last:border-0"
              >
                <span className="font-medium text-slate-800">{b.client_name || 'Evento'}</span>
                <span className="text-slate-500">{b.event_date}</span>
                <span className="text-slate-600">{fmt(b.total_price)}</span>
              </li>
            ))}
          </ul>
        )}
        {derived.upcoming.length > 8 && (
          <p className="text-xs text-slate-400 mt-2">Y {derived.upcoming.length - 8} más en gestión de eventos.</p>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
        <h2 className="font-semibold text-slate-800 text-sm mb-2" style={{ fontFamily: 'Manrope, sans-serif' }}>
          Integración con hospedaje
        </h2>
        <p className="text-sm text-slate-600">
          {derived.lodgingOn > 0
            ? `${derived.lodgingOn} evento(s) tienen integración de hospedaje activa (detalle en gestión de eventos).`
            : 'Ningún evento con integración de hospedaje activa en este momento.'}
        </p>
      </div>

      <div>
        <button
          type="button"
          onClick={openJardines}
          className="px-4 py-2.5 rounded-lg text-sm font-semibold text-white"
          style={{ background: '#625746' }}
        >
          Abrir gestión de eventos
        </button>
      </div>
    </div>
  );
}
