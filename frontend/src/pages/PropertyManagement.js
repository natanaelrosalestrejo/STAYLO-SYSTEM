import { useState, useEffect } from 'react';
import api from '../utils/api';
import { toast } from 'sonner';
import { Plus, Building2, Sparkles, Edit2, Check, X, Power, PowerOff } from 'lucide-react';

const TYPE_LABELS = { hotel: 'Hotel', event_garden: 'Jardín de Eventos' };

const EMPTY_FORM = { name: '', type: 'hotel', description: '', address: '', status: 'active' };

export default function PropertyManagement() {
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const fetchData = () => {
    setLoading(true);
    api.get('/properties').then(res => setProperties(res.data)).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, []);

  const openNew = () => { setForm(EMPTY_FORM); setEditId(null); setShowModal(true); };
  const openEdit = (p) => { setForm({ name: p.name, type: p.type, description: p.description || '', address: p.address || '', status: p.status }); setEditId(p.id); setShowModal(true); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name) { toast.error('El nombre es requerido'); return; }
    setSaving(true);
    try {
      if (editId) {
        await api.patch(`/properties/${editId}`, form);
        toast.success('Propiedad actualizada');
      } else {
        await api.post('/properties', form);
        toast.success('Propiedad creada');
      }
      setShowModal(false);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (p) => {
    const newStatus = p.status === 'active' ? 'inactive' : 'active';
    try {
      await api.patch(`/properties/${p.id}`, { status: newStatus });
      toast.success(newStatus === 'active' ? 'Propiedad activada' : 'Propiedad desactivada');
      fetchData();
    } catch { toast.error('Error al cambiar estado'); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>
            Gestión de Propiedades
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Administra hoteles y jardines de eventos del grupo</p>
        </div>
        <button data-testid="add-property-btn" onClick={openNew}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors"
          style={{ background: '#625746' }}>
          <Plus size={16} />Nueva propiedad
        </button>
      </div>

      {/* Properties list */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-7 h-7 border-2 rounded-full animate-spin" style={{ borderColor: '#625746', borderTopColor: 'transparent' }} />
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {properties.length === 0 ? (
            <div className="p-12 text-center text-slate-400">No hay propiedades registradas</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100" style={{ background: '#faf8f3' }}>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Propiedad</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Tipo</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell">Descripción</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Estado</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {properties.map(p => (
                  <tr key={p.id} className={`transition-colors hover:bg-slate-50 ${p.status !== 'active' ? 'opacity-60' : ''}`}>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${p.type === 'hotel' ? 'bg-emerald-50' : 'bg-violet-50'}`}>
                          {p.type === 'hotel'
                            ? <Building2 size={16} className="text-emerald-600" strokeWidth={1.5} />
                            : <Sparkles size={16} className="text-violet-600" strokeWidth={1.5} />
                          }
                        </div>
                        <div>
                          <p className="font-semibold text-slate-800">{p.name}</p>
                          {p.address && <p className="text-xs text-slate-400">{p.address}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${p.type === 'hotel' ? 'bg-emerald-50 text-emerald-700' : 'bg-violet-50 text-violet-700'}`}>
                        {TYPE_LABELS[p.type] || p.type}
                      </span>
                    </td>
                    <td className="px-4 py-4 hidden md:table-cell">
                      <p className="text-xs text-slate-500 max-w-xs truncate">{p.description || '—'}</p>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${p.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                        {p.status === 'active' ? 'Activa' : 'Inactiva'}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-1 justify-center">
                        <button data-testid={`edit-prop-${p.id}`} onClick={() => openEdit(p)}
                          className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors" title="Editar">
                          <Edit2 size={14} />
                        </button>
                        <button data-testid={`toggle-prop-${p.id}`} onClick={() => toggleStatus(p)}
                          className={`p-1.5 rounded transition-colors ${p.status === 'active' ? 'hover:bg-red-50 text-slate-400 hover:text-red-500' : 'hover:bg-emerald-50 text-slate-400 hover:text-emerald-500'}`}
                          title={p.status === 'active' ? 'Desactivar' : 'Activar'}>
                          {p.status === 'active' ? <PowerOff size={14} /> : <Power size={14} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>
                {editId ? 'Editar propiedad' : 'Nueva propiedad'}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded hover:bg-slate-100 text-slate-400 transition-colors">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Nombre de la propiedad *</label>
                <input data-testid="prop-form-name" value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Ej: Hotel Boutique Centro"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                  style={{ '--tw-ring-color': '#625746' }} required />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Tipo de propiedad *</label>
                <select data-testid="prop-form-type" value={form.type}
                  onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                  style={{ '--tw-ring-color': '#625746' }}>
                  <option value="hotel">Hotel</option>
                  <option value="event_garden">Jardín de Eventos</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Descripción</label>
                <textarea value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  rows={2} placeholder="Descripción breve de la propiedad..."
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 resize-none"
                  style={{ '--tw-ring-color': '#625746' }} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Dirección</label>
                <input value={form.address}
                  onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                  placeholder="Dirección completa"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                  style={{ '--tw-ring-color': '#625746' }} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Estado</label>
                <select value={form.status}
                  onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                  style={{ '--tw-ring-color': '#625746' }}>
                  <option value="active">Activa</option>
                  <option value="inactive">Inactiva</option>
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)}
                  className="flex-1 py-2.5 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
                  Cancelar
                </button>
                <button data-testid="save-property-btn" type="submit" disabled={saving}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  style={{ background: '#625746' }}>
                  <Check size={15} />{saving ? 'Guardando...' : (editId ? 'Actualizar' : 'Crear propiedad')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
