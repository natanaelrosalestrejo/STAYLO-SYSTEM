import { useState, useEffect } from 'react';
import api from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { useProperty } from '../contexts/PropertyContext';
import { toast } from 'sonner';
import {
  Plus, Search, Calendar, Users, DollarSign, CheckCircle, XCircle,
  Clock, ChevronDown, Sparkles, Eye, Trash2, ChevronLeft, ChevronRight as ChevronRightIcon
} from 'lucide-react';

const EVENT_TYPES = {
  wedding:   { label: 'Boda',          color: 'bg-pink-50 text-pink-700' },
  corporate: { label: 'Corporativo',   color: 'bg-blue-50 text-blue-700' },
  birthday:  { label: 'Cumpleaños',    color: 'bg-amber-50 text-amber-700' },
  social:    { label: 'Social',        color: 'bg-violet-50 text-violet-700' },
  other:     { label: 'Otro',          color: 'bg-slate-100 text-slate-600' },
};

const BOOKING_STATUS = {
  confirmed: { label: 'Confirmado',  cls: 'status-reserved' },
  pending:   { label: 'Pendiente',   cls: 'status-cleaning' },
  cancelled: { label: 'Cancelado',   cls: 'status-maintenance' },
};

const PAY_STATUS = {
  paid:    { label: 'Pagado',   cls: 'bg-emerald-50 text-emerald-700' },
  pending: { label: 'Pendiente', cls: 'bg-amber-50 text-amber-700' },
};

const fmt = (n) => `$${Number(n || 0).toLocaleString('es-MX')}`;

const EventTypeBadge = ({ type }) => {
  const c = EVENT_TYPES[type] || EVENT_TYPES.other;
  return <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${c.color}`}>{c.label}</span>;
};

const StatusBadge = ({ s }) => {
  const c = BOOKING_STATUS[s] || { label: s, cls: '' };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${c.cls}`}>{c.label}</span>;
};

