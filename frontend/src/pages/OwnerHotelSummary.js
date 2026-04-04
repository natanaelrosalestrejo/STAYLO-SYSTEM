import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../utils/api';
import { useProperty } from '../contexts/PropertyContext';
import {
  BedDouble, ArrowLeft, RefreshCw, CalendarDays, DoorOpen, TrendingUp,
  BarChart3, Sparkles,
} from 'lucide-react';

const fmt = (n) => `$${Number(n || 0).toLocaleString('es-MX')} MXN`;

function yearMonthPrefix() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function OwnerHotelSummary() {
  const { propertyId } = useParams();
  const navigate = useNavigate();
  const { selectProperty } = useProperty();
  const [hotel, setHotel] = useState(null);
  const [hotelSpaces, setHotelSpaces] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = () => {
    if (!propertyId) return;
    setLoading(true);
    setError(null);
    Promise.all([
      api.get('/properties/stats'),
      api.get(`/hotel-spaces?property_id=${encodeURIComponent(propertyId)}`),
      api.get(`/event-bookings?property_id=${encodeURIComponent(propertyId)}`),
    ])
      .then(([statsRes, spacesRes, bookRes]) => {
        const h = statsRes.data.find(
          (p) => p.id === propertyId && p.type === 'hotel' && p.status !== 'inactive'
        );
        if (!h) {
          setHotel(null);
          setError('not_found');
          return;
        }
        setHotel(h);
        setHotelSpaces(spacesRes.data || []);
        setBookings(bookRes.data || []);
      })
      .catch(() => {
        setError('load');
        setHotel(null);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    selectProperty(propertyId);
    load();
  }, [propertyId]);

  const hotelEventStats = useMemo(() => {
    const spaceIds = new Set((hotelSpaces || []).map((s) => s.id));
    const hotelBookings = (bookings || []).filter((b) => spaceIds.has(b.event_space_id));
    const ym = yearMonthPrefix();
    const td = todayIso();
    const thisMonth = hotelBookings.filter(
      (b) =>
        (b.event_date || '').startsWith(ym) && b.booking_status !== 'cancelled'
    );
    const upcoming = hotelBookings.filter(
      (b) => (b.event_date || '') >= td && b.booking_status !== 'cancelled'
    );
    return {
      totalHotelBookings: hotelBookings.length,
      eventsThisMonth: thisMonth.length,
      upcomingCount: upcoming.length,
    };
  }, [hotelSpaces, bookings]);

  const goOp = (path) => {
    selectProperty(propertyId);
    navigate(path);
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
          onClick={() => navigate('/hotels')}
          className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft size={16} /> Cartera de hoteles
        </button>
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-500">
          No se pudieron cargar los datos. Intenta de nuevo.
        </div>
      </div>
    );
  }

  if (error === 'not_found' || !hotel) {
    return (
      <div className="space-y-4">
        <Link
          to="/hotels"
          className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft size={16} /> Volver a hoteles
        </Link>
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-500">
          No se encontró este hotel o no tienes acceso.
        </div>
      </div>
    );
  }

  const availableRooms = Math.max(0, (hotel.total_rooms || 0) - (hotel.occupied_rooms || 0));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={() => navigate('/hotels')}
            className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft size={16} /> Cartera de hoteles
          </button>
        </div>
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
          {hotel.name}
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">Resumen ejecutivo del hotel</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {[
          {
            label: 'Ingresos del mes',
            value: fmt(hotel.monthly_revenue),
            icon: TrendingUp,
            bg: 'bg-emerald-50',
            ic: 'text-emerald-600',
          },
          {
            label: 'Ocupación',
            value: `${hotel.occupancy_rate ?? 0}%`,
            icon: BarChart3,
            bg: 'bg-violet-50',
            ic: 'text-violet-600',
          },
          {
            label: 'Reservas del mes',
            value: hotel.reservations_this_month ?? 0,
            icon: CalendarDays,
            bg: 'bg-blue-50',
            ic: 'text-blue-600',
          },
          {
            label: 'Habitaciones ocupadas',
            value: hotel.occupied_rooms ?? 0,
            icon: BedDouble,
            bg: 'bg-amber-50',
            ic: 'text-amber-600',
          },
          {
            label: 'Disponibles',
            value: availableRooms,
            icon: DoorOpen,
            bg: 'bg-slate-50',
            ic: 'text-slate-600',
          },
          {
            label: 'Inventario total',
            value: hotel.total_rooms ?? 0,
            icon: DoorOpen,
            bg: 'bg-slate-50',
            ic: 'text-slate-500',
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
          <Sparkles size={18} className="text-amber-600" strokeWidth={1.5} />
          <h2 className="font-semibold text-slate-800 text-sm" style={{ fontFamily: 'Manrope, sans-serif' }}>
            Eventos en espacios del hotel
          </h2>
        </div>
        <p className="text-xs text-slate-500 mb-3">
          Basado en reservas ligadas a salones/espacios del hotel ({hotelSpaces.length} espacio
          {hotelSpaces.length === 1 ? '' : 's'} registrado
          {hotelSpaces.length === 1 ? '' : 's'}).
        </p>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-slate-50 rounded-lg p-3 text-center">
            <p className="text-xs text-slate-500">Eventos del mes</p>
            <p className="text-lg font-bold text-slate-900">{hotelEventStats.eventsThisMonth}</p>
          </div>
          <div className="bg-slate-50 rounded-lg p-3 text-center">
            <p className="text-xs text-slate-500">Próximos</p>
            <p className="text-lg font-bold text-slate-900">{hotelEventStats.upcomingCount}</p>
          </div>
          <div className="bg-slate-50 rounded-lg p-3 text-center">
            <p className="text-xs text-slate-500">Total reservas</p>
            <p className="text-lg font-bold text-slate-900">{hotelEventStats.totalHotelBookings}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => goOp('/rooms')}
          className="px-4 py-2.5 rounded-lg text-sm font-semibold text-white"
          style={{ background: '#625746' }}
        >
          Ver habitaciones
        </button>
        <button
          type="button"
          onClick={() => goOp('/reservations')}
          className="px-4 py-2.5 rounded-lg text-sm font-semibold border border-slate-200 text-slate-700 bg-white hover:bg-slate-50"
        >
          Reservas
        </button>
        <button
          type="button"
          onClick={() => goOp('/hotel-events')}
          className="px-4 py-2.5 rounded-lg text-sm font-semibold border border-slate-200 text-slate-700 bg-white hover:bg-slate-50"
        >
          Eventos en hotel
        </button>
      </div>
    </div>
  );
}
