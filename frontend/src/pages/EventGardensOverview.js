import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { Sparkles, TrendingUp, Calendar, AlertCircle, RefreshCw, Clock } from 'lucide-react';

const fmt = (n) => `$${Number(n || 0).toLocaleString('es-MX')} MXN`;

const ScoreRing = ({ score }) => {
  const color = score >= 80 ? '#8b5cf6' : score >= 60 ? '#f59e0b' : '#ef4444';
  return (
    <div className="flex flex-col items-center">
      <div className="relative w-14 h-14">
        <svg className="w-14 h-14 -rotate-90" viewBox="0 0 56 56">
          <circle cx="28" cy="28" r="22" fill="none" stroke="#f1f5f9" strokeWidth="5" />
          <circle cx="28" cy="28" r="22" fill="none" stroke={color} strokeWidth="5"
            strokeDasharray={`${2 * Math.PI * 22}`}
            strokeDashoffset={`${2 * Math.PI * 22 * (1 - score / 100)}`}
            strokeLinecap="round" />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-sm font-bold"
          style={{ color, fontFamily: 'Manrope, sans-serif' }}>{score}</span>
      </div>
      <p className="text-xs text-slate-400 mt-1">Score</p>
    </div>
  );
};

export default function EventGardensOverview() {
  const [gardens, setGardens] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const fetchData = () => {
    setLoading(true);
    api.get('/properties/stats')
      .then(res => setGardens(res.data.filter(p => p.type === 'event_garden' && p.status !== 'inactive')))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, []);

  const totalRevenue = gardens.reduce((s, g) => s + (g.monthly_revenue || 0), 0);
  const totalUpcoming = gardens.reduce((s, g) => s + (g.upcoming_events || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>
            Jardines de Eventos
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Vista estratégica de todos los jardines de eventos</p>
        </div>
        <button onClick={fetchData} data-testid="gardens-refresh"
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
          <RefreshCw size={14} />Actualizar
        </button>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Jardines activos', value: gardens.length, icon: Sparkles, color: 'text-violet-600', bg: 'bg-violet-50' },
          { label: 'Ingresos del mes', value: fmt(totalRevenue), icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Eventos próximos', value: totalUpcoming, icon: Calendar, color: 'text-blue-600', bg: 'bg-blue-50' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm flex items-center gap-3">
            <div className={`w-9 h-9 ${bg} rounded-lg flex items-center justify-center flex-shrink-0`}>
              <Icon size={18} className={color} strokeWidth={1.5} />
            </div>
            <div>
              <p className="text-xs text-slate-500">{label}</p>
              <p className="text-base font-bold text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>{value}</p>
            </div>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-7 h-7 border-2 rounded-full animate-spin" style={{ borderColor: '#625746', borderTopColor: 'transparent' }} />
        </div>
      ) : gardens.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
          No hay jardines de eventos activos registrados
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {gardens.map(garden => (
            <div
              key={garden.id}
              data-testid={`garden-card-${garden.id}`}
              className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all cursor-pointer group"
              onClick={() => navigate('/jardines')}
            >
              {/* Card header */}
              <div className="px-5 pt-5 pb-4 flex items-start justify-between border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-violet-50">
                    <Sparkles size={20} className="text-violet-600" strokeWidth={1.5} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-800 text-sm leading-tight" style={{ fontFamily: 'Manrope, sans-serif' }}>
                      {garden.name}
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">{garden.total_events || 0} eventos totales</p>
                  </div>
                </div>
                <ScoreRing score={garden.performance_score || 0} />
              </div>

              {/* Metrics */}
              <div className="px-5 py-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-violet-50 rounded-lg p-3">
                    <p className="text-xs text-violet-700 font-medium">Ingresos mes</p>
                    <p className="text-sm font-bold text-violet-800 mt-0.5" style={{ fontFamily: 'Manrope, sans-serif' }}>
                      {fmt(garden.monthly_revenue)}
                    </p>
                  </div>
                  <div className="bg-blue-50 rounded-lg p-3">
                    <p className="text-xs text-blue-700 font-medium">Eventos mes</p>
                    <p className="text-sm font-bold text-blue-800 mt-0.5" style={{ fontFamily: 'Manrope, sans-serif' }}>
                      {garden.events_this_month}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-lg">
                  <Clock size={14} className="text-slate-500 flex-shrink-0" />
                  <p className="text-xs text-slate-600">
                    <span className="font-semibold">{garden.upcoming_events}</span> evento(s) próximo(s)
                  </p>
                </div>
                {garden.pending_payments > 0 && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 rounded-lg">
                    <AlertCircle size={14} className="text-amber-600 flex-shrink-0" />
                    <p className="text-xs text-amber-700 font-medium">{garden.pending_payments} cobro(s) pendiente(s)</p>
                  </div>
                )}
                <button
                  className="w-full mt-1 py-2 rounded-lg text-xs font-semibold text-white transition-colors group-hover:opacity-90"
                  style={{ background: '#625746' }}
                  onClick={e => { e.stopPropagation(); navigate('/jardines'); }}>
                  Ver gestión del jardín
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
