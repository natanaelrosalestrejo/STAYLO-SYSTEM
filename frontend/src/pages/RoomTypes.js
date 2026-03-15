import { useState, useEffect, useRef } from 'react';
import api from '../utils/api';
import { toast } from 'sonner';
import { Plus, Edit2, X, Image, Trash2, Upload, Check } from 'lucide-react';

const EMPTY_FORM = { name: '', description: '', base_price: '', capacity: 2, amenities: [], images: [], status: 'active' };

export default function RoomTypes() {
  const [roomTypes, setRoomTypes] = useState([]);
  const [amenities, setAmenities] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setSaving] = useState(false);
  const [imagePreview, setImagePreview] = useState([]);
  const fileInputRef = useRef(null);

  const fetchData = async () => {
    try {
      const [rt, am] = await Promise.all([api.get('/room-types'), api.get('/amenities')]);
      setRoomTypes(rt.data);
      setAmenities(am.data);
    } catch {}
  };

  useEffect(() => { fetchData(); }, []);

  const openCreate = () => {
    setEditId(null);
    setForm(EMPTY_FORM);
    setImagePreview([]);
    setShowModal(true);
  };

  const openEdit = (rt) => {
    setEditId(rt.id);
    setForm({ name: rt.name, description: rt.description || '', base_price: rt.base_price, capacity: rt.capacity, amenities: rt.amenities || [], images: rt.images || [], status: rt.status });
    setImagePreview(rt.images || []);
    setShowModal(true);
  };

  const handleImageUpload = (e) => {
    const files = Array.from(e.target.files);
    files.forEach(file => {
      if (file.size > 2 * 1024 * 1024) { toast.error(`${file.name}: Máximo 2MB`); return; }
      const reader = new FileReader();
      reader.onload = (ev) => {
        const b64 = ev.target.result;
        setForm(f => ({ ...f, images: [...f.images, b64] }));
        setImagePreview(p => [...p, b64]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (idx) => {
    setForm(f => ({ ...f, images: f.images.filter((_, i) => i !== idx) }));
    setImagePreview(p => p.filter((_, i) => i !== idx));
  };

  const toggleAmenity = (name) => {
    setForm(f => ({
      ...f,
      amenities: f.amenities.includes(name) ? f.amenities.filter(a => a !== name) : [...f.amenities, name],
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name) { toast.error('El nombre es requerido'); return; }
    setSaving(true);
    try {
      const payload = { ...form, base_price: parseFloat(form.base_price) || 0, capacity: parseInt(form.capacity) || 2 };
      if (editId) {
        await api.patch(`/room-types/${editId}`, payload);
        toast.success('Tipo de habitación actualizado');
      } else {
        await api.post('/room-types', payload);
        toast.success('Tipo de habitación creado');
      }
      setShowModal(false);
      fetchData();
    } catch (err) { toast.error(err.response?.data?.detail || 'Error al guardar'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Eliminar este tipo de habitación?')) return;
    try { await api.delete(`/room-types/${id}`); toast.success('Eliminado'); fetchData(); }
    catch (err) { toast.error(err.response?.data?.detail || 'Error al eliminar'); }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>Tipos de Habitación</h1>
          <p className="text-sm text-slate-500">{roomTypes.length} tipo(s) configurado(s)</p>
        </div>
        <button data-testid="add-room-type-btn" onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors"
          style={{ background: '#625746' }}>
          <Plus size={15} />Nuevo Tipo
        </button>
      </div>

      {/* Room types grid */}
      {roomTypes.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <Image size={40} className="text-slate-200 mx-auto mb-3" />
          <p className="text-slate-500 font-medium mb-1">Sin tipos de habitación</p>
          <p className="text-slate-400 text-sm">Crea el primer tipo de habitación</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {roomTypes.map(rt => (
            <div key={rt.id} data-testid={`room-type-${rt.id}`} className={`bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden ${rt.status !== 'active' ? 'opacity-60' : ''}`}>
              {/* Image */}
              {rt.images?.[0] ? (
                <div className="h-36 overflow-hidden">
                  <img src={rt.images[0]} alt={rt.name} className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="h-36 bg-slate-100 flex items-center justify-center">
                  <Image size={32} className="text-slate-300" />
                </div>
              )}
              <div className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="font-semibold text-slate-800">{rt.name}</h3>
                    <p className="text-xs text-slate-400 mt-0.5">{rt.capacity} personas · ${(rt.base_price || 0).toLocaleString('es-MX')}/noche</p>
                  </div>
                  <div className="flex gap-1 ml-2">
                    <button onClick={() => openEdit(rt)} className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"><Edit2 size={13} /></button>
                    <button onClick={() => handleDelete(rt.id)} className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"><Trash2 size={13} /></button>
                  </div>
                </div>
                {rt.description && <p className="text-xs text-slate-500 leading-relaxed mb-2">{rt.description}</p>}
                {rt.amenities?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {rt.amenities.slice(0, 4).map(a => (
                      <span key={a} className="px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded text-xs">{a}</span>
                    ))}
                    {rt.amenities.length > 4 && <span className="px-1.5 py-0.5 bg-slate-100 text-slate-400 rounded text-xs">+{rt.amenities.length - 4}</span>}
                  </div>
                )}
                {rt.images?.length > 1 && (
                  <p className="text-xs text-blue-500 mt-2">{rt.images.length} imágenes</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
              <h2 className="text-lg font-bold text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>
                {editId ? 'Editar Tipo de Habitación' : 'Nuevo Tipo de Habitación'}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Nombre *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#625746]" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Descripción</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#625746] resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Precio base/noche ($)</label>
                  <input type="number" value={form.base_price} onChange={e => setForm(f => ({ ...f, base_price: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#625746]" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Capacidad (personas)</label>
                  <input type="number" value={form.capacity} onChange={e => setForm(f => ({ ...f, capacity: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#625746]" />
                </div>
              </div>

              {/* Image upload */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Imágenes</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {imagePreview.map((src, idx) => (
                    <div key={idx} className="relative w-20 h-20 rounded-lg overflow-hidden border border-slate-200 group">
                      <img src={src} alt="" className="w-full h-full object-cover" />
                      <button type="button" onClick={() => removeImage(idx)}
                        className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                        <X size={16} className="text-white" />
                      </button>
                    </div>
                  ))}
                  <button type="button" onClick={() => fileInputRef.current?.click()}
                    className="w-20 h-20 rounded-lg border-2 border-dashed border-slate-200 flex flex-col items-center justify-center gap-1 hover:border-slate-400 transition-colors text-slate-400 hover:text-slate-600">
                    <Upload size={18} />
                    <span className="text-xs">Subir</span>
                  </button>
                </div>
                <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleImageUpload} className="hidden" />
                <p className="text-xs text-slate-400">Máx. 2MB por imagen. Formatos: JPG, PNG, WEBP</p>
              </div>

              {/* Amenities */}
              {amenities.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Amenidades</label>
                  <div className="grid grid-cols-3 gap-1.5 max-h-40 overflow-y-auto">
                    {amenities.map(a => {
                      const checked = form.amenities.includes(a.name);
                      return (
                        <label key={a.id} className={`flex items-center gap-1.5 cursor-pointer p-1.5 rounded-lg border text-xs transition-all ${checked ? 'border-[#625746] bg-[#625746]/5 text-[#625746] font-medium' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                          <input type="checkbox" checked={checked} onChange={() => toggleAmenity(a.name)} className="hidden" />
                          {checked && <Check size={11} className="flex-shrink-0" />}
                          <span className="truncate">{a.name}</span>
                        </label>
                      );
                    })}
                  </div>
                  <p className="text-xs text-slate-400 mt-1">{form.amenities.length} amenidades seleccionadas</p>
                </div>
              )}

              {/* Status */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Estado</label>
                <div className="flex gap-2">
                  {[{ v: 'active', label: 'Activo' }, { v: 'inactive', label: 'Inactivo' }].map(({ v, label }) => (
                    <button key={v} type="button" onClick={() => setForm(f => ({ ...f, status: v }))}
                      className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all ${form.status === v ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-700 rounded-lg font-semibold text-sm hover:bg-slate-50">Cancelar</button>
                <button type="submit" disabled={loading}
                  className="flex-1 px-4 py-2.5 text-white rounded-lg font-semibold text-sm transition-all disabled:opacity-60"
                  style={{ background: '#625746' }}>
                  {loading ? 'Guardando...' : editId ? 'Guardar Cambios' : 'Crear Tipo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
