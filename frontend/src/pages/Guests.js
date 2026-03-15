import { useState, useEffect } from 'react';
import api from '../utils/api';
import { toast } from 'sonner';
import { Plus, Search, Edit2, Trash2, X, Star, History, DollarSign } from 'lucide-react';

const emptyForm = { first_name: '', last_name: '', email: '', phone: '', id_number: '', nationality: '', address: '', notes: '', preferred_room_type: '', internal_notes: '' };

export default function Guests() {
  const [guests, setGuests] = useState([]);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);
  const [historyGuest, setHistoryGuest] = useState(null);
  const [guestHistory, setGuestHistory] = useState(null);

  const fetchGuests = async () => {
    try { const r = await api.get('/guests'); setGuests(r.data); } catch (e) {}
  };

  useEffect(() => { fetchGuests(); }, []);

  const filtered = guests.filter(g => {
    if (!search) return true;
    const q = search.toLowerCase();
    return `${g.first_name} ${g.last_name}`.toLowerCase().includes(q) ||
      g.email?.toLowerCase().includes(q) || g.phone?.includes(q);
  });

  const openCreate = () => { setEditing(null); setForm(emptyForm); setShowModal(true); };
  const openEdit = (g) => { setEditing(g); setForm({ ...g }); setShowModal(true); };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.first_name || !form.last_name) { toast.error('Nombre y apellido son requeridos'); return; }
    setLoading(true);
    try {
      if (editing) {
        await api.put(`/guests/${editing.id}`, form);
        toast.success('Huésped actualizado');
      } else {
        await api.post('/guests', form);
        toast.success('Huésped creado');
      }
      setShowModal(false); fetchGuests();
    } catch (e) { toast.error(e.response?.data?.detail || 'Error'); }
    finally { setLoading(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Eliminar este huésped?')) return;
    try { await api.delete(`/guests/${id}`); toast.success('Huésped eliminado'); fetchGuests(); }
    catch (e) { toast.error('Error al eliminar'); }
  };

  const toggleVip = async (g) => {
    try {
      await api.patch(`/guests/${g.id}/vip`);
      toast.success(g.is_vip ? 'VIP removido' : 'Marcado como VIP');
      fetchGuests();
    } catch (e) { toast.error('Error'); }
  };

  const openHistory = async (g) => {
    setHistoryGuest(g); setGuestHistory(null);
    try {
      const r = await api.get(`/guests/${g.id}/reservations`);
      setGuestHistory(r.data);
    } catch (e) { setGuestHistory({ reservations: [], total_spent: 0, total_stays: 0 }); }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>Huéspedes</h1>
          <p className="text-sm text-slate-500">{guests.length} huéspedes registrados</p>
        </div>
        <button data-testid="new-guest-btn" onClick={openCreate}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-all active:scale-95">
          <Plus size={16} /> Nuevo Huésped
        </button>
      </div>

      <div className="relative max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input data-testid="guest-search" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por nombre, email, teléfono..."
          className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {['Nombre', 'Email', 'Teléfono', 'Hab. Preferida', 'VIP', 'Acciones'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-10 text-slate-400">
                  {search ? 'No se encontraron huéspedes' : 'No hay huéspedes registrados'}
                </td></tr>
              ) : filtered.map(g => (
                <tr key={g.id} className="hover:bg-slate-50 transition-colors" data-testid={`guest-row-${g.id}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${g.is_vip ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                        {g.first_name.charAt(0)}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <p className="font-medium text-slate-800">{g.first_name} {g.last_name}</p>
                          {g.is_vip && <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-700">VIP</span>}
                        </div>
                        {g.internal_notes && <p className="text-xs text-slate-400 truncate max-w-40">{g.internal_notes}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{g.email || '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{g.phone || '—'}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs capitalize">{g.preferred_room_type?.replace('_', ' ') || '—'}</td>
                  <td className="px-4 py-3">
                    <button data-testid={`vip-btn-${g.id}`} onClick={() => toggleVip(g)}
                      className={`p-1.5 rounded transition-colors ${g.is_vip ? 'text-amber-500 bg-amber-50 hover:bg-amber-100' : 'text-slate-300 hover:text-amber-400 hover:bg-amber-50'}`}>
                      <Star size={14} fill={g.is_vip ? 'currentColor' : 'none'} />
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button data-testid={`history-btn-${g.id}`} onClick={() => openHistory(g)}
                        className="p-1.5 text-slate-400 hover:text-violet-600 hover:bg-violet-50 rounded transition-colors" title="Historial">
                        <History size={14} />
                      </button>
                      <button data-testid={`edit-guest-${g.id}`} onClick={() => openEdit(g)}
                        className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-colors">
                        <Edit2 size={14} />
                      </button>
                      <button data-testid={`delete-guest-${g.id}`} onClick={() => handleDelete(g.id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto" data-testid="guest-modal">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white">
              <h2 className="text-lg font-bold text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>
                {editing ? 'Editar Huésped' : 'Nuevo Huésped'}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <form onSubmit={handleSave} className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Nombre *</label>
                  <input data-testid="guest-first-name" value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} required
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Apellido *</label>
                  <input data-testid="guest-last-name" value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })} required
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
                  <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Teléfono</label>
                  <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Documento ID</label>
                  <input value={form.id_number} onChange={e => setForm({ ...form, id_number: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Nacionalidad</label>
                  <input value={form.nationality} onChange={e => setForm({ ...form, nationality: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Dirección</label>
                <input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Notas</label>
                <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Hab. preferida</label>
                  <select value={form.preferred_room_type} onChange={e => setForm({ ...form, preferred_room_type: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20">
                    <option value="">Sin preferencia</option>
                    <option value="junior_suite">Junior Suite</option>
                    <option value="double">Doble</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Notas internas</label>
                  <input value={form.internal_notes} onChange={e => setForm({ ...form, internal_notes: e.target.value })}
                    placeholder="Solo visible para el staff"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-700 rounded-lg font-semibold text-sm hover:bg-slate-50">Cancelar</button>
                <button type="submit" disabled={loading} data-testid="save-guest-btn"
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-lg font-semibold text-sm transition-all disabled:opacity-60">
                  {loading ? 'Guardando...' : editing ? 'Guardar Cambios' : 'Crear Huésped'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Guest History Modal */}
      {historyGuest && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setHistoryGuest(null)}>
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white">
              <div>
                <h2 className="text-lg font-bold text-slate-900">{historyGuest.first_name} {historyGuest.last_name}</h2>
                <p className="text-xs text-slate-400">Historial de estancias</p>
              </div>
              <button onClick={() => setHistoryGuest(null)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            {!guestHistory ? (
              <div className="py-12 text-center text-slate-400">Cargando...</div>
            ) : (
              <div className="px-6 py-5">
                <div className="grid grid-cols-3 gap-3 mb-5">
                  <div className="text-center p-3 rounded-xl bg-slate-50">
                    <p className="text-xl font-bold text-slate-900">{guestHistory.total_stays}</p>
                    <p className="text-xs text-slate-400">Estancias</p>
                  </div>
                  <div className="text-center p-3 rounded-xl bg-slate-50">
                    <p className="text-xl font-bold text-slate-900">{guestHistory.reservations?.length || 0}</p>
                    <p className="text-xs text-slate-400">Reservas</p>
                  </div>
                  <div className="text-center p-3 rounded-xl" style={{ background: '#f5ede2' }}>
                    <p className="text-lg font-bold" style={{ color: '#625746' }}>${(guestHistory.total_spent || 0).toLocaleString('es-MX')}</p>
                    <p className="text-xs" style={{ color: '#917a6a' }}>Total gastado</p>
                  </div>
                </div>
                <div className="space-y-2">
                  {guestHistory.reservations?.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-4">Sin reservas registradas</p>
                  ) : guestHistory.reservations?.map(r => (
                    <div key={r.id} className="flex items-center justify-between p-3 rounded-lg border border-slate-100 hover:bg-slate-50">
                      <div>
                        <p className="text-sm font-medium text-slate-800">Hab. {r.room_number}</p>
                        <p className="text-xs text-slate-400">{r.check_in_date} → {r.check_out_date}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-slate-800">${r.total_amount.toLocaleString('es-MX')}</p>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${r.status === 'checked_out' ? 'bg-green-50 text-green-700' : r.status === 'cancelled' ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'}`}>
                          {r.status === 'checked_out' ? 'Completada' : r.status === 'checked_in' ? 'En hotel' : r.status === 'cancelled' ? 'Cancelada' : 'Confirmada'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
