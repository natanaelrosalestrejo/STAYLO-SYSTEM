import { useState, useEffect } from 'react';
import api from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'sonner';
import { Plus, Search, LogIn, LogOut, X, CalendarCheck, DollarSign, AlertTriangle, Globe, Phone, MessageCircle, Eye } from 'lucide-react';

const STATUS_CONFIG = {
  confirmed: { label: 'Confirmada', cls: 'status-reserved' },
  checked_in: { label: 'En Hotel', cls: 'status-occupied' },
  checked_out: { label: 'Finalizada', cls: 'status-available' },
  cancelled: { label: 'Cancelada', cls: 'status-maintenance' },
  pending: { label: 'Pendiente', cls: 'status-cleaning' },
};

const SOURCE_CONFIG = {
  web:        { label: 'Web',        icon: Globe,          bg: '#ede9fe', color: '#5b21b6' },
  reception:  { label: 'Recepción',  icon: CalendarCheck,  bg: '#dbeafe', color: '#1e40af' },
  whatsapp:   { label: 'WhatsApp',   icon: MessageCircle,  bg: '#dcfce7', color: '#166534' },
  other:      { label: 'Otro',       icon: Phone,          bg: '#f1f5f9', color: '#475569' },
};

const StatusBadge = ({ s }) => {
  const c = STATUS_CONFIG[s] || { label: s, cls: '' };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${c.cls}`}>{c.label}</span>;
};

const SourceBadge = ({ source }) => {
  const c = SOURCE_CONFIG[source] || SOURCE_CONFIG.other;
  const Icon = c.icon;
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ background: c.bg, color: c.color }}>
      <Icon size={10} /> {c.label}
    </span>
  );
};

const TABS = [
  { key: 'all', label: 'Todas' },
  { key: 'today', label: 'Hoy' },
  { key: 'upcoming', label: 'Próximas' },
  { key: 'confirmed', label: 'Confirmadas' },
  { key: 'checked_in', label: 'En Hotel' },
  { key: 'checked_out', label: 'Finalizadas' },
  { key: 'cancelled', label: 'Canceladas' },
  { key: 'web', label: 'Web' },
  { key: 'pending_payment', label: 'Cobro Pend.' },
];

export default function Reservations() {
  const { user } = useAuth();
  const [reservations, setReservations] = useState([]);
  const [guests, setGuests] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [tab, setTab] = useState('all');
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ guest_id: '', room_id: '', check_in_date: '', check_out_date: '', adults: 1, children: 0, notes: '', reservation_source: 'reception' });
  const [checkinConfirm, setCheckinConfirm] = useState(null);
  const [detailReservation, setDetailReservation] = useState(null);

  const isReceptionist = ['admin', 'receptionist'].includes(user?.role);
  const today = new Date().toISOString().split('T')[0];

  const fetchData = async () => {
    try {
      const [r, g, rm] = await Promise.all([api.get('/reservations'), api.get('/guests'), api.get('/rooms')]);
      setReservations(r.data);
      setGuests(g.data);
      setRooms(rm.data.filter(r => ['available', 'reserved'].includes(r.status)));
    } catch (e) {}
  };

  useEffect(() => { fetchData(); }, []);

  const filtered = reservations.filter(r => {
    if (tab === 'today') return r.check_in_date === today || r.check_out_date === today;
    if (tab === 'upcoming') return r.check_in_date > today && r.status === 'confirmed';
    if (tab === 'web') return r.reservation_source === 'web';
    if (tab === 'pending_payment') return r.payment_status === 'pending';
    if (tab !== 'all' && r.status !== tab) return false;
    if (search && !r.guest_name.toLowerCase().includes(search.toLowerCase()) &&
      !r.room_number.includes(search) && !(r.event_name || '').toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }).filter(r => {
    if (!search) return true;
    return r.guest_name.toLowerCase().includes(search.toLowerCase()) ||
      r.room_number.includes(search) ||
      (r.event_name || '').toLowerCase().includes(search.toLowerCase());
  });

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.guest_id || !form.room_id || !form.check_in_date || !form.check_out_date) {
      toast.error('Completa todos los campos requeridos'); return;
    }
    setLoading(true);
    try {
      await api.post('/reservations', form);
      toast.success('Reserva creada exitosamente');
      setShowModal(false);
      setForm({ guest_id: '', room_id: '', check_in_date: '', check_out_date: '', adults: 1, children: 0, notes: '' });
      fetchData();
    } catch (e) { toast.error(e.response?.data?.detail || 'Error al crear reserva'); }
    finally { setLoading(false); }
  };

  const handleCheckin = async (id) => {
    try {
      await api.patch(`/reservations/${id}/checkin`);
      toast.success('Check-in realizado'); fetchData();
    } catch (e) { toast.error(e.response?.data?.detail || 'Error'); }
  };

  const handleCheckinRequest = (r) => {
    if (r.payment_status === 'pending') {
      setCheckinConfirm(r);
    } else {
      handleCheckin(r.id);
    }
  };

  const handleCheckinWithPayment = async (r, markAsPaid) => {
    try {
      if (markAsPaid) {
        await api.patch(`/reservations/${r.id}/collect-payment`);
      }
      await api.patch(`/reservations/${r.id}/checkin`);
      toast.success('Check-in realizado');
      setCheckinConfirm(null); fetchData();
    } catch (e) { toast.error(e.response?.data?.detail || 'Error'); }
  };

  const handleCollectPayment = async (id) => {
    try {
      await api.patch(`/reservations/${id}/collect-payment`);
      toast.success('Pago registrado'); fetchData();
    } catch (e) { toast.error(e.response?.data?.detail || 'Error'); }
  };

  const handleCheckout = async (id) => {
    try {
      await api.patch(`/reservations/${id}/checkout`);
      toast.success('Check-out realizado'); fetchData();
    } catch (e) { toast.error(e.response?.data?.detail || 'Error'); }
  };

  const handleCancel = async (id) => {
    if (!window.confirm('¿Cancelar esta reserva?')) return;
    try {
      await api.patch(`/reservations/${id}/cancel`);
      toast.success('Reserva cancelada'); fetchData();
    } catch (e) { toast.error(e.response?.data?.detail || 'Error'); }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>Reservas</h1>
          <p className="text-sm text-slate-500">{reservations.length} reservas en total</p>
        </div>
        {isReceptionist && (
          <button data-testid="new-reservation-btn" onClick={() => setShowModal(true)}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-all active:scale-95">
            <Plus size={16} /> Nueva Reserva
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex gap-1 bg-white border border-slate-200 rounded-lg p-1 flex-wrap">
          {TABS.map(t => (
            <button key={t.key} data-testid={`tab-${t.key}`} onClick={() => setTab(t.key)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${tab === t.key ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'}`}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-xs">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input data-testid="reservation-search" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar huésped o habitación..." className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 bg-white" />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {['Huésped', 'Hab.', 'Check-in', 'Check-out', 'Total', 'Pago', 'Fuente', 'Estado', 'Acciones'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-10 text-slate-400">No hay reservas</td></tr>
              ) : filtered.map(r => (
                <tr key={r.id} className={`hover:bg-slate-50 transition-colors ${r.payment_status === 'pending' ? 'bg-amber-50/30' : ''}`} data-testid={`reservation-row-${r.id}`}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800">{r.guest_name}</p>
                    {r.event_name && <p className="text-xs text-violet-600 mt-0.5">{r.event_name}</p>}
                  </td>
                  <td className="px-4 py-3 font-mono text-slate-700 text-xs">#{r.room_number}</td>
                  <td className="px-4 py-3 text-slate-600 text-xs">{r.check_in_date}</td>
                  <td className="px-4 py-3 text-slate-600 text-xs">{r.check_out_date}</td>
                  <td className="px-4 py-3 font-semibold text-slate-800 text-xs">${r.total_amount.toLocaleString('es-MX')}</td>
                  <td className="px-4 py-3">
                    {r.payment_status === 'pending' ? (
                      <span data-testid={`payment-pending-${r.id}`} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-semibold" style={{ background: '#fef3c7', color: '#92400e' }}>
                        <AlertTriangle size={9} /> Pend.
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-semibold text-emerald-700 bg-emerald-50">
                        <DollarSign size={9} /> Ok
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3"><SourceBadge source={r.reservation_source || 'reception'} /></td>
                  <td className="px-4 py-3"><StatusBadge s={r.status} /></td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 flex-wrap">
                      <button data-testid={`detail-btn-${r.id}`} onClick={() => setDetailReservation(r)}
                        className="p-1.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
                        <Eye size={13} />
                      </button>
                      {isReceptionist && r.payment_status === 'pending' && ['confirmed', 'checked_in'].includes(r.status) && (
                        <button data-testid={`collect-payment-btn-${r.id}`} onClick={() => handleCollectPayment(r.id)}
                          className="flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold transition-colors"
                          style={{ background: '#fef3c7', color: '#92400e' }}>
                          <DollarSign size={10} /> Cobrar
                        </button>
                      )}
                      {isReceptionist && r.status === 'confirmed' && (
                        <button data-testid={`checkin-btn-${r.id}`} onClick={() => handleCheckinRequest(r)}
                          className="flex items-center gap-1 px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded text-xs font-semibold transition-colors">
                          <LogIn size={11} /> In
                        </button>
                      )}
                      {isReceptionist && r.status === 'checked_in' && (
                        <button data-testid={`checkout-btn-${r.id}`} onClick={() => handleCheckout(r.id)}
                          className="flex items-center gap-1 px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded text-xs font-semibold transition-colors">
                          <LogOut size={11} /> Out
                        </button>
                      )}
                      {['confirmed', 'pending'].includes(r.status) && (
                        <button data-testid={`cancel-btn-${r.id}`} onClick={() => handleCancel(r.id)}
                          className="px-2 py-1 bg-red-50 hover:bg-red-100 text-red-600 rounded text-xs font-semibold transition-colors">
                          ✕
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

      {/* Check-in con pago pendiente — Modal de confirmación */}
      {checkinConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl" data-testid="checkin-payment-modal">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: '#fef3c7' }}>
                  <AlertTriangle size={22} style={{ color: '#d97706' }} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900">Cobro pendiente</h3>
                  <p className="text-xs text-slate-500">Hab. {checkinConfirm.room_number} · {checkinConfirm.guest_name}</p>
                </div>
              </div>
              <div className="rounded-xl p-4 mb-5" style={{ background: '#fffbeb', border: '1px solid #fcd34d' }}>
                <p className="text-sm font-semibold" style={{ color: '#92400e' }}>
                  Esta reserva tiene un pago pendiente de <span className="text-base">${checkinConfirm.total_amount.toLocaleString('es-MX')} MXN</span>
                </p>
                <p className="text-xs mt-1" style={{ color: '#b45309' }}>El huésped seleccionó "Pagar en el hotel" al reservar.</p>
              </div>
              <p className="text-sm text-slate-600 mb-5">¿Confirmas que <strong>{checkinConfirm.guest_name}</strong> realizó el pago antes de continuar con el check-in?</p>
              <div className="flex flex-col gap-2">
                <button data-testid="checkin-confirm-paid-btn" onClick={() => handleCheckinWithPayment(checkinConfirm, true)}
                  className="w-full py-3 rounded-xl text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition-all">
                  Sí, cobré — Hacer Check-in
                </button>
                <button data-testid="checkin-without-payment-btn" onClick={() => handleCheckinWithPayment(checkinConfirm, false)}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-all">
                  Check-in sin cobrar (pendiente)
                </button>
                <button onClick={() => setCheckinConfirm(null)} className="text-xs text-slate-400 hover:text-slate-600 mt-1">
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl" data-testid="reservation-modal">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>Nueva Reserva</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <form onSubmit={handleCreate} className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Huésped *</label>
                <select data-testid="select-guest" value={form.guest_id} onChange={e => setForm({ ...form, guest_id: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20">
                  <option value="">Seleccionar huésped</option>
                  {guests.map(g => <option key={g.id} value={g.id}>{g.first_name} {g.last_name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Habitación *</label>
                <select data-testid="select-room" value={form.room_id} onChange={e => setForm({ ...form, room_id: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20">
                  <option value="">Seleccionar habitación</option>
                  {rooms.map(r => <option key={r.id} value={r.id}>Hab. {r.number} — {r.type} — ${r.price_per_night.toLocaleString('es-MX')}/noche</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Check-in *</label>
                  <input data-testid="checkin-date" type="date" value={form.check_in_date}
                    onChange={e => setForm({ ...form, check_in_date: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Check-out *</label>
                  <input data-testid="checkout-date" type="date" value={form.check_out_date}
                    onChange={e => setForm({ ...form, check_out_date: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Adultos</label>
                  <input type="number" min="1" value={form.adults}
                    onChange={e => setForm({ ...form, adults: parseInt(e.target.value) })}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Niños</label>
                  <input type="number" min="0" value={form.children}
                    onChange={e => setForm({ ...form, children: parseInt(e.target.value) })}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Notas</label>
                <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
                  rows={2} placeholder="Peticiones especiales..."
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 resize-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Origen de la reserva</label>
                <select value={form.reservation_source} onChange={e => setForm({ ...form, reservation_source: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20">
                  <option value="reception">Recepción</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="web">Portal Web</option>
                  <option value="other">Otro</option>
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} data-testid="cancel-modal"
                  className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-700 rounded-lg font-semibold text-sm hover:bg-slate-50 transition-colors">
                  Cancelar
                </button>
                <button type="submit" disabled={loading} data-testid="submit-reservation"
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-lg font-semibold text-sm transition-all disabled:opacity-60">
                  {loading ? 'Guardando...' : 'Crear Reserva'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reservation Detail Modal */}
      {detailReservation && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4" onClick={() => setDetailReservation(null)}>
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()} data-testid="detail-modal">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-900">Detalle de Reserva</h3>
                <p className="text-xs text-slate-400 font-mono mt-0.5">#{detailReservation.id.slice(0,8).toUpperCase()}</p>
              </div>
              <button onClick={() => setDetailReservation(null)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="flex items-center justify-between">
                <StatusBadge s={detailReservation.status} />
                <SourceBadge source={detailReservation.reservation_source || 'reception'} />
              </div>
              {[
                ['Huésped', detailReservation.guest_name],
                ['Habitación', `Hab. ${detailReservation.room_number}`],
                ['Check-in', detailReservation.check_in_date],
                ['Check-out', detailReservation.check_out_date],
                ['Adultos', detailReservation.adults],
                ['Niños', detailReservation.children || 0],
                ['Total', `$${detailReservation.total_amount.toLocaleString('es-MX')} MXN`],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between items-center py-2 border-b border-slate-50">
                  <span className="text-xs text-slate-400 font-semibold uppercase tracking-wide">{k}</span>
                  <span className="text-sm font-medium text-slate-800">{v}</span>
                </div>
              ))}
              <div className="flex justify-between items-center py-2 border-b border-slate-50">
                <span className="text-xs text-slate-400 font-semibold uppercase tracking-wide">Pago</span>
                {detailReservation.payment_status === 'pending' ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: '#fef3c7', color: '#92400e' }}>
                    <AlertTriangle size={10} /> Pendiente (en hotel)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold text-emerald-700 bg-emerald-50">
                    <DollarSign size={10} /> Cobrado
                  </span>
                )}
              </div>
              {detailReservation.event_name && (
                <div className="flex justify-between items-center py-2 border-b border-slate-50">
                  <span className="text-xs text-slate-400 font-semibold uppercase tracking-wide">Evento</span>
                  <span className="text-sm font-medium text-violet-700">{detailReservation.event_name}</span>
                </div>
              )}
              {detailReservation.notes && (
                <div className="py-2">
                  <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide mb-1">Notas</p>
                  <p className="text-sm text-slate-600 bg-slate-50 rounded-lg p-3">{detailReservation.notes}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
