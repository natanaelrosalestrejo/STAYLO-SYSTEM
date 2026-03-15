import { useState, useEffect } from 'react';
import api from '../utils/api';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer
} from 'recharts';
import {
  TrendingUp, DollarSign, Target, BedDouble, AlertTriangle, Award,
  ArrowUpRight, ArrowDownRight, Minus, Sparkles, RefreshCw, Lightbulb
} from 'lucide-react';

// ─── helpers ────────────────────────────────────────────────
const fmt    = (n) => `$${Number(n || 0).toLocaleString('es-MX')}`;
const fmtPct = (n) => `${n > 0 ? '+' : ''}${n}%`;
const CHART_COLORS = ['#625746', '#10b981', '#8b5cf6', '#f59e0b'];

// ─── Metric card ─────────────────────────────────────────────
const ACCENTS = {
  green:  { border: 'border-emerald-100', bg: 'bg-emerald-50', icon: 'text-emerald-600' },
  blue:   { border: 'border-blue-100',    bg: 'bg-blue-50',    icon: 'text-blue-600' },
  indigo: { border: 'border-indigo-100',  bg: 'bg-indigo-50',  icon: 'text-indigo-600' },
  violet: { border: 'border-violet-100',  bg: 'bg-violet-50',  icon: 'text-violet-600' },
  amber:  { border: 'border-amber-100',   bg: 'bg-amber-50',   icon: 'text-amber-600' },
  red:    { border: 'border-red-100',     bg: 'bg-red-50',     icon: 'text-red-500' },
  muted:  { border: 'border-slate-100',   bg: 'bg-slate-50',   icon: 'text-slate-400' },
};

