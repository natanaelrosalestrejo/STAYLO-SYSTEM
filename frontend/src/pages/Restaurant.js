import { useState, useEffect, useMemo } from 'react';
import api from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { useProperty } from '../contexts/PropertyContext';
import { toast } from 'sonner';
import { Plus, Utensils, Clock, CheckCircle, XCircle, Trash2, Edit2, Calendar, TrendingUp, Coffee } from 'lucide-react';

// ─────────────── Constants ───────────────

const MEAL_TYPES = {
  desayuno: { label: 'Desayuno',  icon: Coffee,   color: 'bg-amber-50 text-amber-700',   border: 'border-amber-200' },
  almuerzo: { label: 'Almuerzo', icon: Utensils,  color: 'bg-orange-50 text-orange-700', border: 'border-orange-200' },
  comida:   { label: 'Comida',   icon: Utensils,  color: 'bg-blue-50 text-blue-700',     border: 'border-blue-200' },
  cena:     { label: 'Cena',     icon: Clock,     color: 'bg-violet-50 text-violet-700', border: 'border-violet-200' },
};

const ORDER_STATUS = {
  ordered:   { label: 'Ordenado',   cls: 'bg-blue-50 text-blue-700' },
  served:    { label: 'Servido',    cls: 'bg-emerald-50 text-emerald-700' },
  cancelled: { label: 'Cancelado', cls: 'bg-red-50 text-red-700' },
};

const ACCENT = '#059669';
const fmt = (n) => `$${Number(n || 0).toLocaleString('es-MX')}`;

const today = () => new Date().toISOString().split('T')[0];
const addDays = (d, n) => { const dt = new Date(d); dt.setDate(dt.getDate() + n); return dt.toISOString().split('T')[0]; };

const EMPTY_ORDER = {
  guest_name: '', room_number: '', meal_type: 'desayuno',
  meal_date: today(), plates: '1', amount: '', notes: '',
  reservation_id: '', guest_id: '',
};

// ─────────────── Component ───────────────

