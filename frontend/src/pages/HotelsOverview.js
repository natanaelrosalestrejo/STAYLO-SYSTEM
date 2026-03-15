import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { BedDouble, TrendingUp, BarChart3, AlertCircle, Award, RefreshCw } from 'lucide-react';

const fmt = (n) => `$${Number(n || 0).toLocaleString('es-MX')} MXN`;

const ScoreRing = ({ score }) => {
  const color = score >= 80 ? '#10b981' : score >= 60 ? '#f59e0b' : '#ef4444';
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

const OccupancyBar = ({ rate }) => (
  <div>
    <div className="flex items-center justify-between mb-1">
      <span className="text-xs text-slate-500">Ocupación</span>
      <span className="text-xs font-semibold text-slate-700">{rate}%</span>
    </div>
    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
      <div className="h-full rounded-full transition-all duration-700"
        style={{ width: `${rate}%`, background: rate >= 70 ? '#10b981' : rate >= 40 ? '#f59e0b' : '#ef4444' }} />
    </div>
  </div>
);

export default function HotelsOverview() {
  const [hotels, setHotels] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const fetchData = () => {
    setLoading(true);
    api.get('/properties/stats')
      .then(res => setHotels(res.data.filter(p => p.type === 'hotel' && p.status !== 'inactive')))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, []);

  const totalRevenue = hotels.reduce((s, h) => s + (h.monthly_revenue || 0), 0);
  const avgOccupancy = hotels.length ? Math.round(hotels.reduce((s, h) => s + (h.occupancy_rate || 0), 0) / hotels.length) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>
            Hoteles
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Vista estratégica de todas las propiedades de hotel</p>
        </div>
        <button onClick={fetchData} data-testid="hotels-refresh"
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
          <RefreshCw size={14} />Actualizar
        </button>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Hoteles activos', value: hotels.length, icon: BedDouble, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Ingresos del mes', value: fmt(totalRevenue), icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Ocupación promedio', value: `${avgOccupancy}%`, icon: BarChart3, color: 'text-violet-600', bg: 'bg-violet-50' },
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
      ) : hotels.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
          No hay hoteles activos registrados
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {hotels.map(hotel => (
            <div
              key={hotel.id}
              data-testid={`hotel-card-${hotel.id}`}
              className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all cursor-pointer group"
              onClick={() => navigate('/')}
            >
              {/* Card header */}
              <div className="px-5 pt-5 pb-4 flex items-start justify-between border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-emerald-50">
                    <BedDouble size={20} className="text-emerald-600" strokeWidth={1.5} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-800 text-sm leading-tight" style={{ fontFamily: 'Manrope, sans-serif' }}>
                      {hotel.name}
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">{hotel.total_rooms} habitaciones</p>
                  </div>
                </div>
                <ScoreRing score={hotel.performance_score || 0} />
              </div>

              {/* Metrics */}
              <div className="px-5 py-4 space-y-3">
                <OccupancyBar rate={hotel.occupancy_rate || 0} />
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div className="bg-emerald-50 rounded-lg p-3">
                    <p className="text-xs text-emerald-700 font-medium">Ingresos mes</p>
                    <p className="text-sm font-bold text-emerald-800 mt-0.5" style={{ fontFamily: 'Manrope, sans-serif' }}>
                      {fmt(hotel.monthly_revenue)}
                    </p>
                  </div>
                  <div className="bg-blue-50 rounded-lg p-3">
                    <p className="text-xs text-blue-700 font-medium">Reservas mes</p>
                    <p className="text-sm font-bold text-blue-800 mt-0.5" style={{ fontFamily: 'Manrope, sans-serif' }}>
                      {hotel.reservations_this_month}
                    </p>
                  </div>
                </div>
                {hotel.pending_payments > 0 && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 rounded-lg">
                    <AlertCircle size={14} className="text-amber-600 flex-shrink-0" />
                    <p className="text-xs text-amber-700 font-medium">{hotel.pending_payments} cobro(s) pendiente(s)</p>
                  </div>
                )}
                <button
                  className="w-full mt-1 py-2 rounded-lg text-xs font-semibold text-white transition-colors group-hover:opacity-90"
                  style={{ background: '#625746' }}
                  onClick={e => { e.stopPropagation(); navigate('/'); }}>
                  Ver dashboard del hotel
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
