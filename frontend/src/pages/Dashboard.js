import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { BedDouble, Users, LogIn, LogOut, CheckSquare, TrendingUp, AlertTriangle, Clock, DollarSign, Sparkles } from 'lucide-react';

const StatCard = ({ label, value, icon: Icon, color, bgColor, onClick, testId }) => (
  <div data-testid={testId}
    className={`bg-white rounded-xl p-5 border border-slate-200 shadow-sm card-hover ${onClick ? 'cursor-pointer' : ''}`}
    onClick={onClick}>
    <div className="flex items-start justify-between">
      <div>
        <p className="text-sm text-slate-500 font-medium mb-1">{label}</p>
        <p className="text-2xl font-bold text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>{value}</p>
      </div>
      <div className={`w-10 h-10 ${bgColor} rounded-lg flex items-center justify-center`}>
        <Icon size={20} className={color} strokeWidth={1.5} />
      </div>
    </div>
  </div>
);

const STATUS_CONFIG = {
  available: { label: 'Disponible', cls: 'status-available' },
  occupied: { label: 'Ocupada', cls: 'status-occupied' },
  cleaning: { label: 'Limpieza', cls: 'status-cleaning' },
  maintenance: { label: 'Mantenimiento', cls: 'status-maintenance' },
  reserved: { label: 'Reservada', cls: 'status-reserved' },
  confirmed: { label: 'Confirmada', cls: 'status-reserved' },
  checked_in: { label: 'Check-in', cls: 'status-occupied' },
  checked_out: { label: 'Check-out', cls: 'status-available' },
  cancelled: { label: 'Cancelada', cls: 'status-maintenance' },
  pending: { label: 'Pendiente', cls: 'status-cleaning' },
  in_progress: { label: 'En Progreso', cls: 'status-reserved' },
  completed: { label: 'Completada', cls: 'status-available' },
};

