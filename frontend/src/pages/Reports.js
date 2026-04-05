/**
 * Reportes por rol:
 * - owner: vista amplia (estratégica / consolidada) + operativo cuando aplica.
 * - finance: hogar financiero; solo secciones de ingresos/cobros/desgloses; sin widgets operativos de habitación.
 * - manager con solo manager_financial_view: mismo alcance acotado que finance (sin módulo reports).
 * - manager con módulo reports: informe completo; textos acotados a propiedades si no es owner.
 */
import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../utils/api';
import { routeSatisfiedByModules } from '../utils/permissions';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { TrendingUp, BedDouble, Users, CalendarCheck, Hotel, CalendarDays, Download, Globe, Phone, MessageCircle } from 'lucide-react';

const MONTH_NAMES = { '01': 'Ene', '02': 'Feb', '03': 'Mar', '04': 'Abr', '05': 'May', '06': 'Jun', '07': 'Jul', '08': 'Ago', '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dic' };
const TYPE_LABELS = { junior_suite: 'Junior Suite', double: 'Doble', single: 'Individual', suite: 'Suite' };
const STATUS_LABELS = { available: 'Disponible', occupied: 'Ocupada', cleaning: 'Limpieza', maintenance: 'Mant.', reserved: 'Reservada' };
const COLORS = ['#625746', '#917a6a', '#d2c7b6', '#3B82F6', '#8B5CF6'];
const SOURCE_ICONS = { web: Globe, reception: CalendarCheck, whatsapp: MessageCircle, other: Phone };