const PayBadge = ({ s }) => {
  const c = PAY_STATUS[s] || PAY_STATUS.pending;
  return <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${c.cls}`}>{c.label}</span>;
};

const EMPTY_FORM = {
  event_space_id: '', client_name: '', client_email: '', client_phone: '',
  event_date: '', event_type: 'wedding', attendees: '', total_price: '',
  booking_status: 'confirmed', notes: '', reservation_source: 'reception',
};

export default function EventGarden() {
  const { user } = useAuth();
  const { properties } = useProperty();
  const [spaces, setSpaces] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('bookings'); // bookings | spaces | calendar
  const [showModal, setShowModal] = useState(false);
  const [detailBooking, setDetailBooking] = useState(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  // Calendar state
  const [calMonth, setCalMonth] = useState(() => {
    const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() };
  });

  const gardenProp = properties.find(p => p.type === 'event_garden');
  const isAdmin = user?.role === 'admin';
  const isReceptionist = ['admin', 'receptionist'].includes(user?.role);

  const fetchData = async () => {
    try {
      const propId = gardenProp?.id;
      const [s, b] = await Promise.all([
        api.get('/event-spaces' + (propId ? `?property_id=${propId}` : '')),
        api.get('/event-bookings' + (propId ? `?property_id=${propId}` : '')),
      ]);
      setSpaces(s.data);
      setBookings(b.data);
    } catch (e) {}
  };

  useEffect(() => {
    fetchData();
  }, [gardenProp?.id]);

  const filtered = bookings.filter(b => {
    const q = search.toLowerCase();
    return !q || b.client_name?.toLowerCase().includes(q) || b.event_type?.toLowerCase().includes(q);
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.event_space_id || !form.client_name || !form.event_date || !form.event_type) {
      toast.error('Completa los campos requeridos');
      return;
    }
    setLoading(true);
    try {
      await api.post('/event-bookings', {
        ...form,
        property_id: gardenProp?.id || '',
        attendees: parseInt(form.attendees) || 0,
        total_price: parseFloat(form.total_price) || 0,
      });
      toast.success('Reserva de evento creada');
      setShowModal(false);
      setForm(EMPTY_FORM);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al crear reserva');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (id, field, value) => {
    try {
      await api.patch(`/event-bookings/${id}/status`, { [field]: value });
      toast.success('Estado actualizado');
      fetchData();
    } catch { toast.error('Error al actualizar'); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Eliminar esta reserva?')) return;
    try {
      await api.delete(`/event-bookings/${id}`);
      toast.success('Reserva eliminada');
      fetchData();
    } catch { toast.error('Error al eliminar'); }
  };

  // Metrics
  const totalRevenue = bookings.filter(b => b.booking_status !== 'cancelled').reduce((s, b) => s + (b.total_price || 0), 0);
  const pendingPayments = bookings.filter(b => b.payment_status === 'pending' && b.booking_status !== 'cancelled').length;
  const confirmedEvents = bookings.filter(b => b.booking_status === 'confirmed').length;
  const today = new Date().toISOString().split('T')[0];
  const upcoming = bookings.filter(b => b.event_date >= today && b.booking_status === 'confirmed').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>
            Jardín de Amargati
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Gestión de eventos y espacios</p>
        </div>
        {isReceptionist && (
          <button
            data-testid="new-event-booking-btn"
            onClick={() => { setForm(EMPTY_FORM); setShowModal(true); }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors"
            style={{ background: '#625746' }}>
            <Plus size={16} />Nueva Reserva
          </button>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Ingresos Totales', value: fmt(totalRevenue), icon: DollarSign, color: 'text-emerald-600', bg: 'bg-emerald-50', testId: 'garden-revenue' },
          { label: 'Eventos Confirmados', value: confirmedEvents, icon: CheckCircle, color: 'text-blue-600', bg: 'bg-blue-50', testId: 'garden-confirmed' },
          { label: 'Próximos Eventos', value: upcoming, icon: Calendar, color: 'text-violet-600', bg: 'bg-violet-50', testId: 'garden-upcoming' },
          { label: 'Cobros Pendientes', value: pendingPayments, icon: Clock, color: pendingPayments > 0 ? 'text-red-500' : 'text-slate-400', bg: pendingPayments > 0 ? 'bg-red-50' : 'bg-slate-50', testId: 'garden-pending' },
        ].map(({ label, value, icon: Icon, color, bg, testId }) => (
          <div key={label} data-testid={testId} className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 font-medium">{label}</p>
                <p className="text-xl font-bold text-slate-900 mt-1" style={{ fontFamily: 'Manrope, sans-serif' }}>{value}</p>
              </div>
              <div className={`w-9 h-9 ${bg} rounded-lg flex items-center justify-center`}>
                <Icon size={18} className={color} strokeWidth={1.5} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
        {[
          { key: 'bookings', label: `Reservas (${bookings.length})` },
          { key: 'spaces', label: `Espacios (${spaces.length})` },
          { key: 'calendar', label: 'Calendario' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${tab === t.key ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Search */}
      {tab === 'bookings' && (
        <div className="relative w-full max-w-xs">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            data-testid="garden-search"
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar cliente o tipo..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-offset-1"
            style={{ '--tw-ring-color': '#625746' }}
          />
        </div>
      )}

      {/* Bookings Table */}
      {tab === 'bookings' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100" style={{ background: '#faf8f3' }}>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Cliente</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Espacio</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Fecha</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Tipo</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Total</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Estado</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Pago</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-10 text-slate-400 text-sm">No hay reservas de eventos</td>
                  </tr>
                ) : filtered.map(b => (
                  <tr key={b.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800">{b.client_name}</p>
                      <p className="text-xs text-slate-400">{b.attendees} personas</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600 text-xs">{b.event_space_name}</td>
                    <td className="px-4 py-3 text-slate-600 text-xs">{b.event_date}</td>
                    <td className="px-4 py-3"><EventTypeBadge type={b.event_type} /></td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-800">{fmt(b.total_price)}</td>
                    <td className="px-4 py-3">
                      {isReceptionist ? (
                        <select
                          value={b.booking_status}
                          onChange={e => handleStatusChange(b.id, 'booking_status', e.target.value)}
                          className="text-xs border border-slate-200 rounded px-2 py-1 bg-white focus:outline-none">
                          <option value="confirmed">Confirmado</option>
                          <option value="pending">Pendiente</option>
                          <option value="cancelled">Cancelado</option>
                        </select>
                      ) : <StatusBadge s={b.booking_status} />}
                    </td>
                    <td className="px-4 py-3">
                      {isReceptionist ? (
                        <select
                          value={b.payment_status}
                          onChange={e => handleStatusChange(b.id, 'payment_status', e.target.value)}
                          className="text-xs border border-slate-200 rounded px-2 py-1 bg-white focus:outline-none">
                          <option value="pending">Pendiente</option>
                          <option value="paid">Pagado</option>
                        </select>
                      ) : <PayBadge s={b.payment_status} />}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          data-testid={`view-event-${b.id}`}
                          onClick={() => setDetailBooking(b)}
                          className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                          <Eye size={14} />
                        </button>
                        {isAdmin && (
                          <button
                            data-testid={`delete-event-${b.id}`}
                            onClick={() => handleDelete(b.id)}
                            className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors">
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Spaces Tab */}
      {tab === 'spaces' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {spaces.length === 0 ? (
            <div className="col-span-3 text-center py-12 text-slate-400">No hay espacios registrados</div>
          ) : spaces.map(s => (
            <div key={s.id} data-testid={`space-card-${s.id}`}
              className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-violet-50">
                  <Sparkles size={20} className="text-violet-600" strokeWidth={1.5} />
                </div>
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${s.status === 'available' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                  {s.status === 'available' ? 'Disponible' : 'Ocupado'}
                </span>
              </div>
              <h3 className="font-semibold text-slate-800 mb-1" style={{ fontFamily: 'Manrope, sans-serif' }}>{s.space_name}</h3>
              {s.description && <p className="text-xs text-slate-500 mb-3 leading-relaxed">{s.description}</p>}
              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                <span className="flex items-center gap-1 text-xs text-slate-500">
                  <Users size={12} /> Capacidad: {s.capacity}
                </span>
                {s.price_per_event && (
                  <span className="text-xs font-semibold text-emerald-700">{fmt(s.price_per_event)}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* New Booking Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-5 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>
                Nueva Reserva de Evento
              </h2>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Espacio *</label>
                <select data-testid="form-space" value={form.event_space_id}
                  onChange={e => setForm(f => ({ ...f, event_space_id: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                  style={{ '--tw-ring-color': '#625746' }} required>
                  <option value="">Seleccionar espacio</option>
                  {spaces.map(s => (
                    <option key={s.id} value={s.id}>{s.space_name} (cap. {s.capacity})</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Nombre del cliente *</label>
                  <input data-testid="form-client-name" value={form.client_name}
                    onChange={e => setForm(f => ({ ...f, client_name: e.target.value }))}
                    placeholder="Ej: Familia Rodríguez"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                    style={{ '--tw-ring-color': '#625746' }} required />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Tipo de evento *</label>
                  <select data-testid="form-event-type" value={form.event_type}
                    onChange={e => setForm(f => ({ ...f, event_type: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                    style={{ '--tw-ring-color': '#625746' }}>
                    {Object.entries(EVENT_TYPES).map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Email</label>
                  <input value={form.client_email}
                    onChange={e => setForm(f => ({ ...f, client_email: e.target.value }))}
                    type="email" placeholder="cliente@email.com"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                    style={{ '--tw-ring-color': '#625746' }} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Teléfono</label>
                  <input value={form.client_phone}
                    onChange={e => setForm(f => ({ ...f, client_phone: e.target.value }))}
                    placeholder="+52 55 0000 0000"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                    style={{ '--tw-ring-color': '#625746' }} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Fecha del evento *</label>
                  <input data-testid="form-event-date" value={form.event_date}
                    onChange={e => setForm(f => ({ ...f, event_date: e.target.value }))}
                    type="date"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                    style={{ '--tw-ring-color': '#625746' }} required />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">No. de asistentes</label>
                  <input value={form.attendees}
                    onChange={e => setForm(f => ({ ...f, attendees: e.target.value }))}
                    type="number" min="1" placeholder="0"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                    style={{ '--tw-ring-color': '#625746' }} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Total del evento (MXN)</label>
                <input data-testid="form-total-price" value={form.total_price}
                  onChange={e => setForm(f => ({ ...f, total_price: e.target.value }))}
                  type="number" min="0" step="100" placeholder="0.00"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                  style={{ '--tw-ring-color': '#625746' }} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Notas</label>
                <textarea value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  rows={2} placeholder="Detalles del evento, requerimientos especiales..."
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 resize-none"
                  style={{ '--tw-ring-color': '#625746' }} />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)}
                  className="flex-1 py-2.5 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
                  Cancelar
                </button>
                <button data-testid="submit-event-booking" type="submit" disabled={loading}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white transition-colors disabled:opacity-50"
                  style={{ background: '#625746' }}>
                  {loading ? 'Guardando...' : 'Crear Reserva'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {detailBooking && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setDetailBooking(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>
                Detalle del Evento
              </h2>
              <button onClick={() => setDetailBooking(null)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors">
                <XCircle size={18} />
              </button>
            </div>
            <div className="px-6 py-5 space-y-3">
              {[
                { label: 'Cliente', value: detailBooking.client_name },
                { label: 'Espacio', value: detailBooking.event_space_name },
                { label: 'Fecha', value: detailBooking.event_date },
                { label: 'Tipo', value: <EventTypeBadge type={detailBooking.event_type} /> },
                { label: 'Asistentes', value: detailBooking.attendees },
                { label: 'Total', value: fmt(detailBooking.total_price) },
                { label: 'Estado', value: <StatusBadge s={detailBooking.booking_status} /> },
                { label: 'Pago', value: <PayBadge s={detailBooking.payment_status} /> },
                ...(detailBooking.client_email ? [{ label: 'Email', value: detailBooking.client_email }] : []),
                ...(detailBooking.client_phone ? [{ label: 'Teléfono', value: detailBooking.client_phone }] : []),
                ...(detailBooking.notes ? [{ label: 'Notas', value: detailBooking.notes }] : []),
              ].map(({ label, value }) => (
                <div key={label} className="flex items-start justify-between gap-2">
                  <span className="text-xs text-slate-500 font-medium w-24 flex-shrink-0">{label}</span>
                  <span className="text-sm text-slate-800 text-right">{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Calendar View */}
      {tab === 'calendar' && (() => {
        const { year, month } = calMonth;
        const monthNames = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
        const dayNames = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;
        const monthBookings = bookings.filter(b => b.event_date?.startsWith(monthStr) && b.booking_status !== 'cancelled');
        const byDay = {};
        monthBookings.forEach(b => {
          const day = parseInt(b.event_date?.split('-')[2] || 0);
          if (!byDay[day]) byDay[day] = [];
          byDay[day].push(b);
        });
        const today = new Date().toISOString().split('T')[0];
        const prevMonth = () => setCalMonth(c => {
          if (c.month === 0) return { year: c.year - 1, month: 11 };
          return { year: c.year, month: c.month - 1 };
        });
        const nextMonth = () => setCalMonth(c => {
          if (c.month === 11) return { year: c.year + 1, month: 0 };
          return { year: c.year, month: c.month + 1 };
        });
        return (
          <div className="space-y-4" data-testid="garden-calendar">
            {/* Month navigator */}
            <div className="flex items-center justify-between bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-3">
              <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-slate-500"><ChevronLeft size={18} /></button>
              <h3 className="font-semibold text-slate-800 text-base" style={{ fontFamily: 'Manrope, sans-serif' }}>
                {monthNames[month]} {year}
              </h3>
              <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-slate-500"><ChevronRightIcon size={18} /></button>
            </div>
            {/* Calendar grid */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              {/* Day headers */}
              <div className="grid grid-cols-7 border-b border-slate-100">
                {dayNames.map(d => (
                  <div key={d} className="py-2 text-center text-xs font-semibold text-slate-400 uppercase tracking-wide">{d}</div>
                ))}
              </div>
              {/* Day cells */}
              <div className="grid grid-cols-7">
                {Array.from({ length: firstDay }).map((_, i) => (
                  <div key={`empty-${i}`} className="min-h-[80px] border-r border-b border-slate-50 bg-slate-50/50" />
                ))}
                {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
                  const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                  const isToday = dateStr === today;
                  const dayEvents = byDay[day] || [];
                  return (
                    <div key={day} className={`min-h-[80px] p-2 border-r border-b border-slate-50 transition-colors ${dayEvents.length > 0 ? 'bg-white' : 'bg-white hover:bg-slate-50/50'}`}>
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-medium mb-1 ${isToday ? 'text-white' : 'text-slate-600'}`}
                        style={isToday ? { background: '#625746' } : {}}>
                        {day}
                      </div>
                      <div className="space-y-0.5">
                        {dayEvents.slice(0, 2).map(b => {
                          const et = EVENT_TYPES[b.event_type] || EVENT_TYPES.other;
                          return (
                            <button key={b.id} onClick={() => setDetailBooking(b)}
                              className={`w-full text-left px-1.5 py-0.5 rounded text-xs font-medium truncate ${et.color} transition-opacity hover:opacity-80`}>
                              {b.client_name}
                            </button>
                          );
                        })}
                        {dayEvents.length > 2 && (
                          <p className="text-xs text-slate-400 px-1.5">+{dayEvents.length - 2} más</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            {/* Month events list */}
            {monthBookings.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                <h4 className="font-semibold text-slate-700 text-sm mb-3">{monthBookings.length} evento(s) en {monthNames[month]}</h4>
                <div className="space-y-2">
                  {monthBookings.sort((a,b) => a.event_date.localeCompare(b.event_date)).map(b => {
                    const et = EVENT_TYPES[b.event_type] || EVENT_TYPES.other;
                    return (
                      <div key={b.id} className="flex items-center gap-3 p-2.5 rounded-lg border border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors"
                        onClick={() => setDetailBooking(b)}>
                        <div className="text-xs font-bold text-slate-400 w-10 text-center flex-shrink-0">
                          {b.event_date?.split('-')[2]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">{b.client_name}</p>
                          <p className="text-xs text-slate-400">{b.event_space_name}</p>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold flex-shrink-0 ${et.color}`}>{et.label}</span>
                        <span className="text-sm font-semibold text-slate-700 flex-shrink-0">{fmt(b.total_price)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