export default function Restaurant() {
  const { user } = useAuth();
  const { properties, selectedPropertyId } = useProperty();

  const [orders, setOrders] = useState([]);
  const [dailyCount, setDailyCount] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [tab, setTab] = useState('hoy');
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editOrder, setEditOrder] = useState(null);
  const [form, setForm] = useState(EMPTY_ORDER);
  const [dateFilter, setDateFilter] = useState(today());
  const [mealFilter, setMealFilter] = useState('');

  const hotelProp = useMemo(() => {
    const hotels = properties.filter(p => p.type === 'hotel');
    if (!hotels.length) return null;
    if (selectedPropertyId && selectedPropertyId !== 'all') {
      const sel = hotels.find(p => p.id === selectedPropertyId);
      if (sel) return sel;
    }
    return hotels[0];
  }, [properties, selectedPropertyId]);

  const propId = hotelProp?.id;
  const isStaff = ['restaurant', 'receptionist', 'manager', 'owner'].includes(user?.role);

  // ─── Fetch ───

  const fetchOrders = async () => {
    try {
      const params = new URLSearchParams();
      if (propId) params.set('property_id', propId);
      if (dateFilter && tab === 'hoy') params.set('meal_date', dateFilter);
      if (mealFilter) params.set('meal_type', mealFilter);
      const res = await api.get(`/restaurant/meal-orders?${params}`);
      setOrders(res.data);
    } catch (e) {}
  };

  const fetchDailyCount = async () => {
    try {
      const params = new URLSearchParams();
      if (propId) params.set('property_id', propId);
      params.set('date_from', today());
      params.set('date_to', addDays(today(), 7));
      const res = await api.get(`/restaurant/daily-count?${params}`);
      setDailyCount(res.data);
    } catch (e) {}
  };

  const fetchReservations = async () => {
    try {
      const res = await api.get('/reservations');
      const active = (res.data || []).filter(r => ['confirmed', 'checked_in'].includes(r.status));
      setReservations(active);
    } catch (e) {}
  };

  useEffect(() => {
    fetchOrders();
    fetchDailyCount();
    fetchReservations();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propId, dateFilter, mealFilter, tab]);

  // ─── Handlers ───

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = {
        ...form,
        property_id: propId || '',
        plates: parseInt(form.plates) || 1,
        amount: parseFloat(form.amount) || 0,
      };
      if (editOrder) {
        await api.patch(`/restaurant/meal-orders/${editOrder.id}`, payload);
        toast.success('Orden actualizada');
      } else {
        await api.post('/restaurant/meal-orders', payload);
        toast.success('Orden registrada');
      }
      setShowModal(false); setEditOrder(null); setForm(EMPTY_ORDER);
      fetchOrders(); fetchDailyCount();
    } catch (err) { toast.error(err.response?.data?.detail || 'Error al guardar orden'); }
    finally { setLoading(false); }
  };

  const handleStatusChange = async (id, status) => {
    try {
      await api.patch(`/restaurant/meal-orders/${id}`, { status });
      toast.success('Estado actualizado'); fetchOrders(); fetchDailyCount();
    } catch { toast.error('Error al actualizar'); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Eliminar esta orden?')) return;
    try {
      await api.delete(`/restaurant/meal-orders/${id}`);
      toast.success('Orden eliminada'); fetchOrders(); fetchDailyCount();
    } catch { toast.error('Error al eliminar'); }
  };

  const openEdit = (order) => {
    setEditOrder(order);
    setForm({
      guest_name: order.guest_name || '',
      room_number: order.room_number || '',
      meal_type: order.meal_type || 'desayuno',
      meal_date: order.meal_date || today(),
      plates: String(order.plates || 1),
      amount: String(order.amount || ''),
      notes: order.notes || '',
      reservation_id: order.reservation_id || '',
      guest_id: order.guest_id || '',
    });
    setShowModal(true);
  };

  const fillFromReservation = (reservationId) => {
    const res = reservations.find(r => r.id === reservationId);
    if (res) {
      setForm(f => ({
        ...f,
        reservation_id: res.id,
        guest_name: res.guest_name || '',
        room_number: res.room_number || '',
        guest_id: res.guest_id || '',
      }));
    } else {
      setForm(f => ({ ...f, reservation_id: '', guest_name: '', room_number: '', guest_id: '' }));
    }
  };

  // ─── Metrics ───

  const todayOrders = orders.filter(o => o.meal_date === today() && o.status !== 'cancelled');
  const todayPlates = todayOrders.reduce((s, o) => s + (o.plates || 1), 0);
  const todayRevenue = orders.filter(o => o.meal_date === today() && o.status !== 'cancelled').reduce((s, o) => s + (o.amount || 0), 0);

  const platesByType = Object.keys(MEAL_TYPES).reduce((acc, mt) => {
    acc[mt] = todayOrders.filter(o => o.meal_type === mt).reduce((s, o) => s + (o.plates || 1), 0);
    return acc;
  }, {});

  // ─────────────── Render ───────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>
            Restaurante
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {hotelProp?.name || 'Hotel'} — Gestión de alimentos y órdenes
          </p>
        </div>
        {isStaff && (
          <button onClick={() => { setForm({ ...EMPTY_ORDER, meal_date: dateFilter }); setEditOrder(null); setShowModal(true); }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white"
            style={{ background: ACCENT }}>
            <Plus size={16} />Nueva Orden
          </button>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
          <p className="text-xs text-slate-500 font-medium">Platos hoy</p>
          <p className="text-2xl font-bold text-slate-900 mt-1" style={{ fontFamily: 'Manrope, sans-serif' }}>{todayPlates}</p>
          <p className="text-xs text-slate-400 mt-0.5">{todayOrders.length} órdenes</p>
        </div>
        {Object.entries(MEAL_TYPES).map(([mt, cfg]) => {
          const Icon = cfg.icon;
          const count = platesByType[mt] || 0;
          return (
            <div key={mt} className={`bg-white rounded-xl p-4 border shadow-sm ${cfg.border}`}>
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-slate-500 font-medium">{cfg.label}</p>
                <div className={`w-7 h-7 ${cfg.color.split(' ')[0]} rounded-lg flex items-center justify-center`}>
                  <Icon size={14} className={cfg.color.split(' ')[1]} strokeWidth={1.5} />
                </div>
              </div>
              <p className="text-xl font-bold text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>{count}</p>
              <p className="text-xs text-slate-400">platos</p>
            </div>
          );
        })}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
        {[
          { key: 'hoy', label: 'Órdenes del día' },
          { key: 'planeacion', label: 'Planeación semanal' },
          { key: 'historial', label: 'Historial' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${tab === t.key ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ═══════════ HOY TAB ═══════════ */}
      {tab === 'hoy' && (
        <div className="space-y-4">
          {/* Date + meal filter */}
          <div className="flex flex-wrap gap-3 items-center">
            <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 bg-white"
              style={{ '--tw-ring-color': ACCENT }} />
            <div className="flex gap-1">
              <button onClick={() => setMealFilter('')}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${!mealFilter ? 'border-transparent text-white' : 'border-slate-200 text-slate-600 bg-white'}`}
                style={!mealFilter ? { background: ACCENT } : {}}>
                Todos
              </button>
              {Object.entries(MEAL_TYPES).map(([k, v]) => (
                <button key={k} onClick={() => setMealFilter(mealFilter === k ? '' : k)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${mealFilter === k ? 'border-transparent text-white' : 'border-slate-200 text-slate-600 bg-white'}`}
                  style={mealFilter === k ? { background: ACCENT } : {}}>
                  {v.label}
                </button>
              ))}
            </div>
          </div>

          {orders.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <Utensils size={40} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">No hay órdenes para esta fecha.</p>
              {isStaff && <p className="text-xs mt-1">Haz clic en "Nueva Orden" para registrar.</p>}
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Huésped</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Habitación</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Tiempo de comida</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Platos</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Importe</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Estado</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {orders.map(order => {
                    const mt = MEAL_TYPES[order.meal_type] || MEAL_TYPES.desayuno;
                    const st = ORDER_STATUS[order.status] || ORDER_STATUS.ordered;
                    return (
                      <tr key={order.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3">
                          <p className="font-medium text-slate-800">{order.guest_name}</p>
                          {order.notes && <p className="text-xs text-slate-400 truncate max-w-[140px]">{order.notes}</p>}
                        </td>
                        <td className="px-4 py-3 text-slate-600 text-sm font-mono">
                          {order.room_number ? `#${order.room_number}` : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${mt.color}`}>
                            {mt.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center font-bold text-slate-800">{order.plates}</td>
                        <td className="px-4 py-3 text-right text-slate-700 font-medium">
                          {order.amount ? fmt(order.amount) : '—'}
                        </td>
                        <td className="px-4 py-3">
                          {isStaff ? (
                            <select value={order.status} onChange={e => handleStatusChange(order.id, e.target.value)}
                              className="text-xs border border-slate-200 rounded px-2 py-1 bg-white focus:outline-none">
                              {Object.entries(ORDER_STATUS).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
                            </select>
                          ) : (
                            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${st.cls}`}>{st.label}</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            {isStaff && (
                              <button onClick={() => openEdit(order)}
                                className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                                <Edit2 size={13} />
                              </button>
                            )}
                            {['manager', 'owner'].includes(user?.role) && (
                              <button onClick={() => handleDelete(order.id)}
                                className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors">
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ═══════════ PLANEACIÓN SEMANAL ═══════════ */}
      {tab === 'planeacion' && (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-700">
            <TrendingUp size={16} className="inline mr-2" />
            Platos confirmados para los próximos 7 días. Usa esta vista para coordinar con cocina y proveedores.
          </div>
          {dailyCount.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <Calendar size={40} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">No hay órdenes registradas para los próximos días.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {dailyCount.map(day => {
                const dt = new Date(day.date + 'T12:00:00');
                const isToday = day.date === today();
                return (
                  <div key={day.date} className={`bg-white rounded-xl border shadow-sm p-4 ${isToday ? 'border-emerald-300 ring-1 ring-emerald-200' : 'border-slate-200'}`}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        {isToday && <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">Hoy</span>}
                        <h3 className="font-semibold text-slate-800" style={{ fontFamily: 'Manrope, sans-serif' }}>
                          {dt.toLocaleDateString('es-MX', { weekday: 'long', day: '2-digit', month: 'long' })}
                        </h3>
                      </div>
                      <span className="text-lg font-bold text-slate-700">{day.total} platos</span>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {Object.entries(MEAL_TYPES).map(([mt, cfg]) => {
                        const count = day.counts?.[mt] || 0;
                        if (!count) return null;
                        const Icon = cfg.icon;
                        return (
                          <div key={mt} className={`rounded-lg p-3 text-center ${cfg.color.split(' ')[0]} border ${cfg.border}`}>
                            <Icon size={16} className={`mx-auto mb-1 ${cfg.color.split(' ')[1]}`} strokeWidth={1.5} />
                            <p className="text-xs font-medium text-slate-600">{cfg.label}</p>
                            <p className="text-xl font-bold text-slate-800">{count}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══════════ HISTORIAL TAB ═══════════ */}
      {tab === 'historial' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3 items-center">
            <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 bg-white" />
            <span className="text-xs text-slate-400">Filtrando por fecha y estado</span>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Fecha</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Huésped</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Hab.</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Tiempo</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Platos</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Importe</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {orders.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-10 text-slate-400 text-sm">No hay órdenes para este período</td></tr>
                ) : orders.map(order => {
                  const mt = MEAL_TYPES[order.meal_type] || MEAL_TYPES.desayuno;
                  const st = ORDER_STATUS[order.status] || ORDER_STATUS.ordered;
                  return (
                    <tr key={order.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 text-xs text-slate-500">{order.meal_date}</td>
                      <td className="px-4 py-3 font-medium text-slate-800">{order.guest_name}</td>
                      <td className="px-4 py-3 text-slate-500 font-mono text-xs">{order.room_number ? `#${order.room_number}` : '—'}</td>
                      <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${mt.color}`}>{mt.label}</span></td>
                      <td className="px-4 py-3 text-center font-bold text-slate-800">{order.plates}</td>
                      <td className="px-4 py-3 text-right text-slate-700">{order.amount ? fmt(order.amount) : '—'}</td>
                      <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${st.cls}`}>{st.label}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══════════ ORDER MODAL ═══════════ */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>
                {editOrder ? 'Editar Orden' : 'Nueva Orden'}
              </h2>
              <button onClick={() => { setShowModal(false); setEditOrder(null); }}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><XCircle size={18} /></button>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
              {/* Link to reservation */}
              {!editOrder && reservations.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Vincular a reservación (opcional)</label>
                  <select value={form.reservation_id}
                    onChange={e => { setForm(f => ({ ...f, reservation_id: e.target.value })); fillFromReservation(e.target.value); }}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2">
                    <option value="">Sin vincular</option>
                    {reservations.map(r => (
                      <option key={r.id} value={r.id}>#{r.room_number} — {r.guest_name} ({r.check_in_date} → {r.check_out_date})</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Nombre del huésped *</label>
                  <input value={form.guest_name} onChange={e => setForm(f => ({ ...f, guest_name: e.target.value }))}
                    placeholder="Ej: Roberto Martínez" required
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">No. de habitación</label>
                  <input value={form.room_number} onChange={e => setForm(f => ({ ...f, room_number: e.target.value }))}
                    placeholder="101"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Fecha *</label>
                  <input type="date" value={form.meal_date} onChange={e => setForm(f => ({ ...f, meal_date: e.target.value }))}
                    required className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Tiempo de comida *</label>
                  <select value={form.meal_type} onChange={e => setForm(f => ({ ...f, meal_type: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2">
                    {Object.entries(MEAL_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">No. de platos</label>
                  <input type="number" min="1" value={form.plates} onChange={e => setForm(f => ({ ...f, plates: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Importe (MXN)</label>
                  <input type="number" min="0" step="1" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                    placeholder="0.00"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Notas / Especificaciones</label>
                  <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                    rows={2} placeholder="Alergias, preferencias, modificaciones..."
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 resize-none" />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setShowModal(false); setEditOrder(null); }}
                  className="flex-1 py-2.5 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50">Cancelar</button>
                <button type="submit" disabled={loading}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
                  style={{ background: ACCENT }}>{loading ? 'Guardando...' : editOrder ? 'Actualizar' : 'Registrar Orden'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