const KpiCard = ({ label, value, sub, icon: Icon, color, bgColor }) => (
  <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm text-slate-500 mb-1">{label}</p>
        <p className="text-2xl font-bold text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>{value}</p>
        {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
      </div>
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${bgColor}`}>
        <Icon size={20} className={color} strokeWidth={1.5} />
      </div>
    </div>
  </div>
);

export default function Reports() {
  const { user } = useAuth();
  const role = user?.role;
  const mods = Array.isArray(user?.modules) ? user.modules : [];
  const isFinance = role === 'finance';
  const isOwner = role === 'owner';
  const isGroupOpsManager = role === 'manager';
  const hasFullReportsModule = mods.includes('reports');
  const hasManagerFinancialView = mods.includes('manager_financial_view');
  const canExportCsv = routeSatisfiedByModules(mods, 'reports');
  /** Sin /reports/dashboard: solo ingresos/cobros/desgloses (finance o gerente solo con vista financiera). */
  const narrowFinancialUi =
    isFinance || (role === 'manager' && hasManagerFinancialView && !hasFullReportsModule);
  /** Copy de portafolio / consolidado (alineado con scope amplio owner+gerente de grupo en backend). */
  const strategicPortfolioCopy = isOwner || isGroupOpsManager;

  const [stats, setStats] = useState(null);
  const [occupancy, setOccupancy] = useState(null);
  const [revenue, setRevenue] = useState(null);
  const [insights, setInsights] = useState(null);

  useEffect(() => {
    if (!user) return;
    const fetchAll = async () => {
      try {
        if (narrowFinancialUi) {
          setStats(null);
          const [o, r, i] = await Promise.all([
            api.get('/reports/occupancy'),
            api.get('/reports/revenue-breakdown'),
            api.get('/reports/insights'),
          ]);
          setOccupancy(o.data);
          setRevenue(r.data);
          setInsights(i.data);
          return;
        }
        const [s, o, r, i] = await Promise.all([
          api.get('/reports/dashboard'),
          api.get('/reports/occupancy'),
          api.get('/reports/revenue-breakdown'),
          api.get('/reports/insights'),
        ]);
        setStats(s.data);
        setOccupancy(o.data);
        setRevenue(r.data);
        setInsights(i.data);
      } catch (e) {}
    };
    fetchAll();
  }, [user, narrowFinancialUi]);

  const handleExportCSV = () => {
    if (!canExportCsv) return;
    window.open(`${process.env.REACT_APP_BACKEND_URL}/api/reports/export/csv`, '_blank');
  };

  const monthlyData = occupancy?.monthly.map(m => ({
    ...m, mes: MONTH_NAMES[m.month?.split('-')[1]] || m.month,
  })) || [];

  const roomTypeData = occupancy?.room_types.map(r => ({
    name: TYPE_LABELS[r.type] || r.type, value: r.count,
  })) || [];

  const roomStatusData = occupancy?.room_statuses.map(r => ({
    name: STATUS_LABELS[r.status] || r.status, value: r.count,
  })) || [];

  const totalRev = revenue?.total_revenue || 0;
  const hotelPct = totalRev > 0 ? Math.round((revenue?.hotel_revenue / totalRev) * 100) : 0;
  const eventPct = totalRev > 0 ? Math.round((revenue?.event_revenue / totalRev) * 100) : 0;

  const revenueHotelLabel = strategicPortfolioCopy ? 'POR HOTEL' : 'HOSPEDAJE';
  const revenueTotalFootnote = strategicPortfolioCopy ? 'MXN · hotel + eventos' : 'MXN · alcance asignado en el sistema';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>
            {isFinance ? 'Reportes financieros' : 'Reportes y Estadísticas'}
          </h1>
          <p className="text-sm text-slate-500">
            {isFinance
              ? 'Ingresos, cobros y desgloses. Este es tu espacio principal de análisis financiero.'
              : strategicPortfolioCopy
                ? 'Análisis del rendimiento del hotel — vista consolidada estratégica y operativa.'
                : 'Indicadores según el alcance de tus propiedades asignadas (financiero y operativo donde aplica).'}
          </p>
        </div>
        {canExportCsv ? (
        <button data-testid="export-csv-btn" onClick={handleExportCSV}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all hover:bg-slate-100"
          style={{ border: '1px solid #e2e8f0', color: '#475569' }}>
          <Download size={15} /> Exportar CSV
        </button>
        ) : (
        <span data-testid="export-csv-unavailable" className="text-xs text-slate-400" title="Tu perfil no incluye exportación CSV (módulo reportes).">
          Exportación CSV no disponible
        </span>
        )}
      </div>

      {/* Revenue Insights */}
      {insights && (
        <div className={`grid grid-cols-2 gap-3 ${narrowFinancialUi ? 'md:grid-cols-3' : 'md:grid-cols-4'}`}>
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <p className="text-xs text-slate-400 mb-1">Ingresos este mes</p>
            <p className="text-xl font-bold text-slate-900">${(insights.month_revenue || 0).toLocaleString('es-MX')}</p>
            <p className="text-xs text-slate-400 mt-1">{insights.month_reservations} reservas</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <p className="text-xs text-slate-400 mb-1">Proyección fin de mes</p>
            <p className="text-xl font-bold text-emerald-700">${(insights.projected_month_revenue || 0).toLocaleString('es-MX')}</p>
            <p className="text-xs text-slate-400 mt-1">estimado</p>
          </div>
          {!narrowFinancialUi && (
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <p className="text-xs text-slate-400 mb-1">Ingresos perdidos (cuartos vacíos)</p>
            <p className="text-xl font-bold text-red-500">${(insights.estimated_lost_revenue || 0).toLocaleString('es-MX')}</p>
            <p className="text-xs text-slate-400 mt-1">oportunidad</p>
          </div>
          )}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <p className="text-xs text-slate-400 mb-1">Cobros pendientes</p>
            <p className="text-xl font-bold text-amber-600">${(insights.pending_payments_amount || 0).toLocaleString('es-MX')}</p>
            <p className="text-xs text-slate-400 mt-1">{insights.pending_payments_count} reservas</p>
          </div>
        </div>
      )}

      {/* ---- DESGLOSE DE INGRESOS ---- */}
      <div className="rounded-2xl border p-6" style={{ background: 'linear-gradient(135deg, #625746 0%, #917a6a 100%)', borderColor: '#625746' }}>
        <p className="text-xs font-semibold tracking-widest mb-5" style={{ color: '#d2c7b6', fontFamily: 'Montserrat, sans-serif' }}>
          DESGLOSE DE INGRESOS
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-xl p-5" style={{ background: 'rgba(252,245,224,0.1)', border: '1px solid rgba(210,199,182,0.25)' }} data-testid="revenue-hotel-card">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(252,245,224,0.15)' }}>
                <Hotel size={15} style={{ color: '#d2c7b6' }} strokeWidth={1.5} />
              </div>
              <span style={{ color: '#d2c7b6', fontSize: '11px', fontWeight: 600, letterSpacing: '0.12em', fontFamily: 'Montserrat, sans-serif' }}>{revenueHotelLabel}</span>
            </div>
            <p className="font-bold" style={{ color: '#fcf5e0', fontSize: '26px', fontFamily: 'Manrope, sans-serif' }}>
              ${(revenue?.hotel_revenue || 0).toLocaleString('es-MX')}
            </p>
            <p style={{ color: 'rgba(210,199,182,0.7)', fontSize: '12px', marginTop: 4 }}>
              {revenue?.hotel_reservations || 0} reservas · {hotelPct}% del total
            </p>
          </div>
          <div className="rounded-xl p-5" style={{ background: 'rgba(252,245,224,0.1)', border: '1px solid rgba(210,199,182,0.25)' }} data-testid="revenue-events-card">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(252,245,224,0.15)' }}>
                <CalendarDays size={15} style={{ color: '#d2c7b6' }} strokeWidth={1.5} />
              </div>
              <span style={{ color: '#d2c7b6', fontSize: '11px', fontWeight: 600, letterSpacing: '0.12em', fontFamily: 'Montserrat, sans-serif' }}>POR EVENTO</span>
            </div>
            <p className="font-bold" style={{ color: '#fcf5e0', fontSize: '26px', fontFamily: 'Manrope, sans-serif' }}>
              ${(revenue?.event_revenue || 0).toLocaleString('es-MX')}
            </p>
            <p style={{ color: 'rgba(210,199,182,0.7)', fontSize: '12px', marginTop: 4 }}>
              {revenue?.event_reservations || 0} reservas · {eventPct}% del total
            </p>
          </div>
          <div className="rounded-xl p-5" style={{ background: 'rgba(252,245,224,0.18)', border: '1px solid rgba(252,245,224,0.3)' }} data-testid="revenue-total-card">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(252,245,224,0.2)' }}>
                <TrendingUp size={15} style={{ color: '#fcf5e0' }} strokeWidth={1.5} />
              </div>
              <span style={{ color: '#fcf5e0', fontSize: '11px', fontWeight: 600, letterSpacing: '0.12em', fontFamily: 'Montserrat, sans-serif' }}>TOTAL</span>
            </div>
            <p className="font-bold" style={{ color: '#fcf5e0', fontSize: '26px', fontFamily: 'Manrope, sans-serif' }}>
              ${totalRev.toLocaleString('es-MX')}
            </p>
            <p style={{ color: 'rgba(252,245,224,0.6)', fontSize: '12px', marginTop: 4 }}>{revenueTotalFootnote}</p>
          </div>
        </div>
        {totalRev > 0 && (
          <div className="mt-5">
            <div className="flex rounded-full overflow-hidden h-2" style={{ background: 'rgba(255,255,255,0.1)' }}>
              <div style={{ width: `${hotelPct}%`, background: '#fcf5e0', transition: 'width 0.8s ease' }} />
              <div style={{ width: `${eventPct}%`, background: '#d2c7b6', transition: 'width 0.8s ease' }} />
            </div>
            <div className="flex gap-4 mt-2">
              <span style={{ color: 'rgba(210,199,182,0.7)', fontSize: '11px' }}><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: '#fcf5e0', marginRight: 4 }} />Hotel {hotelPct}%</span>
              <span style={{ color: 'rgba(210,199,182,0.7)', fontSize: '11px' }}><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: '#d2c7b6', marginRight: 4 }} />Eventos {eventPct}%</span>
            </div>
          </div>
        )}
      </div>

      {/* Desglose por canal (ingresos) */}
      {insights?.source_breakdown?.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5" data-testid="source-breakdown">
          <h3 className="font-semibold text-slate-800 mb-4" style={{ fontFamily: 'Manrope, sans-serif' }}>
            {narrowFinancialUi ? 'Ingresos por canal' : 'Origen de Reservas'}
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {insights.source_breakdown.map(s => {
              const Icon = SOURCE_ICONS[s.source] || Phone;
              return (
                <div key={s.source} className="p-3 rounded-xl bg-slate-50">
                  <div className="flex items-center gap-2 mb-2">
                    <Icon size={14} className="text-slate-500" />
                    <span className="text-xs font-semibold text-slate-600">{s.label}</span>
                  </div>
                  <p className="text-lg font-bold text-slate-900">{s.count}</p>
                  <p className="text-xs text-slate-400">${s.revenue.toLocaleString('es-MX')}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Events breakdown */}
      {(revenue?.events_breakdown?.length > 0) ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden" data-testid="events-breakdown-table">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="font-semibold text-slate-800" style={{ fontFamily: 'Manrope, sans-serif' }}>
              {narrowFinancialUi ? 'Ingresos vinculados a eventos' : 'Impacto por Evento'}
            </h3>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50"><tr>{['Evento','Reservas','Ingresos','% del total'].map(h=><th key={h} className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">
              {revenue.events_breakdown.map(ev => (
                <tr key={ev.event_name} className="hover:bg-slate-50">
                  <td className="px-5 py-3 font-medium text-slate-800">{ev.event_name}</td>
                  <td className="px-5 py-3 text-slate-600">{ev.reservaciones}</td>
                  <td className="px-5 py-3 font-semibold" style={{ color: '#625746' }}>${ev.ingresos.toLocaleString('es-MX')}</td>
                  <td className="px-5 py-3"><div className="flex items-center gap-2"><div className="flex-1 h-1.5 rounded-full bg-slate-100 max-w-24"><div className="h-1.5 rounded-full" style={{ width:`${revenue.event_revenue>0?Math.round(ev.ingresos/revenue.event_revenue*100):0}%`,background:'#917a6a' }}/></div><span className="text-xs text-slate-500">{revenue.event_revenue>0?Math.round(ev.ingresos/revenue.event_revenue*100):0}%</span></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : !narrowFinancialUi ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h3 className="font-semibold text-slate-800 mb-1" style={{ fontFamily: 'Manrope, sans-serif' }}>Impacto por Evento</h3>
          <p className="text-sm text-slate-400">Aquí aparecerán los eventos cuando los huéspedes indiquen a qué evento vienen al reservar.</p>
        </div>
      ) : null}

      {/* KPIs operativos desde /reports/dashboard */}
      {!narrowFinancialUi && (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Total Reservas" value={stats?.total_reservations || 0} icon={CalendarCheck} bgColor="bg-blue-50" color="text-blue-600" />
        <KpiCard label="Ocupación Actual" value={`${stats?.occupancy_rate || 0}%`} icon={BedDouble} bgColor="bg-violet-50" color="text-violet-600" />
        <KpiCard label="Huéspedes Registrados" value={stats?.total_guests || 0} icon={Users} bgColor="bg-amber-50" color="text-amber-600" />
        <KpiCard label="Cobros Pendientes" value={stats?.pending_payments || 0} icon={TrendingUp} bgColor="bg-red-50" color="text-red-500" sub={stats?.pending_payments > 0 ? 'Por cobrar en hotel' : 'Todo al día'} />
      </div>
      )}

      {/* Gráficas mensuales */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {!narrowFinancialUi && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h3 className="font-semibold text-slate-800 mb-4" style={{ fontFamily: 'Manrope, sans-serif' }}>Reservas Mensuales</h3>
          {monthlyData.length === 0 ? (<div className="h-48 flex items-center justify-center text-slate-400 text-sm">Sin datos aún</div>) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={monthlyData} margin={{ top:0,right:0,left:-20,bottom:0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="mes" tick={{ fontSize:12,fill:'#64748B' }} />
                <YAxis tick={{ fontSize:12,fill:'#64748B' }} />
                <Tooltip contentStyle={{ borderRadius:'8px',border:'1px solid #E2E8F0',fontSize:12 }} />
                <Bar dataKey="reservaciones" name="Reservas" fill="#625746" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
        )}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h3 className="font-semibold text-slate-800 mb-4" style={{ fontFamily: 'Manrope, sans-serif' }}>Ingresos Mensuales (MXN)</h3>
          {monthlyData.length === 0 ? (<div className="h-48 flex items-center justify-center text-slate-400 text-sm">Sin datos aún</div>) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={monthlyData} margin={{ top:0,right:0,left:-20,bottom:0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="mes" tick={{ fontSize:12,fill:'#64748B' }} />
                <YAxis tick={{ fontSize:12,fill:'#64748B' }} />
                <Tooltip formatter={(v)=>`$${v.toLocaleString('es-MX')}`} contentStyle={{ borderRadius:'8px',border:'1px solid #E2E8F0',fontSize:12 }} />
                <Line type="monotone" dataKey="ingresos" name="Ingresos" stroke="#625746" strokeWidth={2} dot={{ fill:'#625746',r:4 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {!narrowFinancialUi && (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h3 className="font-semibold text-slate-800 mb-4" style={{ fontFamily: 'Manrope, sans-serif' }}>Tipos de Habitación</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart><Pie data={roomTypeData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} dataKey="value" nameKey="name" paddingAngle={4}>
              {roomTypeData.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}</Pie>
              <Tooltip contentStyle={{ borderRadius:'8px',fontSize:12 }} /><Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize:12 }} /></PieChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h3 className="font-semibold text-slate-800 mb-4" style={{ fontFamily: 'Manrope, sans-serif' }}>Estado de Habitaciones</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={roomStatusData} layout="vertical" margin={{ top:0,right:10,left:20,bottom:0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false} />
              <XAxis type="number" tick={{ fontSize:12,fill:'#64748B' }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize:12,fill:'#64748B' }} width={75} />
              <Tooltip contentStyle={{ borderRadius:'8px',fontSize:12 }} />
              <Bar dataKey="value" name="Hab." radius={[0,4,4,0]}>{roomStatusData.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      )}
    </div>
  );
}