const StatusBadge = ({ status }) => {
  const cfg = STATUS_CONFIG[status] || { label: status, cls: 'status-available' };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${cfg.cls}`}>{cfg.label}</span>;
};

const PRIORITY_CONFIG = {
  low: 'text-slate-500 bg-slate-100',
  medium: 'text-amber-700 bg-amber-50',
  high: 'text-red-600 bg-red-50',
  urgent: 'text-white bg-red-600',
};

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [reservations, setReservations] = useState([]);
  const [tasks, setTasks] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [s, r, t] = await Promise.all([
          api.get('/reports/dashboard'),
          api.get('/reservations'),
          api.get('/tasks'),
        ]);
        setStats(s.data);
        setReservations(r.data.filter(r => ['confirmed', 'checked_in'].includes(r.status)).slice(0, 5));
        setTasks(t.data.filter(t => t.status !== 'completed').slice(0, 5));
      } catch (e) {}
    };
    fetchAll();
  }, []);

  const today = new Date().toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>Dashboard</h1>
          <p className="text-sm text-slate-500 capitalize mt-0.5">{today}</p>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard label="Habitaciones Ocupadas" value={stats?.occupied_rooms ?? '—'} icon={BedDouble}
          color="text-blue-600" bgColor="bg-blue-50" testId="stat-occupied"
          onClick={() => navigate('/rooms')} />
        <StatCard label="Disponibles" value={stats?.available_rooms ?? '—'} icon={BedDouble}
          color="text-emerald-600" bgColor="bg-emerald-50" testId="stat-available"
          onClick={() => navigate('/rooms')} />
        <StatCard label="Check-ins Hoy" value={stats?.today_checkins ?? '—'} icon={LogIn}
          color="text-violet-600" bgColor="bg-violet-50" testId="stat-checkins"
          onClick={() => navigate('/reservations')} />
        <StatCard label="Check-outs Hoy" value={stats?.today_checkouts ?? '—'} icon={LogOut}
          color="text-amber-600" bgColor="bg-amber-50" testId="stat-checkouts"
          onClick={() => navigate('/reservations')} />
        <StatCard label="Tareas Pendientes" value={stats?.pending_tasks ?? '—'} icon={CheckSquare}
          color="text-red-500" bgColor="bg-red-50" testId="stat-tasks"
          onClick={() => navigate('/tasks')} />
        <StatCard label="Ingresos Totales" value={`$${(stats?.total_revenue ?? 0).toLocaleString('es-MX')}`} icon={TrendingUp}
          color="text-emerald-600" bgColor="bg-emerald-50" testId="stat-revenue" />
      </div>

      {/* Compact Operational Alerts Bar */}
      {stats && (
        <div data-testid="alerts-bar" className="flex flex-wrap gap-2">
          <button data-testid="alert-cleaning"
            onClick={() => navigate('/rooms')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-full border text-sm font-semibold transition-all hover:shadow-sm ${(stats.cleaning_rooms ?? 0) > 0 ? 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'}`}>
            <Sparkles size={14} strokeWidth={1.5} />
            Limpieza: <span className="font-bold">{stats.cleaning_rooms ?? 0}</span>
          </button>
          <button data-testid="alert-arrivals"
            onClick={() => navigate('/reservations')}
            className="flex items-center gap-2 px-3.5 py-2 rounded-full border border-violet-200 bg-violet-50 text-violet-700 text-sm font-semibold transition-all hover:bg-violet-100 hover:shadow-sm">
            <LogIn size={14} strokeWidth={1.5} />
            Llegadas: <span className="font-bold">{stats.today_checkins ?? 0}</span>
          </button>
          <button data-testid="alert-departures"
            onClick={() => navigate('/reservations')}
            className="flex items-center gap-2 px-3.5 py-2 rounded-full border border-indigo-200 bg-indigo-50 text-indigo-700 text-sm font-semibold transition-all hover:bg-indigo-100 hover:shadow-sm">
            <LogOut size={14} strokeWidth={1.5} />
            Salidas: <span className="font-bold">{stats.today_checkouts ?? 0}</span>
          </button>
          <button data-testid="alert-pending"
            onClick={() => navigate('/reservations')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-full border text-sm font-semibold transition-all hover:shadow-sm ${(stats.pending_payments ?? 0) > 0 ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'}`}>
            <DollarSign size={14} strokeWidth={1.5} />
            Cobros pendientes: <span className="font-bold">{stats.pending_payments ?? 0}</span>
          </button>
        </div>
      )}

      {/* Occupancy Bar */}
      {stats && (
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm" data-testid="occupancy-bar">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-slate-800" style={{ fontFamily: 'Manrope, sans-serif' }}>Ocupación del Hotel</h3>
            <span className="text-2xl font-bold text-emerald-600" style={{ fontFamily: 'Manrope, sans-serif' }}>{stats.occupancy_rate}%</span>
          </div>
          <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500 rounded-full transition-all duration-700"
              style={{ width: `${stats.occupancy_rate}%` }} />
          </div>
          <div className="flex gap-4 mt-3 text-xs text-slate-500">
            <span><span className="inline-block w-2 h-2 rounded-full bg-blue-400 mr-1"></span>Ocupadas: {stats.occupied_rooms}</span>
            <span><span className="inline-block w-2 h-2 rounded-full bg-emerald-400 mr-1"></span>Libres: {stats.available_rooms}</span>
            <span><span className="inline-block w-2 h-2 rounded-full bg-amber-400 mr-1"></span>Limpieza: {stats.cleaning_rooms}</span>
            <span><span className="inline-block w-2 h-2 rounded-full bg-violet-400 mr-1"></span>Reservadas: {stats.reserved_rooms}</span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active Reservations */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-semibold text-slate-800" style={{ fontFamily: 'Manrope, sans-serif' }}>Reservas Activas</h3>
            <button onClick={() => navigate('/reservations')} className="text-xs text-emerald-600 hover:text-emerald-700 font-medium">
              Ver todas
            </button>
          </div>
          <div className="divide-y divide-slate-50">
            {reservations.length === 0 ? (
              <p className="text-center text-sm text-slate-400 py-8">No hay reservas activas</p>
            ) : reservations.map(r => (
              <div key={r.id} className="px-5 py-3 hover:bg-slate-50 transition-colors">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{r.guest_name}</p>
                    <p className="text-xs text-slate-400">Hab. {r.room_number} · {r.check_in_date} → {r.check_out_date}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {r.payment_status === 'pending' && (
                      <span className="px-1.5 py-0.5 rounded text-xs font-semibold" style={{ background: '#fef3c7', color: '#92400e' }}>
                        $ Pendiente
                      </span>
                    )}
                    <StatusBadge status={r.status} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Pending Tasks */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-semibold text-slate-800" style={{ fontFamily: 'Manrope, sans-serif' }}>Tareas Pendientes</h3>
            <button onClick={() => navigate('/tasks')} className="text-xs text-emerald-600 hover:text-emerald-700 font-medium">
              Ver todas
            </button>
          </div>
          <div className="divide-y divide-slate-50">
            {tasks.length === 0 ? (
              <p className="text-center text-sm text-slate-400 py-8">No hay tareas pendientes</p>
            ) : tasks.map(t => (
              <div key={t.id} className="px-5 py-3 hover:bg-slate-50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{t.title}</p>
                    <p className="text-xs text-slate-400">{t.assigned_to_name || 'Sin asignar'} {t.room_number ? `· Hab. ${t.room_number}` : ''}</p>
                  </div>
                  <span className={`ml-2 px-2 py-0.5 rounded text-xs font-semibold ${PRIORITY_CONFIG[t.priority]}`}>
                    {t.priority === 'urgent' ? 'Urgente' : t.priority === 'high' ? 'Alta' : t.priority === 'medium' ? 'Media' : 'Baja'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