const MetricCard = ({ label, value, sub, icon: Icon, accent = 'muted', badge, testId }) => {
  const a = ACCENTS[accent];
  return (
    <div data-testid={testId} className={`bg-white rounded-xl border ${a.border} shadow-sm p-5 flex flex-col gap-3`}>
      <div className="flex items-center justify-between">
        <div className={`w-9 h-9 ${a.bg} rounded-lg flex items-center justify-center`}>
          <Icon size={18} className={a.icon} strokeWidth={1.5} />
        </div>
        {badge && (
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${badge.cls}`}>
            {badge.text}
          </span>
        )}
      </div>
      <div>
        <p className="text-2xl font-bold text-slate-900 leading-none" style={{ fontFamily: 'Manrope, sans-serif' }}>{value}</p>
        <p className="text-xs font-semibold text-slate-600 mt-1.5">{label}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
};

// ─── Performance score ring ──────────────────────────────────
const ScoreRing = ({ score, label }) => {
  const clr = score >= 75 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444';
  const lbl = score >= 75 ? 'Excelente' : score >= 55 ? 'Bueno' : score >= 40 ? 'Regular' : 'Bajo';
  const r   = 26;
  const circ = 2 * Math.PI * r;
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-16 h-16">
        <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
          <circle cx="32" cy="32" r={r} fill="none" stroke="#f1f5f9" strokeWidth="5" />
          <circle cx="32" cy="32" r={r} fill="none" stroke={clr} strokeWidth="5"
            strokeDasharray={circ}
            strokeDashoffset={circ * (1 - score / 100)}
            strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.7s ease' }} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm font-bold" style={{ color: clr, fontFamily: 'Manrope, sans-serif' }}>{score}</span>
        </div>
      </div>
      <p className="text-xs font-semibold" style={{ color: clr }}>{lbl}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
};

// ─── Main component ──────────────────────────────────────────
export default function CorporateDashboard() {
  const [stats, setStats]           = useState(null);
  const [loading, setLoading]       = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchData = () => {
    setLoading(true);
    api.get('/corporate/dashboard')
      .then(res => { setStats(res.data); setLastUpdated(new Date()); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, []);

  if (loading && !stats) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-7 h-7 border-2 rounded-full animate-spin"
        style={{ borderColor: '#625746', borderTopColor: 'transparent' }} />
    </div>
  );

  const hotel   = stats?.hotel            || {};
  const garden  = stats?.event_gardens    || {};
  const group   = stats?.group            || {};
  const ri      = stats?.revenue_intelligence || {};
  const ranking = stats?.property_ranking || [];
  const chart   = stats?.comparison_chart || [];
  const sources = ri.source_breakdown     || [];
  const growth  = group.revenue_growth_pct ?? 0;
  const maxSrc  = Math.max(...sources.map(s => s.count), 1);

  // ── render ────────────────────────────────────────────────
  return (
    <div className="space-y-7">

      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900"
            style={{ fontFamily: 'Manrope, sans-serif' }}>
            Dashboard Corporativo
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Visión ejecutiva
            {lastUpdated && (
              <span className="ml-2 text-slate-400">
                · {lastUpdated.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}
              </span>
            )}
          </p>
        </div>
        <button onClick={fetchData} disabled={loading} data-testid="corp-refresh"
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-500 hover:bg-slate-50 transition-colors disabled:opacity-50">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Actualizar
        </button>
      </div>

      {/* ── Row 1: Revenue KPIs (4) ─────────────────────────── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricCard
          label="Ingresos del Mes"
          value={fmt(group.total_revenue_this_month)}
          sub="Todas las propiedades"
          icon={TrendingUp} accent="green" testId="corp-revenue-month"
          badge={growth !== 0 ? {
            text: fmtPct(growth),
            cls: growth > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
          } : undefined}
        />
        <MetricCard
          label="Ingresos Totales Históricos"
          value={fmt(group.total_revenue_all_time)}
          sub="Acumulado"
          icon={DollarSign} accent="blue" testId="corp-revenue-total"
        />
        <MetricCard
          label="Ingresos Esperados"
          value={fmt(group.expected_revenue)}
          sub="Reservas y eventos confirmados"
          icon={Target} accent="indigo" testId="corp-expected"
        />
        <MetricCard
          label="Proyección Fin de Mes"
          value={fmt(ri.projected_month_revenue)}
          sub="Basado en ritmo actual"
          icon={TrendingUp} accent="violet" testId="corp-projected"
        />
      </div>

      {/* ── Row 2: Performance KPIs (4) ─────────────────────── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricCard
          label="Ocupación Promedio"
          value={`${group.avg_occupancy_rate ?? 0}%`}
          sub="Hoteles del grupo"
          icon={BedDouble}
          accent={(group.avg_occupancy_rate ?? 0) >= 70 ? 'green' : (group.avg_occupancy_rate ?? 0) >= 40 ? 'amber' : 'red'}
          testId="corp-occupancy"
        />
        <MetricCard
          label="Mejor Hotel"
          value={ri.best_hotel?.name?.split(' ').slice(0, 2).join(' ') || '—'}
          sub={ri.best_hotel ? `${fmt(ri.best_hotel.monthly_revenue)} este mes` : 'Sin datos'}
          icon={Award} accent="green" testId="corp-best-hotel"
        />
        <MetricCard
          label="Mejor Jardín de Eventos"
          value={ri.best_garden?.name?.split(' ').slice(0, 2).join(' ') || '—'}
          sub={ri.best_garden ? `${fmt(ri.best_garden.monthly_revenue)} este mes` : 'Sin datos'}
          icon={Award} accent="amber" testId="corp-best-garden"
        />
        <MetricCard
          label="Cobros Pendientes"
          value={group.pending_payments ?? 0}
          sub="Todas las propiedades"
          icon={AlertTriangle}
          accent={(group.pending_payments ?? 0) > 0 ? 'red' : 'muted'}
          testId="corp-pending"
        />
      </div>

      {/* ── Revenue Opportunity (full-width highlight) ───────── */}
      <div data-testid="corp-opportunity-section"
        className="rounded-xl border border-violet-200 bg-white shadow-sm overflow-hidden">
        <div className="px-6 py-5 flex items-center justify-between flex-wrap gap-5">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-violet-100 flex items-center justify-center flex-shrink-0">
              <Lightbulb size={22} className="text-violet-600" strokeWidth={1.5} />
            </div>
            <div>
              <p className="text-xs font-semibold text-violet-500 uppercase tracking-widest mb-1">
                Oportunidad de Ingresos Potencial
              </p>
              <p className="text-3xl font-bold text-violet-900"
                style={{ fontFamily: 'Manrope, sans-serif' }} data-testid="corp-opportunity">
                {fmt(ri.revenue_opportunity)}
                <span className="text-base font-normal text-violet-400 ml-1">MXN</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-8 flex-wrap">
            <div>
              <p className="text-xs text-slate-400 mb-0.5">Fórmula</p>
              <p className="text-xs font-medium text-slate-600 leading-relaxed">
                Cuartos disponibles<br />× tarifa promedio<br />× días restantes del mes
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-400 mb-1">Variación vs mes anterior</p>
              <p className={`text-2xl font-bold flex items-center justify-end gap-1 ${growth > 0 ? 'text-emerald-600' : growth < 0 ? 'text-red-500' : 'text-slate-400'}`}
                style={{ fontFamily: 'Manrope, sans-serif' }} data-testid="corp-growth">
                {growth > 0 ? <ArrowUpRight size={20} /> : growth < 0 ? <ArrowDownRight size={20} /> : <Minus size={20} />}
                {fmtPct(growth)}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">Mes anterior: {fmt(ri.last_month_revenue)}</p>
            </div>
          </div>
        </div>
        <div className="px-6 py-2 border-t border-violet-100 bg-violet-50">
          <p className="text-xs text-violet-500">
            Esta métrica muestra el ingreso potencial si la ocupación mejora al 100% en los días restantes del mes.
          </p>
        </div>
      </div>

      {/* ── Chart + Rankings ─────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

        {/* Revenue comparison chart */}
        <div className="lg:col-span-3 bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h3 className="font-semibold text-slate-800" style={{ fontFamily: 'Manrope, sans-serif' }}>
            Comparativo de Ingresos
          </h3>
          <p className="text-xs text-slate-400 mt-0.5 mb-5">Hotel vs Jardines — últimos meses</p>
          {chart.length > 0 ? (
            <ResponsiveContainer width="100%" height={210}>
              <BarChart data={chart} margin={{ top: 0, right: 5, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }}
                  axisLine={false} tickLine={false} />
                <YAxis tickFormatter={v => `$${(v / 1000).toFixed(0)}k`}
                  tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
                  formatter={(v) => [`${fmt(v)} MXN`]}
                  cursor={{ fill: '#f8fafc' }} />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: 12 }} />
                <Bar dataKey="hotel"   name="Hotel Boutique"     fill="#10b981" radius={[3,3,0,0]} />
                <Bar dataKey="eventos" name="Jardín de Amargati" fill="#8b5cf6" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-48 flex items-center justify-center text-slate-400 text-sm">
              Sin datos disponibles
            </div>
          )}
        </div>

        {/* Property Ranking + Score */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="font-semibold text-slate-800" style={{ fontFamily: 'Manrope, sans-serif' }}>
              Top Propiedades
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">Ordenadas por ingresos del mes</p>
          </div>

          <div className="flex-1 divide-y divide-slate-50">
            {ranking.length === 0 ? (
              <div className="px-5 py-10 text-center text-slate-400 text-sm">Sin datos de ingresos</div>
            ) : ranking.map((p, i) => (
              <div key={p.rank_id} data-testid={`ranking-row-${i}`}
                className="px-5 py-4 flex items-center gap-3">
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0
                  ${i === 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    {p.type === 'hotel'
                      ? <BedDouble size={12} className="text-emerald-600 flex-shrink-0" strokeWidth={1.5} />
                      : <Sparkles  size={12} className="text-violet-600 flex-shrink-0" strokeWidth={1.5} />
                    }
                    <p className="font-semibold text-slate-800 text-xs truncate">{p.name}</p>
                    {i === 0 && (
                      <span className="text-xs bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded-full font-medium flex-shrink-0">
                        Top
                      </span>
                    )}
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700" style={{
                      width: `${ranking[0]?.monthly_revenue > 0
                        ? (p.monthly_revenue / ranking[0].monthly_revenue * 100) : 0}%`,
                      background: i === 0 ? '#625746' : '#94a3b8',
                    }} />
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-bold text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>
                    {fmt(p.monthly_revenue)}
                  </p>
                  <p className="text-xs font-semibold mt-0.5"
                    style={{ color: p.score >= 70 ? '#10b981' : p.score >= 50 ? '#f59e0b' : '#ef4444' }}>
                    {p.score}/100
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Performance gauges */}
          <div className="px-5 py-5 bg-slate-50 border-t border-slate-100">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4">
              Performance Score
            </p>
            <div className="flex items-center justify-around">
              <ScoreRing score={hotel.performance_score ?? 0}  label={hotel.property_name?.split(' ')[0] || 'Hotel'} />
              <div className="w-px h-16 bg-slate-200" />
              <ScoreRing score={garden.performance_score ?? 0} label="Jardines" />
            </div>
          </div>
        </div>
      </div>

      {/* ── Reservation Source Distribution ──────────────────── */}
      {sources.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h3 className="font-semibold text-slate-800" style={{ fontFamily: 'Manrope, sans-serif' }}>
            Origen de Reservas
          </h3>
          <p className="text-xs text-slate-400 mt-0.5 mb-5">Distribución por canal de captación</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {sources.map((s, i) => (
              <div key={s.source} data-testid={`source-${s.source}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-slate-700">{s.label}</span>
                  <span className="text-sm font-bold text-slate-900">{s.count}</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${(s.count / maxSrc) * 100}%`,
                      background: CHART_COLORS[i % CHART_COLORS.length]
                    }} />
                </div>
                <p className="text-xs text-slate-400 mt-1.5">{fmt(s.revenue)} MXN</p>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
