import { useState, useEffect, useMemo } from 'react';
import api from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { useProperty } from '../contexts/PropertyContext';
import { toast } from 'sonner';
import {
  Plus, Edit2, Trash2, X, CalendarDays, Users, DollarSign,
  CheckCircle, Building2, Layers
} from 'lucide-react';

const SPACE_TYPES = [
  { value: 'salon',      label: 'Salón de Eventos' },
  { value: 'conference', label: 'Sala de Conferencias' },
  { value: 'rooftop',    label: 'Rooftop' },
  { value: 'terrace',    label: 'Terraza / Palapa' },
  { value: 'pool',       label: 'Área de Alberca' },
  { value: 'general',    label: 'Espacio General' },
];

const TYPE_COLORS = {
  salon:      'bg-violet-50 text-violet-700',
  conference: 'bg-blue-50 text-blue-700',
  rooftop:    'bg-amber-50 text-amber-700',
  terrace:    'bg-emerald-50 text-emerald-700',
  pool:       'bg-cyan-50 text-cyan-700',
  general:    'bg-slate-100 text-slate-600',
};

const fmt = (n) => `$${Number(n || 0).toLocaleString('es-MX')}`;

const EMPTY_SPACE = { space_name: '', space_type: 'salon', capacity: '', description: '', price_per_event: '', status: 'available' };
const EMPTY_BOOKING = { hotel_space_id: '', client_name: '', client_email: '', client_phone: '', event_date: '', event_type: 'corporate', attendees: '', total_price: '', booking_status: 'confirmed', notes: '' };

const EVENT_TYPES = {
  corporate:  { label: 'Corporativo',  color: 'bg-blue-50 text-blue-700' },
  conference: { label: 'Conferencia',  color: 'bg-indigo-50 text-indigo-700' },
  wedding:    { label: 'Boda',         color: 'bg-pink-50 text-pink-700' },
  birthday:   { label: 'Cumpleaños',   color: 'bg-amber-50 text-amber-700' },
  social:     { label: 'Social',       color: 'bg-violet-50 text-violet-700' },
  other:      { label: 'Otro',         color: 'bg-slate-100 text-slate-600' },
};

export default function HotelEvents() {
  const { user } = useAuth();
  const { properties, selectedPropertyId } = useProperty();
  const [spaces, setSpaces] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [tab, setTab] = useState('spaces');
  const [showSpaceModal, setShowSpaceModal] = useState(false);
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [editingSpace, setEditingSpace] = useState(null);
  const [spaceForm, setSpaceForm] = useState(EMPTY_SPACE);
  const [bookingForm, setBookingForm] = useState(EMPTY_BOOKING);
  const [loading, setLoading] = useState(false);

  /** Hotel en contexto: propiedad seleccionada si es hotel; si no, primer hotel del tenant. */
  const hotelProp = useMemo(() => {
    const hotels = properties.filter((p) => p.type === 'hotel');
    if (!hotels.length) return null;
    if (selectedPropertyId && selectedPropertyId !== 'all') {
      const sel = hotels.find((p) => p.id === selectedPropertyId);
      if (sel) return sel;
    }
    return hotels[0];
  }, [properties, selectedPropertyId]);

  const isAdmin = ['admin', 'manager'].includes(user?.role);

  const fetchData = async () => {
    try {
      const propId = hotelProp?.id;
      const [s, b] = await Promise.all([
        api.get('/hotel-spaces' + (propId ? `?property_id=${propId}` : '')),
        api.get('/event-bookings' + (propId ? `?property_id=${propId}` : '')),
      ]);
      setSpaces(s.data);
      // Only show bookings referencing hotel spaces
      const spaceIds = new Set(s.data.map(sp => sp.id));
      setBookings(b.data.filter(bk => spaceIds.has(bk.event_space_id)));
    } catch {}
  };

  useEffect(() => { fetchData(); }, [hotelProp?.id]);

  // ─── Space CRUD ───────────────────────────────────────────
  const openCreateSpace = () => {
    setEditingSpace(null);
    setSpaceForm(EMPTY_SPACE);
    setShowSpaceModal(true);
  };

  const openEditSpace = (s) => {
    setEditingSpace(s);
    setSpaceForm({ space_name: s.space_name, space_type: s.space_type, capacity: s.capacity, description: s.description || '', price_per_event: s.price_per_event || '', status: s.status });
    setShowSpaceModal(true);
  };

  const handleSaveSpace = async (e) => {
    e.preventDefault();
    if (!spaceForm.space_name) { toast.error('El nombre es requerido'); return; }
    setLoading(true);
    try {
      const payload = { ...spaceForm, capacity: parseInt(spaceForm.capacity) || 0, price_per_event: parseFloat(spaceForm.price_per_event) || null };
      if (editingSpace) {
        await api.patch(`/hotel-spaces/${editingSpace.id}`, payload);
        toast.success('Espacio actualizado');
      } else {
        await api.post('/hotel-spaces', { ...payload, property_id: hotelProp?.id || '' });
        toast.success('Espacio creado');
      }
      setShowSpaceModal(false);
      fetchData();
    } catch (err) { toast.error(err.response?.data?.detail || 'Error al guardar'); }
    finally { setLoading(false); }
  };

  const handleDeleteSpace = async (id) => {
    if (!window.confirm('¿Eliminar este espacio?')) return;
    try { await api.delete(`/hotel-spaces/${id}`); toast.success('Espacio eliminado'); fetchData(); }
    catch { toast.error('Error al eliminar'); }
  };

  // ─── Booking ─────────────────────────────────────────────
  const handleSaveBooking = async (e) => {
    e.preventDefault();
    if (!bookingForm.hotel_space_id || !bookingForm.client_name || !bookingForm.event_date) {
      toast.error('Completa los campos requeridos'); return;
    }
    setLoading(true);
    try {
      const space = spaces.find(s => s.id === bookingForm.hotel_space_id);
      await api.post('/event-bookings', {
        property_id: hotelProp?.id || '',
        event_space_id: bookingForm.hotel_space_id,
        client_name: bookingForm.client_name,
        client_email: bookingForm.client_email,
        client_phone: bookingForm.client_phone,
        event_date: bookingForm.event_date,
        event_type: bookingForm.event_type,
        attendees: parseInt(bookingForm.attendees) || 0,
        total_price: parseFloat(bookingForm.total_price) || 0,
        booking_status: bookingForm.booking_status,
        notes: bookingForm.notes,
      });
      toast.success('Reserva creada');
      setShowBookingModal(false);
      setBookingForm(EMPTY_BOOKING);
      fetchData();
    } catch (err) { toast.error(err.response?.data?.detail || 'Error al crear reserva'); }
    finally { setLoading(false); }
  };

  const handleDeleteBooking = async (id) => {
    if (!window.confirm('¿Eliminar esta reserva?')) return;
    try { await api.delete(`/event-bookings/${id}`); toast.success('Reserva eliminada'); fetchData(); }
    catch { toast.error('Error al eliminar'); }
  };

  const today = new Date().toISOString().split('T')[0];
  const confirmedBookings = bookings.filter(b => b.booking_status === 'confirmed').length;
  const upcomingBookings = bookings.filter(b => b.event_date >= today && b.booking_status === 'confirmed').length;
  const totalRevenue = bookings.filter(b => b.booking_status !== 'cancelled').reduce((s, b) => s + (b.total_price || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>
            Eventos del Hotel
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Espacios internos y reservas de eventos</p>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <button data-testid="new-hotel-event-btn"
              onClick={() => { setBookingForm(EMPTY_BOOKING); setShowBookingModal(true); }}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors"
              style={{ background: '#625746' }}>
              <Plus size={15} />Nueva Reserva
            </button>
          </div>
        )}
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {[
          { label: 'Espacios registrados', value: spaces.length, icon: Building2, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Reservas confirmadas', value: confirmedBookings, icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Ingresos totales', value: fmt(totalRevenue), icon: DollarSign, color: 'text-violet-600', bg: 'bg-violet-50' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
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
        {[{ key: 'spaces', label: `Espacios (${spaces.length})` }, { key: 'bookings', label: `Reservas (${bookings.length})` }].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${tab === t.key ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Spaces Tab */}
      {tab === 'spaces' && (
        <div className="space-y-4">
          {isAdmin && (
            <div className="flex justify-end">
              <button data-testid="add-hotel-space-btn" onClick={openCreateSpace}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors">
                <Plus size={14} />Nuevo Espacio
              </button>
            </div>
          )}
          {spaces.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
              <Building2 size={40} className="text-slate-200 mx-auto mb-3" />
              <p className="text-slate-500 font-medium mb-1">Sin espacios registrados</p>
              <p className="text-slate-400 text-sm">Agrega el primer espacio del hotel</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {spaces.map(s => {
                const tc = TYPE_COLORS[s.space_type] || TYPE_COLORS.general;
                const typeLabel = SPACE_TYPES.find(t => t.value === s.space_type)?.label || s.space_type;
                return (
                  <div key={s.id} data-testid={`hotel-space-${s.id}`} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <h3 className="font-semibold text-slate-800 text-sm">{s.space_name}</h3>
                        <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-semibold ${tc}`}>{typeLabel}</span>
                      </div>
                      {isAdmin && (
                        <div className="flex gap-1 ml-2">
                          <button onClick={() => openEditSpace(s)} className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"><Edit2 size={13} /></button>
                          <button onClick={() => handleDeleteSpace(s.id)} className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"><Trash2 size={13} /></button>
                        </div>
                      )}
                    </div>
                    <div className="space-y-1.5 text-xs text-slate-500">
                      <div className="flex items-center gap-1.5"><Users size={12} />{s.capacity} personas</div>
                      {s.price_per_event && <div className="flex items-center gap-1.5"><DollarSign size={12} />{fmt(s.price_per_event)} por evento</div>}
                      {s.description && <p className="text-slate-400 mt-2 leading-relaxed">{s.description}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Bookings Tab */}
      {tab === 'bookings' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {bookings.length === 0 ? (
            <div className="p-12 text-center">
              <CalendarDays size={40} className="text-slate-200 mx-auto mb-3" />
              <p className="text-slate-500 font-medium">Sin reservas de eventos</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>{['Cliente', 'Espacio', 'Fecha', 'Tipo', 'Asistentes', 'Precio', 'Estado', ''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {bookings.map(b => {
                  const et = EVENT_TYPES[b.event_type] || EVENT_TYPES.other;
                  return (
                    <tr key={b.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-slate-800">{b.client_name}</td>
                      <td className="px-4 py-3 text-slate-600">{b.event_space_name || '—'}</td>
                      <td className="px-4 py-3 text-slate-600">{b.event_date}</td>
                      <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${et.color}`}>{et.label}</span></td>
                      <td className="px-4 py-3 text-slate-600">{b.attendees}</td>
                      <td className="px-4 py-3 font-medium text-slate-700">{fmt(b.total_price)}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${b.booking_status === 'confirmed' ? 'bg-emerald-100 text-emerald-700' : b.booking_status === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-600'}`}>
                          {b.booking_status === 'confirmed' ? 'Confirmado' : b.booking_status === 'pending' ? 'Pendiente' : 'Cancelado'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {isAdmin && (
                          <button onClick={() => handleDeleteBooking(b.id)} className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"><Trash2 size={13} /></button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Space Modal */}
      {showSpaceModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>
                {editingSpace ? 'Editar Espacio' : 'Nuevo Espacio'}
              </h2>
              <button onClick={() => setShowSpaceModal(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <form onSubmit={handleSaveSpace} className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Nombre del espacio *</label>
                <input value={spaceForm.space_name} onChange={e => setSpaceForm(f => ({ ...f, space_name: e.target.value }))} required
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#625746]" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Tipo de espacio</label>
                <select value={spaceForm.space_type} onChange={e => setSpaceForm(f => ({ ...f, space_type: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#625746]">
                  {SPACE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Capacidad (personas)</label>
                  <input type="number" value={spaceForm.capacity} onChange={e => setSpaceForm(f => ({ ...f, capacity: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#625746]" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Precio por evento ($)</label>
                  <input type="number" value={spaceForm.price_per_event} onChange={e => setSpaceForm(f => ({ ...f, price_per_event: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#625746]" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Descripción</label>
                <textarea value={spaceForm.description} onChange={e => setSpaceForm(f => ({ ...f, description: e.target.value }))} rows={2}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#625746] resize-none" />
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowSpaceModal(false)}
                  className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-700 rounded-lg font-semibold text-sm hover:bg-slate-50">Cancelar</button>
                <button type="submit" disabled={loading}
                  className="flex-1 px-4 py-2.5 text-white rounded-lg font-semibold text-sm transition-all disabled:opacity-60"
                  style={{ background: '#625746' }}>
                  {loading ? 'Guardando...' : editingSpace ? 'Guardar' : 'Crear Espacio'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Booking Modal */}
      {showBookingModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white">
              <h2 className="text-lg font-bold text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>Nueva Reserva de Evento</h2>
              <button onClick={() => setShowBookingModal(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <form onSubmit={handleSaveBooking} className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Espacio *</label>
                <select value={bookingForm.hotel_space_id} onChange={e => setBookingForm(f => ({ ...f, hotel_space_id: e.target.value }))} required
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#625746]">
                  <option value="">Selecciona un espacio</option>
                  {spaces.map(s => <option key={s.id} value={s.id}>{s.space_name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Cliente *</label>
                  <input value={bookingForm.client_name} onChange={e => setBookingForm(f => ({ ...f, client_name: e.target.value }))} required
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#625746]" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Fecha del evento *</label>
                  <input type="date" value={bookingForm.event_date} onChange={e => setBookingForm(f => ({ ...f, event_date: e.target.value }))} required
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#625746]" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Tipo de evento</label>
                  <select value={bookingForm.event_type} onChange={e => setBookingForm(f => ({ ...f, event_type: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#625746]">
                    {Object.entries(EVENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Asistentes</label>
                  <input type="number" value={bookingForm.attendees} onChange={e => setBookingForm(f => ({ ...f, attendees: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#625746]" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Precio total ($)</label>
                <input type="number" value={bookingForm.total_price} onChange={e => setBookingForm(f => ({ ...f, total_price: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#625746]" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Notas</label>
                <textarea value={bookingForm.notes} onChange={e => setBookingForm(f => ({ ...f, notes: e.target.value }))} rows={2}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#625746] resize-none" />
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowBookingModal(false)}
                  className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-700 rounded-lg font-semibold text-sm hover:bg-slate-50">Cancelar</button>
                <button type="submit" disabled={loading}
                  className="flex-1 px-4 py-2.5 text-white rounded-lg font-semibold text-sm transition-all disabled:opacity-60"
                  style={{ background: '#625746' }}>
                  {loading ? 'Guardando...' : 'Crear Reserva'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
