import { useState, useEffect, Fragment } from 'react';
import { useParams } from 'react-router-dom';
import api from '../utils/api';
import { toast } from 'sonner';
import {
  Building2, Sparkles, Users, LayoutGrid, CheckCircle, XCircle,
  Plus, ChevronRight, Cpu, Edit2, Power, PowerOff, Globe2, X, Check,
  ArrowRight, Layers, AlertCircle, Lock, Shield, ChevronDown, ChevronUp,
  DollarSign, TrendingUp, AlertTriangle, Calendar, Ban
} from 'lucide-react';

// ─── helpers ────────────────────────────────────────────────
const PLAN_COLORS = {
  standard:   'bg-slate-100 text-slate-600',
  premium:    'bg-blue-50 text-blue-700',
  enterprise: 'bg-violet-50 text-violet-700',
};
const PLAN_LABELS = { standard: 'Estándar', premium: 'Premium', enterprise: 'Enterprise' };
const PLAN_DEFAULT_PRICES = { standard: 299, premium: 599, enterprise: 1499 };

const BILLING_STATUS_COLORS = {
  'Al corriente':    'bg-emerald-100 text-emerald-700',
  'Próximo a vencer': 'bg-amber-100 text-amber-700',
  'Vencido':         'bg-red-100 text-red-700',
};
const TENANT_STATUS_COLORS = {
  'Activo':    'bg-emerald-100 text-emerald-700',
  'Suspendido': 'bg-red-100 text-red-700',
  'Inactivo':  'bg-slate-100 text-slate-600',
  'En gracia': 'bg-amber-100 text-amber-700',
};

// ─── KPI Card ────────────────────────────────────────────────
const StatCard = ({ label, value, icon: Icon, color, bg, testId }) => (
  <div data-testid={testId} className={`bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex items-center gap-4`}>
    <div className={`w-11 h-11 ${bg} rounded-xl flex items-center justify-center flex-shrink-0`}>
      <Icon size={22} className={color} strokeWidth={1.5} />
    </div>
    <div>
      <p className="text-2xl font-bold text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>{value}</p>
      <p className="text-xs text-slate-500 mt-0.5">{label}</p>
    </div>
  </div>
);

// ─── Section → tab index mapping ─────────────────────────────
const SECTION_TO_TAB = {
  tenants:     1,
  propiedades: 2,
  permisos:    3,
  onboarding:  4,
  usuarios:    5,
  facturacion: 6,
};

// ─── Tenant Form ─────────────────────────────────────────────
const EMPTY_TENANT = { name: '', description: '', contact_email: '', plan: 'standard', status: 'active' };

function TenantTab({ tenants, onRefresh }) {
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(EMPTY_TENANT);
  const [saving, setSaving] = useState(false);

  const openEdit = (t) => { setForm({ name: t.name, description: t.description || '', contact_email: t.contact_email || '', plan: t.plan, status: t.status }); setEditId(t.id); setShowModal(true); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name) { toast.error('El nombre es requerido'); return; }
    setSaving(true);
    try {
      if (editId) {
        await api.patch(`/tenants/${editId}`, form);
        toast.success('Tenant actualizado');
      } else {
        await api.post('/tenants', form);
        toast.success('Tenant creado');
      }
      setShowModal(false);
      onRefresh();
    } catch (err) { toast.error(err.response?.data?.detail || 'Error al guardar'); }
    finally { setSaving(false); }
  };

  const toggleStatus = async (t) => {
    await api.patch(`/tenants/${t.id}`, { status: t.status === 'active' ? 'inactive' : 'active' });
    toast.success('Estado actualizado'); onRefresh();
  };

  const deleteTenant = async (t) => {
    if (!window.confirm(`¿Eliminar el tenant "${t.name}"? Esta acción no se puede deshacer.`)) return;
    try {
      await api.delete(`/tenants/${t.id}`);
      toast.success('Tenant eliminado'); onRefresh();
    } catch (err) { toast.error(err.response?.data?.detail || 'Error al eliminar'); }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{tenants.length} organización(es) registrada(s)</p>
        <button data-testid="add-tenant-btn" onClick={() => { setForm(EMPTY_TENANT); setEditId(null); setShowModal(true); }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors"
          style={{ background: '#625746' }}>
          <Plus size={15} />Nuevo Tenant
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {tenants.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-sm">No hay tenants registrados</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100" style={{ background: '#faf8f3' }}>
                {['Organización', 'Plan', 'Email', 'Estado', 'Creado', ''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {tenants.map(t => (
                <tr key={t.id} className={`hover:bg-slate-50 transition-colors ${t.status !== 'active' ? 'opacity-60' : ''}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-violet-50 flex items-center justify-center"><Globe2 size={14} className="text-violet-600" strokeWidth={1.5} /></div>
                      <div>
                        <p className="font-semibold text-slate-800">{t.name}</p>
                        {t.description && <p className="text-xs text-slate-400 truncate max-w-xs">{t.description}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${PLAN_COLORS[t.plan] || 'bg-slate-100 text-slate-600'}`}>
                      {PLAN_LABELS[t.plan] || t.plan}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">{t.contact_email || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${t.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                      {t.status === 'active' ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">{t.created_at?.split('T')[0] || '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEdit(t)} data-testid={`edit-tenant-${t.id}`}
                        className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"><Edit2 size={13} /></button>
                      <button onClick={() => toggleStatus(t)}
                        className={`p-1.5 rounded transition-colors ${t.status === 'active' ? 'hover:bg-red-50 text-slate-400 hover:text-red-500' : 'hover:bg-emerald-50 text-slate-400 hover:text-emerald-500'}`}>
                        {t.status === 'active' ? <PowerOff size={13} /> : <Power size={13} />}
                      </button>
                      <button data-testid={`delete-tenant-${t.id}`}
                        onClick={() => deleteTenant(t)}
                        className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors" title="Eliminar tenant">
                        <X size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>{editId ? 'Editar Tenant' : 'Nuevo Tenant'}</h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded hover:bg-slate-100 text-slate-400"><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
              {[
                { label: 'Nombre de la organización *', key: 'name', placeholder: 'Ej: Grupo Hotelero Premium', required: true },
                { label: 'Descripción', key: 'description', placeholder: 'Descripción breve...' },
                { label: 'Email de contacto', key: 'contact_email', placeholder: 'contacto@empresa.com', type: 'email' },
              ].map(({ label, key, placeholder, required, type }) => (
                <div key={key}>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">{label}</label>
                  <input value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    placeholder={placeholder} type={type || 'text'} required={required}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2" style={{ '--tw-ring-color': '#625746' }} />
                </div>
              ))}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Plan</label>
                <select value={form.plan} onChange={e => setForm(f => ({ ...f, plan: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none">
                  <option value="standard">Estándar</option>
                  <option value="premium">Premium</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)}
                  className="flex-1 py-2.5 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50">Cancelar</button>
                <button data-testid="save-tenant-btn" type="submit" disabled={saving}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-50"
                  style={{ background: '#625746' }}>
                  <Check size={14} />{saving ? 'Guardando...' : (editId ? 'Actualizar' : 'Crear')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Feature Toggles Config ──────────────────────────────────
const FEATURE_TOGGLES = [
  { key: 'inbox',              label: 'Inbox (Mensajería)' },
  { key: 'tasks',              label: 'Tareas (Kanban)' },
  { key: 'reports',            label: 'Reportes' },
  { key: 'public_catalog',     label: 'Catálogo Público' },
  { key: 'online_booking',     label: 'Reservas Online' },
  { key: 'payments',           label: 'Pagos (Stripe)' },
  { key: 'analytics_dashboard',label: 'Dashboard Analytics' },
];

// ─── Properties Tab with Tenant Assignment + Feature Toggles ─
function PropertiesTab({ properties, tenants, onRefresh }) {
  const [expanded, setExpanded] = useState(null);
  const [toggles, setToggles]   = useState({});
  const [savingToggles, setSavingToggles] = useState(false);

  const loadToggles = async (propId) => {
    if (expanded === propId) { setExpanded(null); return; }
    try {
      const res = await api.get(`/properties/${propId}/features`);
      setToggles(t => ({ ...t, [propId]: res.data }));
    } catch { setToggles(t => ({ ...t, [propId]: {} })); }
    setExpanded(propId);
  };

  const saveToggles = async (propId) => {
    setSavingToggles(true);
    try {
      await api.patch(`/properties/${propId}/features`, toggles[propId] || {});
      toast.success('Módulos actualizados');
    } catch { toast.error('Error al guardar'); }
    setSavingToggles(false);
  };

  const assignTenant = async (propId, tenantId) => {
    await api.patch(`/properties/${propId}`, { tenant_id: tenantId });
    toast.success('Tenant asignado'); onRefresh();
  };

  const toggleProp = async (p) => {
    await api.patch(`/properties/${p.id}`, { status: p.status === 'active' ? 'inactive' : 'active' });
    toast.success('Estado actualizado'); onRefresh();
  };

  const deleteProp = async (p) => {
    if (!window.confirm(`¿Eliminar la propiedad "${p.name}"? Esta acción no se puede deshacer.`)) return;
    try {
      await api.delete(`/properties/${p.id}`);
      toast.success('Propiedad eliminada'); onRefresh();
    } catch (err) { toast.error(err.response?.data?.detail || 'Error al eliminar'); }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      {properties.length === 0 ? (
        <div className="p-12 text-center text-slate-400 text-sm">No hay propiedades</div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100" style={{ background: '#faf8f3' }}>
              {['Propiedad', 'Tipo', 'Tenant Asignado', 'Estado', 'Módulos', ''].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {properties.map(p => {
              const tenant = tenants.find(t => t.id === p.tenant_id);
              const isExp = expanded === p.id;
              const propToggles = toggles[p.id] || {};
              return (
                <Fragment key={p.id}>
                  <tr className={`hover:bg-slate-50 transition-colors border-b border-slate-50 ${p.status !== 'active' ? 'opacity-60' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${p.type === 'hotel' ? 'bg-emerald-50' : 'bg-violet-50'}`}>
                          {p.type === 'hotel' ? <Building2 size={14} className="text-emerald-600" strokeWidth={1.5} /> : <Sparkles size={14} className="text-violet-600" strokeWidth={1.5} />}
                        </div>
                        <p className="font-semibold text-slate-800">{p.name}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${p.type === 'hotel' ? 'bg-emerald-50 text-emerald-700' : 'bg-violet-50 text-violet-700'}`}>
                        {p.type === 'hotel' ? 'Hotel' : 'Jardín'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <select value={p.tenant_id || ''} onChange={e => assignTenant(p.id, e.target.value)}
                        className="text-xs border border-slate-200 rounded px-2 py-1 bg-white focus:outline-none max-w-[180px]">
                        <option value="">Sin tenant</option>
                        {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${p.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                        {p.status === 'active' ? 'Activa' : 'Inactiva'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button data-testid={`toggle-features-${p.id}`}
                        onClick={() => loadToggles(p.id)}
                        className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded transition-colors ${isExp ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                        <Layers size={12} />{isExp ? 'Cerrar' : 'Módulos'}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => toggleProp(p)}
                          className={`p-1.5 rounded transition-colors ${p.status === 'active' ? 'hover:bg-red-50 text-slate-400 hover:text-red-500' : 'hover:bg-emerald-50 text-slate-400 hover:text-emerald-500'}`}>
                          {p.status === 'active' ? <PowerOff size={13} /> : <Power size={13} />}
                        </button>
                        <button data-testid={`delete-prop-${p.id}`}
                          onClick={() => deleteProp(p)}
                          className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors" title="Eliminar propiedad">
                          <X size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                  {isExp && (
                    <tr key={`${p.id}-toggles`}>
                      <td colSpan={6} className="px-4 py-4 bg-slate-50 border-b border-slate-100">
                        <div className="space-y-3">
                          <p className="text-xs font-semibold text-slate-600 mb-2">Módulos habilitados para <strong>{p.name}</strong></p>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                            {FEATURE_TOGGLES.map(({ key, label }) => (
                              <label key={key} className="flex items-center gap-2 cursor-pointer select-none p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition-colors">
                                <input type="checkbox"
                                  checked={propToggles[key] !== false}
                                  onChange={e => setToggles(t => ({ ...t, [p.id]: { ...propToggles, [key]: e.target.checked } }))}
                                  className="w-4 h-4 rounded accent-slate-800" />
                                <span className="text-xs text-slate-700">{label}</span>
                              </label>
                            ))}
                          </div>
                          <div className="flex justify-end">
                            <button data-testid={`save-toggles-${p.id}`}
                              onClick={() => saveToggles(p.id)} disabled={savingToggles}
                              className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold text-white disabled:opacity-50 transition-colors"
                              style={{ background: '#625746' }}>
                              <Check size={13} />{savingToggles ? 'Guardando...' : 'Guardar módulos'}
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ─── Room Types Tab ───────────────────────────────────────────
const EMPTY_RT = { name: '', description: '', base_price: '', capacity: 2, amenities: [], images: [], status: 'active' };

function RoomTypesTab({ roomTypes, amenities, onRefresh }) {
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId]       = useState(null);
  const [form, setForm]           = useState(EMPTY_RT);
  const [saving, setSaving]       = useState(false);
  const [imageInput, setImageInput] = useState('');
  const [showAmenitiesMgr, setShowAmenitiesMgr] = useState(false);
  const [newAmenity, setNewAmenity] = useState({ name: '', category: 'general' });
  const [addingAmenity, setAddingAmenity] = useState(false);

  const openEdit = (rt) => {
    setForm({ name: rt.name, description: rt.description || '', base_price: rt.base_price, capacity: rt.capacity, amenities: rt.amenities || [], images: rt.images || [], status: rt.status });
    setEditId(rt.id); setShowModal(true); setImageInput('');
  };

  const openCreate = () => { setForm(EMPTY_RT); setEditId(null); setShowModal(true); setImageInput(''); };

  const toggleAmenity = (id) => setForm(f => ({
    ...f, amenities: f.amenities.includes(id) ? f.amenities.filter(a => a !== id) : [...f.amenities, id]
  }));

  const addImage = () => {
    if (!imageInput.trim()) return;
    setForm(f => ({ ...f, images: [...f.images, imageInput.trim()] }));
    setImageInput('');
  };

  const removeImage = (idx) => setForm(f => ({ ...f, images: f.images.filter((_, i) => i !== idx) }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name) { toast.error('El nombre es requerido'); return; }
    setSaving(true);
    try {
      const payload = { ...form, base_price: parseFloat(form.base_price) || 0, capacity: parseInt(form.capacity) };
      if (editId) {
        await api.patch(`/room-types/${editId}`, payload);
        toast.success('Tipo actualizado');
      } else {
        await api.post('/room-types', payload);
        toast.success('Tipo creado');
      }
      setShowModal(false); onRefresh();
    } catch (err) { toast.error(err.response?.data?.detail || 'Error al guardar'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Eliminar este tipo de habitación?')) return;
    await api.delete(`/room-types/${id}`);
    toast.success('Eliminado'); onRefresh();
  };

  const handleAddAmenity = async (e) => {
    e.preventDefault();
    if (!newAmenity.name) return;
    setAddingAmenity(true);
    try {
      await api.post('/amenities', newAmenity);
      toast.success('Amenidad agregada'); setNewAmenity({ name: '', category: 'general' }); onRefresh();
    } catch (err) { toast.error(err.response?.data?.detail || 'Error'); }
    finally { setAddingAmenity(false); }
  };

  const handleDeleteAmenity = async (id) => {
    await api.delete(`/amenities/${id}`);
    toast.success('Eliminada'); onRefresh();
  };

  const groupedAmenities = amenities.reduce((acc, a) => {
    if (!acc[a.category]) acc[a.category] = [];
    acc[a.category].push(a);
    return acc;
  }, {});

  const CATEGORY_LABELS = { general: 'General', connectivity: 'Conectividad', entertainment: 'Entretenimiento', climate: 'Clima', bathroom: 'Baño', food: 'Alimentos', sleeping: 'Descanso', outdoor: 'Exterior', view: 'Vista', service: 'Servicios', security: 'Seguridad' };

  return (
    <div className="space-y-5">
      {/* Room Types list */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{roomTypes.length} tipo(s) de habitación</p>
        <div className="flex items-center gap-2">
          <button data-testid="manage-amenities-btn" onClick={() => setShowAmenitiesMgr(v => !v)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${showAmenitiesMgr ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
            <Cpu size={14} />Catálogo de Amenidades
          </button>
          <button data-testid="add-room-type-btn" onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white"
            style={{ background: '#625746' }}>
            <Plus size={15} />Nuevo Tipo
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {roomTypes.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-sm">Sin tipos de habitación</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100" style={{ background: '#faf8f3' }}>
                {['Nombre', 'Precio base', 'Capacidad', 'Amenidades', 'Imágenes', 'Estado', ''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {roomTypes.map(rt => (
                <tr key={rt.id} className={`hover:bg-slate-50 transition-colors ${rt.status !== 'active' ? 'opacity-60' : ''}`}>
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-semibold text-slate-800">{rt.name}</p>
                      {rt.description && <p className="text-xs text-slate-400 truncate max-w-[180px]">{rt.description}</p>}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-700">${(rt.base_price || 0).toLocaleString('es-MX')}</td>
                  <td className="px-4 py-3 text-slate-600">{rt.capacity} pers.</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full text-xs font-medium">
                      {(rt.amenities || []).length} amenidades
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full text-xs font-medium">
                      {(rt.images || []).length} imagen(es)
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${rt.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {rt.status === 'active' ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button data-testid={`edit-rt-${rt.id}`} onClick={() => openEdit(rt)}
                        className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"><Edit2 size={13} /></button>
                      <button onClick={() => handleDelete(rt.id)}
                        className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"><X size={13} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Amenities Catalog Manager */}
      {showAmenitiesMgr && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
          <h3 className="font-semibold text-slate-800" style={{ fontFamily: 'Manrope, sans-serif' }}>Catálogo de Amenidades</h3>
          <form onSubmit={handleAddAmenity} className="flex items-end gap-3">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-slate-600 mb-1">Nombre</label>
              <input value={newAmenity.name} onChange={e => setNewAmenity(a => ({ ...a, name: e.target.value }))}
                placeholder="Ej: Terraza privada" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Categoría</label>
              <select value={newAmenity.category} onChange={e => setNewAmenity(a => ({ ...a, category: e.target.value }))}
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none">
                {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <button type="submit" disabled={addingAmenity}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: '#625746' }}>
              <Plus size={14} />Agregar
            </button>
          </form>
          <div className="space-y-3">
            {Object.entries(groupedAmenities).map(([cat, items]) => (
              <div key={cat}>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">{CATEGORY_LABELS[cat] || cat}</p>
                <div className="flex flex-wrap gap-2">
                  {items.map(a => (
                    <div key={a.id} className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-full text-xs">
                      <span className="text-slate-700">{a.name}</span>
                      <button onClick={() => handleDeleteAmenity(a.id)} className="text-slate-300 hover:text-red-400 transition-colors"><X size={11} /></button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Room Type Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
              <h2 className="text-lg font-bold text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>
                {editId ? 'Editar Tipo de Habitación' : 'Nuevo Tipo de Habitación'}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded hover:bg-slate-100 text-slate-400"><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Nombre *</label>
                  <input data-testid="rt-name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="Ej: Junior Suite" required className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Precio base / noche (MXN)</label>
                  <input data-testid="rt-price" type="number" min="0" step="0.01" value={form.base_price}
                    onChange={e => setForm(f => ({ ...f, base_price: e.target.value }))}
                    placeholder="1200.00" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Capacidad (personas)</label>
                  <input type="number" min="1" max="20" value={form.capacity}
                    onChange={e => setForm(f => ({ ...f, capacity: parseInt(e.target.value) }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Descripción</label>
                  <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    rows={2} placeholder="Descripción del tipo de habitación..."
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none resize-none" />
                </div>
              </div>

              {/* Amenities selection */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-2">Amenidades</label>
                <div className="space-y-3 border border-slate-200 rounded-lg p-3 max-h-48 overflow-y-auto">
                  {Object.entries(groupedAmenities).map(([cat, items]) => (
                    <div key={cat}>
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">{CATEGORY_LABELS[cat] || cat}</p>
                      <div className="flex flex-wrap gap-2">
                        {items.map(a => {
                          const sel = form.amenities.includes(a.id);
                          return (
                            <button key={a.id} type="button" onClick={() => toggleAmenity(a.id)}
                              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all border ${sel ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'}`}>
                              {a.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  {amenities.length === 0 && <p className="text-xs text-slate-400">No hay amenidades en el catálogo.</p>}
                </div>
                {form.amenities.length > 0 && (
                  <p className="text-xs text-slate-500 mt-1">{form.amenities.length} amenidades seleccionadas</p>
                )}
              </div>

              {/* Images */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Imágenes (URLs)</label>
                <div className="flex gap-2 mb-2">
                  <input data-testid="rt-image-input" value={imageInput} onChange={e => setImageInput(e.target.value)}
                    placeholder="https://..." className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none" />
                  <button type="button" onClick={addImage}
                    className="px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50">
                    Agregar
                  </button>
                </div>
                <div className="space-y-1">
                  {form.images.map((img, i) => (
                    <div key={i} className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 rounded-lg border border-slate-100">
                      <span className="text-xs text-slate-500 flex-1 truncate">{img}</span>
                      <button type="button" onClick={() => removeImage(i)} className="text-slate-300 hover:text-red-400 transition-colors"><X size={12} /></button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Status */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Estado</label>
                <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none">
                  <option value="active">Activo</option>
                  <option value="inactive">Inactivo</option>
                </select>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)}
                  className="flex-1 py-2.5 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50">Cancelar</button>
                <button data-testid="save-room-type-btn" type="submit" disabled={saving}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-50"
                  style={{ background: '#625746' }}>
                  <Check size={14} />{saving ? 'Guardando...' : (editId ? 'Actualizar' : 'Crear')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}


// ─── Role Permissions Tab ─────────────────────────────────────
const ALL_MODULES = [
  // Hotel / plataforma
  { key: 'dashboard',       label: 'Dashboard Operacional' },
  { key: 'reservations',    label: 'Reservas' },
  { key: 'rooms',           label: 'Habitaciones' },
  { key: 'guests',          label: 'Huéspedes' },
  { key: 'jardines',        label: 'Jardines (Operacional)' },
  { key: 'inbox',           label: 'Inbox (Mensajería)' },
  { key: 'tasks',           label: 'Tareas' },
  { key: 'catalog',         label: 'Catálogo Público' },
  { key: 'reports',         label: 'Reportes' },
  { key: 'manager_financial_view', label: 'Finanzas solo propiedades (gerente)' },
  { key: 'staff',           label: 'Personal' },
  { key: 'properties',      label: 'Propiedades' },
  { key: 'corporate',       label: 'Dashboard Corporativo' },
  { key: 'hotels',          label: 'Vista Hoteles' },
  { key: 'event-gardens',   label: 'Vista Jardines' },
  // Jardines — módulos dedicados (Phase 1 templates)
  { key: 'garden_dashboard',          label: 'Dashboard Jardín' },
  { key: 'garden_event_bookings',     label: 'Eventos Jardín' },
  { key: 'garden_event_spaces',       label: 'Espacios Jardín' },
  { key: 'garden_lodging_integration',label: 'Hospedaje Jardín' },
  { key: 'garden_guest_list',         label: 'Invitados / Lista' },
  { key: 'garden_sales',              label: 'Ventas Jardín' },
];

const ROLES_EDITABLE = [
  // Roles hotel
  { value: 'admin',        label: 'Grupo — Administrador',        color: 'bg-emerald-50 text-emerald-700' },
  { value: 'owner',        label: 'Hotel — Propietario',  color: 'bg-violet-50 text-violet-700' },
  { value: 'manager',      label: 'Hotel — Gerente',      color: 'bg-teal-50 text-teal-700' },
  { value: 'finance',      label: 'Hotel — Finanzas',     color: 'bg-cyan-50 text-cyan-800' },
  { value: 'receptionist', label: 'Hotel — Recepción',    color: 'bg-blue-50 text-blue-700' },
  { value: 'housekeeping', label: 'Hotel — Housekeeping', color: 'bg-amber-50 text-amber-700' },
  { value: 'maintenance',  label: 'Hotel — Mantenimiento',color: 'bg-orange-50 text-orange-700' },
  { value: 'security',     label: 'Hotel — Seguridad',    color: 'bg-red-50 text-red-700' },
  { value: 'restaurant',   label: 'Hotel — Restaurante',  color: 'bg-pink-50 text-pink-700' },
  // Roles jardín (nuevos)
  { value: 'garden_admin',      label: 'Jardín — Admin',      color: 'bg-emerald-50 text-emerald-700' },
  { value: 'garden_manager',    label: 'Jardín — Manager',    color: 'bg-blue-50 text-blue-700' },
  { value: 'garden_sales',      label: 'Jardín — Ventas',     color: 'bg-purple-50 text-purple-700' },
  { value: 'garden_reception',  label: 'Jardín — Recepción',  color: 'bg-amber-50 text-amber-700' },
  { value: 'garden_staff',      label: 'Jardín — Staff',      color: 'bg-slate-50 text-slate-700' },
];

function RolePermissionsTab() {
  const [perms, setPerms] = useState({});
  const [saving, setSaving] = useState(null);
  const [activeRole, setActiveRole] = useState('admin');

  const fetchPerms = async () => {
    try { const r = await api.get('/role-permissions'); setPerms(r.data); } catch {}
  };

  useEffect(() => { fetchPerms(); }, []);

  const toggle = (role, mod) => {
    setPerms(p => {
      const mods = p[role] || [];
      return { ...p, [role]: mods.includes(mod) ? mods.filter(m => m !== mod) : [...mods, mod] };
    });
  };

  const saveRole = async (role) => {
    setSaving(role);
    try {
      await api.put(`/role-permissions/${role}`, { modules: perms[role] || [] });
      toast.success(`Permisos de ${role} actualizados`);
    } catch { toast.error('Error al guardar'); }
    finally { setSaving(null); }
  };

  const currentRoleCfg = ROLES_EDITABLE.find(r => r.value === activeRole);
  const currentMods = perms[activeRole] || [];

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 mb-1">
        <Shield size={16} className="text-slate-500" />
        <p className="text-sm text-slate-500">Módulos por defecto de cada rol. Los usuarios con este rol verán estos módulos a menos que tengan permisos personalizados en Usuarios. Los cambios se aplican en el próximo inicio de sesión.</p>
      </div>
      <div className="flex gap-2 flex-wrap">
        {ROLES_EDITABLE.map(r => (
          <button key={r.value} data-testid={`perm-role-${r.value}`}
            onClick={() => setActiveRole(r.value)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${activeRole === r.value ? 'border-slate-900 bg-slate-900 text-white' : `border-slate-200 ${r.color} hover:border-slate-400`}`}>
            {r.label}
          </button>
        ))}
      </div>
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="font-semibold text-slate-800 text-sm" style={{ fontFamily: 'Manrope, sans-serif' }}>
              Módulos para <span className={`px-2 py-0.5 rounded-full text-xs ${currentRoleCfg?.color}`}>{currentRoleCfg?.label}</span>
            </p>
            <p className="text-xs text-slate-400 mt-0.5">{currentMods.length} de {ALL_MODULES.length} módulos habilitados</p>
          </div>
          <button data-testid={`save-perms-${activeRole}`}
            onClick={() => saveRole(activeRole)} disabled={saving === activeRole}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
            style={{ background: '#625746' }}>
            <Check size={13} />{saving === activeRole ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {ALL_MODULES.map(({ key, label }) => {
            const enabled = currentMods.includes(key);
            return (
              <label key={key} className={`flex items-center gap-2.5 cursor-pointer select-none p-3 rounded-lg border transition-all ${enabled ? 'border-slate-800 bg-slate-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
                <input type="checkbox" checked={enabled} onChange={() => toggle(activeRole, key)}
                  className="w-4 h-4 rounded accent-slate-800" />
                <span className="text-xs text-slate-700 font-medium">{label}</span>
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}


// ─── Onboarding Wizard ───────────────────────────────────────
const STEP_LABELS = ['Propiedad', 'Configuración', 'Equipo', 'Resumen'];

const EMPTY_WIZ = {
  property_type: 'hotel', name: '', description: '', address: '', tenant_id: '',
  num_floors: 2, num_rooms_per_floor: 5, room_types_config: [],
  spaces: [{ space_name: 'Jardín Principal', capacity: 200, price_per_event: 30000 }],
  owner_name: '', owner_email: '', admin_name: '', admin_email: '',
};

function OnboardingWizard({ tenants, roomTypes, onRefresh }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(EMPTY_WIZ);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async () => {
    if (!form.name) { toast.error('El nombre es requerido'); return; }
    setLoading(true);
    try {
      const res = await api.post('/platform/onboard', {
        ...form,
        num_floors: parseInt(form.num_floors),
        num_rooms_per_floor: parseInt(form.num_rooms_per_floor),
      });
      setResult(res.data);
      toast.success('Propiedad creada exitosamente');
      onRefresh();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al crear propiedad');
    } finally {
      setLoading(false);
    }
  };

  if (result) return (
    <div className="bg-white rounded-xl border border-emerald-200 shadow-sm p-8 text-center space-y-4">
      <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
        <CheckCircle size={28} className="text-emerald-600" strokeWidth={1.5} />
      </div>
      <h3 className="text-xl font-bold text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>
        ¡Propiedad creada exitosamente!
      </h3>
      <div className="text-sm text-slate-600 space-y-1">
        <p><strong>{result.property_name}</strong> — ID: <code className="text-xs bg-slate-100 px-1 rounded">{result.property_id}</code></p>
        {result.created_rooms > 0 && <p>✓ {result.created_rooms} habitaciones creadas</p>}
        {result.created_spaces > 0 && <p>✓ {result.created_spaces} espacios de eventos creados</p>}
        {result.created_users?.map(u => (
          <p key={u.email}>✓ Usuario {u.role}: <strong>{u.email}</strong> (contraseña temporal: <code>{u.temp_password}</code>)</p>
        ))}
      </div>
      <button onClick={() => { setResult(null); setStep(0); setForm(EMPTY_WIZ); }}
        className="px-6 py-2.5 rounded-lg text-sm font-semibold text-white" style={{ background: '#625746' }}>
        Crear otra propiedad
      </button>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Progress */}
      <div className="flex items-center gap-2">
        {STEP_LABELS.map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${i === step ? 'bg-slate-900 text-white' : i < step ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-400'}`}>
                {i < step ? <Check size={12} /> : i + 1}
              </div>
              <span className={`text-xs font-medium hidden sm:block ${i === step ? 'text-slate-900' : 'text-slate-400'}`}>{label}</span>
            </div>
            {i < STEP_LABELS.length - 1 && <ChevronRight size={14} className="text-slate-300" />}
          </div>
        ))}
      </div>

      {/* Step content */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        {step === 0 && (
          <div className="space-y-4">
            <h3 className="font-semibold text-slate-800" style={{ fontFamily: 'Manrope, sans-serif' }}>Información de la propiedad</h3>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Tipo de propiedad *</label>
              <div className="flex gap-3">
                {[{ k: 'hotel', label: 'Hotel', icon: Building2 }, { k: 'event_garden', label: 'Jardín de Eventos', icon: Sparkles }].map(({ k, label, icon: Icon }) => (
                  <button key={k} type="button" onClick={() => set('property_type', k)}
                    className={`flex-1 flex items-center gap-2 p-3 rounded-lg border text-sm font-medium transition-all ${form.property_type === k ? 'border-slate-900 bg-slate-50' : 'border-slate-200 hover:border-slate-300'}`}>
                    <Icon size={16} strokeWidth={1.5} />{label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Nombre de la propiedad *</label>
              <input data-testid="wiz-name" value={form.name} onChange={e => set('name', e.target.value)}
                placeholder="Ej: Hotel Boutique Cancún" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none" required />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Tenant / Organización *</label>
              <select data-testid="wiz-tenant" value={form.tenant_id} onChange={e => set('tenant_id', e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none">
                <option value="">Seleccionar tenant...</option>
                {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Descripción</label>
                <input value={form.description} onChange={e => set('description', e.target.value)}
                  placeholder="Descripción breve..." className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Dirección</label>
                <input value={form.address} onChange={e => set('address', e.target.value)}
                  placeholder="Dirección de la propiedad" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none" />
              </div>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-5">
            <h3 className="font-semibold text-slate-800" style={{ fontFamily: 'Manrope, sans-serif' }}>
              Configuración de {form.property_type === 'hotel' ? 'habitaciones' : 'espacios'}
            </h3>
            {form.property_type === 'hotel' ? (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Número de pisos</label>
                    <input type="number" min="1" max="50" value={form.num_floors} onChange={e => set('num_floors', e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none" data-testid="wiz-floors" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Hab. por piso</label>
                    <input type="number" min="1" max="30" value={form.num_rooms_per_floor} onChange={e => set('num_rooms_per_floor', e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none" data-testid="wiz-rooms-per-floor" />
                  </div>
                </div>
                <div className="p-4 bg-blue-50 rounded-lg">
                  <p className="text-sm font-semibold text-blue-800">Total de habitaciones a crear: {parseInt(form.num_floors) * parseInt(form.num_rooms_per_floor)}</p>
                  <p className="text-xs text-blue-600 mt-0.5">Se numerarán automáticamente a partir del 101</p>
                </div>
                {roomTypes.length > 0 && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-2">Tipo de habitación base</label>
                    <div className="grid grid-cols-2 gap-2">
                      {roomTypes.map(rt => {
                        const selected = form.room_types_config.some(c => c.room_type_id === rt.id);
                        return (
                          <button key={rt.id} type="button"
                            onClick={() => set('room_types_config', selected ? [] : [{ room_type_id: rt.id }])}
                            className={`text-left p-3 rounded-lg border text-xs font-medium transition-all ${selected ? 'border-slate-900 bg-slate-50' : 'border-slate-200 hover:border-slate-300'}`}>
                            <p className="font-semibold">{rt.name}</p>
                            <p className="text-slate-500">${rt.base_price.toLocaleString('es-MX')}/noche</p>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="space-y-3">
                {form.spaces.map((s, i) => (
                  <div key={i} className="grid grid-cols-3 gap-3 p-3 border border-slate-200 rounded-lg">
                    <input value={s.space_name} onChange={e => {
                      const sp = [...form.spaces]; sp[i].space_name = e.target.value; set('spaces', sp);
                    }} placeholder="Nombre del espacio" className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none" />
                    <input type="number" value={s.capacity} onChange={e => {
                      const sp = [...form.spaces]; sp[i].capacity = parseInt(e.target.value); set('spaces', sp);
                    }} placeholder="Capacidad" className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none" />
                    <div className="flex gap-1">
                      <input type="number" value={s.price_per_event} onChange={e => {
                        const sp = [...form.spaces]; sp[i].price_per_event = parseFloat(e.target.value); set('spaces', sp);
                      }} placeholder="Precio base" className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none" />
                      {form.spaces.length > 1 && (
                        <button type="button" onClick={() => set('spaces', form.spaces.filter((_, j) => j !== i))}
                          className="p-1.5 text-red-400 hover:text-red-600"><X size={13} /></button>
                      )}
                    </div>
                  </div>
                ))}
                <button type="button" onClick={() => set('spaces', [...form.spaces, { space_name: '', capacity: 100, price_per_event: 10000 }])}
                  className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700">
                  <Plus size={13} />Agregar espacio
                </button>
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <h3 className="font-semibold text-slate-800" style={{ fontFamily: 'Manrope, sans-serif' }}>Cuentas del equipo</h3>
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
              <AlertCircle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" strokeWidth={1.5} />
              <p className="text-xs text-amber-700">Las contraseñas temporales serán <strong>owner123</strong> y <strong>admin123</strong>. El usuario debe cambiarlas al primer inicio.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { role: 'Owner (Dueño)', nameKey: 'owner_name', emailKey: 'owner_email' },
                { role: 'Admin (Gerente)', nameKey: 'admin_name', emailKey: 'admin_email' },
              ].map(({ role, nameKey, emailKey }) => (
                <div key={role} className="p-4 border border-slate-200 rounded-xl space-y-3">
                  <p className="text-xs font-semibold text-slate-700">{role}</p>
                  <input value={form[nameKey]} onChange={e => set(nameKey, e.target.value)}
                    placeholder="Nombre completo" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none" />
                  <input type="email" value={form[emailKey]} onChange={e => set(emailKey, e.target.value)}
                    placeholder="correo@empresa.com" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none" />
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h3 className="font-semibold text-slate-800" style={{ fontFamily: 'Manrope, sans-serif' }}>Resumen y confirmación</h3>
            {[
              { label: 'Propiedad', value: `${form.name} (${form.property_type === 'hotel' ? 'Hotel' : 'Jardín de Eventos'})` },
              { label: 'Tenant', value: tenants.find(t => t.id === form.tenant_id)?.name || '(sin tenant)' },
              ...(form.property_type === 'hotel' ? [{ label: 'Habitaciones a crear', value: `${parseInt(form.num_floors) * parseInt(form.num_rooms_per_floor)} (${form.num_floors} pisos × ${form.num_rooms_per_floor} hab.)` }] : []),
              ...(form.property_type === 'event_garden' ? [{ label: 'Espacios a crear', value: `${form.spaces.length} espacio(s)` }] : []),
              ...(form.owner_email ? [{ label: 'Owner', value: form.owner_email }] : []),
              ...(form.admin_email ? [{ label: 'Admin', value: form.admin_email }] : []),
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between py-2 border-b border-slate-100">
                <span className="text-xs text-slate-500">{label}</span>
                <span className="text-sm font-semibold text-slate-800">{value}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button onClick={() => setStep(s => s - 1)} disabled={step === 0}
          className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-30">
          Anterior
        </button>
        {step < 3 ? (
          <button onClick={() => {
            if (step === 0 && !form.name) { toast.error('El nombre es requerido'); return; }
            setStep(s => s + 1);
          }} className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold text-white" style={{ background: '#625746' }}>
            Continuar <ArrowRight size={15} />
          </button>
        ) : (
          <button data-testid="wiz-submit" onClick={handleSubmit} disabled={loading}
            className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50" style={{ background: '#625746' }}>
            {loading ? 'Creando...' : '✓ Crear propiedad'}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Billing Control Panel ───────────────────────────────────
function BillingTab({ tenants, onRefresh }) {
  const [editModal, setEditModal] = useState(null);
  const [editForm, setEditForm]   = useState({ plan: 'standard', plan_price: '', next_billing_date: '', billing_status: '', tenant_status: 'Activo', internal_notes: '' });
  const [saving, setSaving]       = useState(false);

  const patch = async (id, updates, msg) => {
    try { await api.patch(`/tenants/${id}`, updates); toast.success(msg); onRefresh(); }
    catch (err) { toast.error(err.response?.data?.detail || 'Error'); }
  };

  const markPaid    = (t) => patch(t.id, { billing_status: 'Al corriente', tenant_status: 'Activo', status: 'active' }, 'Marcado como pagado');
  const markOverdue = (t) => patch(t.id, { billing_status: 'Vencido' }, 'Marcado como vencido');
  const suspend     = (t) => {
    if (!window.confirm(`¿Suspender "${t.name}"? Sus usuarios no podrán acceder al sistema.`)) return;
    patch(t.id, { tenant_status: 'Suspendido', status: 'suspended' }, 'Tenant suspendido');
  };
  const reactivate  = (t) => patch(t.id, { tenant_status: 'Activo', status: 'active', billing_status: 'Al corriente' }, 'Tenant reactivado');

  const openEdit = (t) => {
    setEditModal(t);
    setEditForm({
      plan: t.plan || 'standard',
      plan_price: t.plan_price || '',
      next_billing_date: t.next_billing_date ? t.next_billing_date.split('T')[0] : '',
      billing_status: t.billing_status || '',
      tenant_status: t.tenant_status || 'Activo',
      internal_notes: t.internal_notes || '',
    });
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.patch(`/tenants/${editModal.id}`, {
        plan: editForm.plan,
        plan_price: editForm.plan_price ? parseFloat(editForm.plan_price) : null,
        next_billing_date: editForm.next_billing_date || null,
        billing_status: editForm.billing_status || null,
        tenant_status: editForm.tenant_status,
        internal_notes: editForm.internal_notes || null,
        status: editForm.tenant_status === 'Suspendido' ? 'suspended' : editForm.tenant_status === 'Inactivo' ? 'inactive' : 'active',
      });
      toast.success('Plan actualizado'); setEditModal(null); onRefresh();
    } catch { toast.error('Error al guardar'); }
    finally { setSaving(false); }
  };

  const getMonthlyFee = (t) => t.plan_price || PLAN_DEFAULT_PRICES[t.plan] || 299;
  const totalMRR = tenants
    .filter(t => (t.tenant_status || 'Activo') !== 'Suspendido' && (t.tenant_status || 'Activo') !== 'Inactivo')
    .reduce((sum, t) => sum + getMonthlyFee(t), 0);

  return (
    <div className="space-y-5">
      {/* Summary strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'MRR Total',          value: `$${totalMRR.toLocaleString()}`, color: 'text-violet-700 bg-violet-50 border-violet-100' },
          { label: 'Tenants activos',    value: tenants.filter(t => (t.tenant_status || 'Activo') === 'Activo').length, color: 'text-emerald-700 bg-emerald-50 border-emerald-100' },
          { label: 'Suspendidos',        value: tenants.filter(t => (t.tenant_status || 'Activo') === 'Suspendido').length, color: 'text-red-600 bg-red-50 border-red-100' },
          { label: 'Con pago vencido',   value: tenants.filter(t => t.billing_status === 'Vencido').length, color: 'text-orange-600 bg-orange-50 border-orange-100' },
        ].map(({ label, value, color }) => (
          <div key={label} className={`p-3 rounded-lg border flex items-center justify-between ${color}`}>
            <span className="text-xs font-medium">{label}</span>
            <span className="text-xl font-bold" style={{ fontFamily: 'Manrope, sans-serif' }}>{value}</span>
          </div>
        ))}
      </div>

      {/* Billing table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100" style={{ background: '#faf8f3' }}>
                {['Tenant', 'Plan', 'Cuota/mes', 'Estado facturación', 'Próx. vencimiento', 'Estado tenant', 'Notas', 'Acciones'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {tenants.map(t => {
                const fee = getMonthlyFee(t);
                const billingStatus = t.billing_status;
                const tenantStatus  = t.tenant_status || 'Activo';
                return (
                  <tr key={t.id} data-testid={`billing-row-${t.id}`}
                    className={`hover:bg-slate-50 transition-colors ${tenantStatus === 'Suspendido' ? 'bg-red-50/40' : ''}`}>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-800 text-sm">{t.name}</p>
                      <p className="text-xs text-slate-400">{t.contact_email || '—'}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${PLAN_COLORS[t.plan] || 'bg-slate-100 text-slate-600'}`}>
                        {PLAN_LABELS[t.plan] || t.plan}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="font-mono font-bold text-slate-800">${fee.toLocaleString()}</span>
                      <span className="text-xs text-slate-400 ml-0.5">/mes</span>
                    </td>
                    <td className="px-4 py-3">
                      {billingStatus ? (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${BILLING_STATUS_COLORS[billingStatus] || 'bg-slate-100 text-slate-600'}`}>
                          {billingStatus}
                        </span>
                      ) : <span className="text-xs text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                      {t.next_billing_date ? t.next_billing_date.split('T')[0] : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${TENANT_STATUS_COLORS[tenantStatus] || 'bg-slate-100 text-slate-600'}`}>
                        {tenantStatus}
                      </span>
                    </td>
                    <td className="px-4 py-3 max-w-[120px]">
                      <p className="text-xs text-slate-400 truncate" title={t.internal_notes}>{t.internal_notes || '—'}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 flex-wrap">
                        <button data-testid={`mark-paid-${t.id}`} onClick={() => markPaid(t)}
                          className="px-2 py-1 rounded text-xs font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors whitespace-nowrap">
                          ✓ Pagado
                        </button>
                        <button onClick={() => markOverdue(t)}
                          className="px-2 py-1 rounded text-xs font-medium bg-red-50 text-red-700 hover:bg-red-100 transition-colors whitespace-nowrap">
                          Vencido
                        </button>
                        {tenantStatus !== 'Suspendido' ? (
                          <button data-testid={`suspend-btn-${t.id}`} onClick={() => suspend(t)}
                            className="px-2 py-1 rounded text-xs font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors whitespace-nowrap">
                            <Ban size={10} className="inline mr-0.5" />Suspender
                          </button>
                        ) : (
                          <button data-testid={`reactivate-btn-${t.id}`} onClick={() => reactivate(t)}
                            className="px-2 py-1 rounded text-xs font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors whitespace-nowrap">
                            Reactivar
                          </button>
                        )}
                        <button data-testid={`edit-billing-${t.id}`} onClick={() => openEdit(t)}
                          className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
                          <Edit2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Modal */}
      {editModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
              <div>
                <h2 className="text-lg font-bold text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>Editar Plan</h2>
                <p className="text-xs text-slate-400">{editModal.name}</p>
              </div>
              <button onClick={() => setEditModal(null)} className="p-1.5 rounded hover:bg-slate-100 text-slate-400"><X size={18} /></button>
            </div>
            <form onSubmit={saveEdit} className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Plan</label>
                <select value={editForm.plan} onChange={e => setEditForm(f => ({ ...f, plan: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none">
                  <option value="standard">Estándar</option>
                  <option value="premium">Premium</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Cuota mensual (USD)</label>
                <input type="number" step="0.01" value={editForm.plan_price}
                  onChange={e => setEditForm(f => ({ ...f, plan_price: e.target.value }))}
                  placeholder={`Default: $${PLAN_DEFAULT_PRICES[editForm.plan]}`}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none" />
                <p className="text-xs text-slate-400 mt-1">Dejar vacío para usar el precio por defecto del plan</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Estado de facturación</label>
                <select value={editForm.billing_status}
                  onChange={e => setEditForm(f => ({ ...f, billing_status: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none">
                  <option value="">Sin estado</option>
                  <option value="Al corriente">Al corriente</option>
                  <option value="Próximo a vencer">Próximo a vencer</option>
                  <option value="Vencido">Vencido</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Estado del tenant</label>
                <select value={editForm.tenant_status}
                  onChange={e => setEditForm(f => ({ ...f, tenant_status: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none">
                  <option value="Activo">Activo</option>
                  <option value="En gracia">En gracia</option>
                  <option value="Suspendido">Suspendido</option>
                  <option value="Inactivo">Inactivo</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Próximo vencimiento</label>
                <input type="date" value={editForm.next_billing_date}
                  onChange={e => setEditForm(f => ({ ...f, next_billing_date: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Notas internas</label>
                <textarea rows={3} value={editForm.internal_notes}
                  onChange={e => setEditForm(f => ({ ...f, internal_notes: e.target.value }))}
                  placeholder="Notas visibles solo para Platform Admin..."
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none resize-none" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setEditModal(null)}
                  className="flex-1 py-2.5 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50">Cancelar</button>
                <button type="submit" disabled={saving} data-testid="save-billing-btn"
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-50"
                  style={{ background: '#625746' }}>
                  <Check size={14} />{saving ? 'Guardando...' : 'Guardar cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Platform Users Tab ──────────────────────────────────────
const PLATFORM_ADMIN_SUBTYPES = [
  { value: 'platform_admin',  label: 'Platform Admin',  requiresProperty: false },
  { value: 'platform_support', label: 'Platform Support', requiresProperty: false },
  { value: 'billing_admin',   label: 'Billing Admin',   requiresProperty: false },
  { value: 'technical_admin', label: 'Technical Admin', requiresProperty: false },
  { value: 'hotel_admin',     label: 'Admin de hotel (plataforma)',     requiresProperty: true },
];

const ADMIN_TYPE_LABELS = {
  platform_admin: 'Platform Admin', platform_support: 'Platform Support',
  billing_admin: 'Billing Admin', technical_admin: 'Technical Admin', hotel_admin: 'Admin de hotel (plataforma)',
};

const PLATFORM_MODULES = [
  { key: 'dashboard',      label: 'Dashboard' },
  { key: 'reservations',   label: 'Reservas' },
  { key: 'rooms',          label: 'Habitaciones' },
  { key: 'guests',         label: 'Huéspedes' },
  { key: 'jardines',       label: 'Jardines' },
  { key: 'inbox',          label: 'Inbox' },
  { key: 'tasks',          label: 'Tareas' },
  { key: 'catalog',        label: 'Catálogo' },
  { key: 'reports',        label: 'Reportes' },
  { key: 'staff',          label: 'Personal' },
  { key: 'properties',     label: 'Propiedades' },
  { key: 'corporate',      label: 'Dashboard Corp.' },
  { key: 'hotels',         label: 'Vista Hoteles' },
  { key: 'event-gardens',  label: 'Vista Jardines' },
  { key: 'platform_admin', label: 'Platform Admin' },
];

const EMPTY_PUSR = {
  name: '', email: '', password: '', roleGroup: 'admin', adminType: 'platform_admin', gardenRole: 'garden_admin',
  tenantId: '', propertyId: '', isActive: true, customPerms: [], showCustom: false,
};

function PlatformUsersTab({ users, tenants, properties, onRefresh }) {
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId]       = useState(null);
  const [saving, setSaving]       = useState(false);
  const [form, setForm]           = useState(EMPTY_PUSR);

  const platformUsers = users.filter(u =>
    ['platform_admin', 'admin', 'owner', 'manager', 'garden_admin', 'garden_manager', 'garden_sales', 'garden_reception', 'garden_staff'].includes(u.role)
  );
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const openCreate = () => { setForm(EMPTY_PUSR); setEditId(null); setShowModal(true); };

  const openEdit = (u) => {
    let roleGroup = 'admin';
    let adminType = u.admin_type || 'platform_admin';
    let gardenRole = 'garden_admin';
    if (u.role === 'owner') { roleGroup = 'owner'; adminType = null; }
    else if (u.role === 'manager') { roleGroup = 'manager'; adminType = null; }
    else if (u.role === 'admin') { adminType = 'hotel_admin'; }
    else if (u.role && u.role.startsWith('garden_')) { roleGroup = 'garden'; gardenRole = u.role; adminType = null; }
    setForm({
      name: u.name, email: u.email, password: '',
      roleGroup, adminType, gardenRole,
      tenantId: u.tenant_id || '', propertyId: u.property_id || '',
      isActive: u.is_active,
      customPerms: u.custom_permissions || [],
      showCustom: !!u.custom_permissions,
    });
    setEditId(u.id); setShowModal(true);
  };

  const toggleActive = async (u) => {
    await api.put(`/users/${u.id}`, { is_active: !u.is_active });
    toast.success('Estado actualizado'); onRefresh();
  };

  const resolveRolePayload = () => {
    if (form.roleGroup === 'owner')   return { role: 'owner',          admin_type: null };
    if (form.roleGroup === 'manager') return { role: 'manager',        admin_type: null };
    if (form.roleGroup === 'garden')  return { role: form.gardenRole || 'garden_admin', admin_type: null };
    if (form.adminType === 'hotel_admin') return { role: 'admin',      admin_type: 'hotel_admin' };
    return { role: 'platform_admin', admin_type: form.adminType };
  };

  const needsProperty = () =>
    form.roleGroup === 'owner' || form.roleGroup === 'manager' || form.roleGroup === 'garden' || form.adminType === 'hotel_admin';

  const filteredProps = form.tenantId
    ? properties.filter(p => p.tenant_id === form.tenantId)
    : properties;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!editId && !form.password) { toast.error('La contraseña es requerida'); return; }
    const { role, admin_type } = resolveRolePayload();
    const payload = {
      name: form.name, email: form.email, role, admin_type,
      tenant_id: form.tenantId || null,
      property_id: form.propertyId || null,
      is_active: form.isActive,
      custom_permissions: form.showCustom ? form.customPerms : null,
    };
    if (form.password) payload.password = form.password;
    setSaving(true);
    try {
      if (editId) {
        await api.put(`/users/${editId}`, payload);
        toast.success('Usuario actualizado');
      } else {
        await api.post('/users', payload);
        toast.success('Usuario creado');
      }
      setShowModal(false); onRefresh();
    } catch (err) { toast.error(err.response?.data?.detail || 'Error al guardar'); }
    finally { setSaving(false); }
  };

  const getUserRoleDisplay = (u) => {
    if (u.role === 'platform_admin') return { label: ADMIN_TYPE_LABELS[u.admin_type] || 'Platform Admin', color: 'bg-slate-100 text-slate-800' };
    if (u.role === 'admin')    return { label: 'Administrador de grupo',  color: 'bg-emerald-100 text-emerald-700' };
    if (u.role === 'owner')    return { label: 'Propietario',  color: 'bg-violet-100 text-violet-700' };
    if (u.role === 'manager')  return { label: 'Gerente',      color: 'bg-blue-100 text-blue-700' };
    if (u.role === 'garden_admin')     return { label: 'Admin Jardín',     color: 'bg-emerald-50 text-emerald-700' };
    if (u.role === 'garden_manager')   return { label: 'Manager Jardín',   color: 'bg-blue-50 text-blue-700' };
    if (u.role === 'garden_sales')     return { label: 'Ventas Jardín',    color: 'bg-purple-50 text-purple-700' };
    if (u.role === 'garden_reception') return { label: 'Recepción Jardín', color: 'bg-amber-50 text-amber-700' };
    if (u.role === 'garden_staff')     return { label: 'Staff Jardín',     color: 'bg-slate-50 text-slate-700' };
    return { label: u.role, color: 'bg-slate-100 text-slate-600' };
  };

  const getAssignInfo = (u) => {
    if (u.property_id) {
      const prop = properties.find(p => p.id === u.property_id);
      return prop ? prop.name : '—';
    }
    if (u.tenant_id) {
      const tenant = tenants.find(t => t.id === u.tenant_id);
      return tenant ? tenant.name : '—';
    }
    return '—';
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{platformUsers.length} usuario(s) de plataforma</p>
        <button data-testid="add-platform-user-btn" onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors"
          style={{ background: '#625746' }}>
          <Plus size={15} />Nuevo Usuario
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {platformUsers.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-sm">No hay usuarios de plataforma</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100" style={{ background: '#faf8f3' }}>
                {['Usuario', 'Email', 'Tipo', 'Asignación', 'Estado', ''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {platformUsers.map(u => {
                const roleDisplay = getUserRoleDisplay(u);
                return (
                  <tr key={u.id} data-testid={`platform-user-row-${u.id}`}
                    className={`hover:bg-slate-50 transition-colors ${!u.is_active ? 'opacity-60' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                          style={{ backgroundColor: u.avatar_color || '#625746' }}>
                          {u.name?.charAt(0)}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-800">{u.name}</p>
                          {u.custom_permissions && (
                            <span className="text-xs text-violet-600 font-medium">Permisos custom</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{u.email}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${roleDisplay.color}`}>
                        {roleDisplay.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{getAssignInfo(u)}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${u.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                        {u.is_active ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => openEdit(u)} data-testid={`edit-platform-user-${u.id}`}
                          className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                          <Edit2 size={13} />
                        </button>
                        <button onClick={() => toggleActive(u)}
                          className={`p-1.5 rounded transition-colors ${u.is_active ? 'hover:bg-red-50 text-slate-400 hover:text-red-500' : 'hover:bg-emerald-50 text-slate-400 hover:text-emerald-500'}`}>
                          {u.is_active ? <PowerOff size={13} /> : <Power size={13} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
              <h2 className="text-lg font-bold text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>
                {editId ? 'Editar Usuario' : 'Nuevo Usuario de Plataforma'}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded hover:bg-slate-100 text-slate-400"><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
              {/* Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Nombre completo *</label>
                <input value={form.name} onChange={e => set('name', e.target.value)} required
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none" />
              </div>
              {/* Email */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Email *</label>
                <input type="email" value={form.email} onChange={e => set('email', e.target.value)} required
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none" />
              </div>
              {/* Password */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  {editId ? 'Nueva contraseña' : 'Contraseña *'}
                </label>
                <input type="password" value={form.password} onChange={e => set('password', e.target.value)}
                  placeholder={editId ? 'Dejar vacío para no cambiar' : ''}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none" />
              </div>

              {/* Role group */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Rol *</label>
                <div className="flex flex-wrap gap-2">
                  {[{ value: 'admin', label: 'Admin / Plataforma' }, { value: 'owner', label: 'Propietario' }, { value: 'manager', label: 'Gerente Hotel' }, { value: 'garden', label: 'Rol Jardín' }].map(r => (
                    <button key={r.value} type="button"
                      data-testid={`role-group-${r.value}`}
                      onClick={() => { set('roleGroup', r.value); if (r.value !== 'admin') set('adminType', null); }}
                      className={`flex-1 min-w-[120px] py-2 rounded-lg text-sm font-medium border transition-all ${form.roleGroup === r.value ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'}`}>
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Admin type */}
              {form.roleGroup === 'admin' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Tipo de Admin</label>
                  <div className="flex flex-wrap gap-2">
                    {PLATFORM_ADMIN_SUBTYPES.map(t => (
                      <button key={t.value} type="button"
                        data-testid={`admin-type-${t.value}`}
                        onClick={() => set('adminType', t.value)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${form.adminType === t.value ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'}`}>
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Garden role selector */}
              {form.roleGroup === 'garden' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Rol de Jardín</label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { value: 'garden_admin', label: 'Admin Jardín' },
                      { value: 'garden_manager', label: 'Manager Jardín' },
                      { value: 'garden_sales', label: 'Ventas Jardín' },
                      { value: 'garden_reception', label: 'Recepción Jardín' },
                      { value: 'garden_staff', label: 'Staff Jardín' },
                    ].map(r => (
                      <button key={r.value} type="button"
                        data-testid={`garden-role-${r.value}`}
                        onClick={() => set('gardenRole', r.value)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${form.gardenRole === r.value ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'}`}>
                        {r.label}
                      </button>
                    ))}
                  </div>
                  <p className="mt-1 text-[11px] text-slate-400">Los roles de jardín requieren asignar una propiedad tipo Jardín de Eventos.</p>
                </div>
              )}

              {/* Tenant + Property assignment */}
              {needsProperty() && (
                <div className="space-y-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <p className="text-xs font-semibold text-slate-600">Asignación de propiedad (opcional)</p>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Tenant</label>
                    <select value={form.tenantId}
                      onChange={e => { set('tenantId', e.target.value); set('propertyId', ''); }}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none bg-white">
                      <option value="">Sin asignación</option>
                      {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                  {form.tenantId && (
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Propiedad</label>
                      <select value={form.propertyId} onChange={e => set('propertyId', e.target.value)}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none bg-white">
                        <option value="">Sin propiedad específica</option>
                        {filteredProps.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </div>
                  )}
                </div>
              )}

              {/* Estado */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Estado</label>
                <div className="flex gap-2">
                  {[{ v: true, label: 'Activo' }, { v: false, label: 'Inactivo' }].map(({ v, label }) => (
                    <button key={label} type="button"
                      onClick={() => set('isActive', v)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all ${form.isActive === v ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom permissions — available for Admin, Propietario, Gerente (no overrides for Platform Admin) */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => set('showCustom', !form.showCustom)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors text-sm font-semibold text-slate-700"
                  disabled={resolveRolePayload().role === 'platform_admin'}
                >
                  <div className="flex items-center gap-2">
                    <Lock size={14} className="text-violet-600" />
                    Permisos personalizados
                    {resolveRolePayload().role === 'platform_admin' && (
                      <span className="text-xs text-slate-400">(no disponible para Platform Admin)</span>
                    )}
                    {form.showCustom && resolveRolePayload().role !== 'platform_admin' && (
                      <span className="px-1.5 py-0.5 bg-violet-100 text-violet-700 text-xs rounded-full">Activo</span>
                    )}
                  </div>
                  {resolveRolePayload().role !== 'platform_admin' && (
                    form.showCustom ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />
                  )}
                </button>
                {form.showCustom && resolveRolePayload().role !== 'platform_admin' && (
                  <div className="px-4 py-4 space-y-3">
                    <p className="text-xs text-slate-500">
                      Sobreescribe los módulos del rol. Si no activas permisos personalizados, el usuario usará los módulos por defecto de su rol (definidos en Permisos).
                    </p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {PLATFORM_MODULES
                        .filter(({ key }) => {
                          const { role } = resolveRolePayload();
                          if (role === 'owner') {
                            // Owner: solo módulos estratégicos
                            return ['corporate', 'hotels', 'event-gardens', 'reports'].includes(key);
                          }
                          if (role === 'manager') {
                            // Manager: solo módulos coherentes con su rol
                            return [
                              'dashboard', 'reservations', 'rooms', 'guests',
                              'jardines', 'inbox', 'tasks', 'catalog',
                              'reports', 'staff', 'room-types',
                            ].includes(key);
                          }
                          if (role === 'admin') {
                            // Admin: puede ajustar todos los módulos aplicables excepto el módulo de plataforma
                            return key !== 'platform_admin';
                          }
                          return false;
                        })
                        .map(({ key, label }) => {
                          const checked = form.customPerms.includes(key);
                          return (
                            <label
                              key={key}
                              className={`flex items-center gap-2 cursor-pointer p-2 rounded-lg border text-xs transition-all select-none ${checked ? 'border-violet-300 bg-violet-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() =>
                                  set('customPerms',
                                    checked
                                      ? form.customPerms.filter(m => m !== key)
                                      : [...form.customPerms, key],
                                  )
                                }
                                className="w-3.5 h-3.5 accent-violet-600"
                              />
                              <span className="text-slate-700">{label}</span>
                            </label>
                          );
                        })}
                    </div>
                    <p className="text-xs text-slate-400">{form.customPerms.length} módulos seleccionados</p>
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)}
                  className="flex-1 py-2.5 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50">Cancelar</button>
                <button data-testid="save-platform-user-btn" type="submit" disabled={saving}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-50"
                  style={{ background: '#625746' }}>
                  <Check size={14} />{saving ? 'Guardando...' : (editId ? 'Actualizar' : 'Crear')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Platform Admin Panel ───────────────────────────────
export default function PlatformAdmin() {
  const { section } = useParams();
  const activeTab = SECTION_TO_TAB[section] ?? 0; // 0 = Resumen (default)
  const [stats, setStats]         = useState(null);
  const [tenants, setTenants]     = useState([]);
  const [properties, setProperties] = useState([]);
  const [roomTypes, setRoomTypes] = useState([]);
  const [users, setUsers]         = useState([]);

  const fetchAll = async () => {
    try {
      const [s, t, p, rt, us] = await Promise.all([
        api.get('/platform/stats'),
        api.get('/tenants'),
        api.get('/properties'),
        api.get('/room-types'),
        api.get('/users'),
      ]);
      setStats(s.data);
      setTenants(t.data);
      setProperties(p.data);
      setRoomTypes(rt.data);
      setUsers(us.data);
    } catch {}
  };

  useEffect(() => { fetchAll(); }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>
            Staylo Platform Console
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Hospitality Operations Platform</p>
        </div>
        <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 bg-white">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs font-medium text-slate-600">Sistema operativo</span>
        </div>
      </div>

      {/* Stats row — SaaS metrics only */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {[
            { label: 'Tenants activos',   value: stats.tenants_active ?? stats.tenants, icon: CheckCircle,   color: 'text-emerald-600', bg: 'bg-emerald-50', testId: 'plat-active' },
            { label: 'Propiedades',        value: stats.properties,                      icon: LayoutGrid,    color: 'text-blue-600',    bg: 'bg-blue-50',    testId: 'plat-props' },
            { label: 'Hoteles activos',    value: stats.hotels,                          icon: Building2,     color: 'text-teal-600',    bg: 'bg-teal-50',    testId: 'plat-hotels' },
            { label: 'Jardines activos',   value: stats.gardens,                         icon: Sparkles,      color: 'text-indigo-600',  bg: 'bg-indigo-50',  testId: 'plat-gardens' },
            { label: 'MRR estimado',       value: `$${(stats.mrr ?? 0).toLocaleString()}`, icon: TrendingUp,  color: 'text-violet-600',  bg: 'bg-violet-50',  testId: 'plat-mrr' },
            { label: 'Clientes vencidos',  value: stats.billing_vencido ?? 0,            icon: AlertTriangle, color: 'text-orange-500',  bg: 'bg-orange-50',  testId: 'plat-vencido' },
            { label: 'Suspendidos',        value: stats.tenants_suspended ?? 0,          icon: Ban,           color: 'text-red-500',     bg: 'bg-red-50',     testId: 'plat-suspended' },
          ].map(({ label, value, icon, color, bg, testId }) => (
            <StatCard key={label} label={label} value={value} icon={icon} color={color} bg={bg} testId={testId} />
          ))}
        </div>
      )}

      {/* Content area — rendered directly, no internal sidebar */}
      <div className="space-y-5">
        {activeTab === 0 && (
          <div className="space-y-5">
            {/* Tenants overview */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <h3 className="font-semibold text-slate-800 mb-3" style={{ fontFamily: 'Manrope, sans-serif' }}>Tenants</h3>
              {tenants.length === 0 ? (
                <p className="text-sm text-slate-400">Sin tenants</p>
              ) : tenants.map(t => {
                const ts = t.tenant_status || 'Activo';
                return (
                  <div key={t.id} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 bg-violet-50 rounded-lg flex items-center justify-center"><Globe2 size={13} className="text-violet-600" strokeWidth={1.5} /></div>
                      <div>
                        <span className="text-sm font-medium text-slate-700">{t.name}</span>
                        {t.billing_status && (
                          <span className={`ml-2 px-1.5 py-0.5 rounded text-xs font-semibold ${BILLING_STATUS_COLORS[t.billing_status] || ''}`}>{t.billing_status}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${PLAN_COLORS[t.plan]}`}>{PLAN_LABELS[t.plan]}</span>
                      <span className={`px-1.5 py-0.5 rounded-full text-xs font-semibold ${TENANT_STATUS_COLORS[ts] || 'bg-slate-100 text-slate-600'}`}>{ts}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Financial Summary Panel */}
            {stats && (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                <div className="flex items-center gap-2 mb-4">
                  <DollarSign size={16} className="text-violet-600" />
                  <h3 className="font-semibold text-slate-800" style={{ fontFamily: 'Manrope, sans-serif' }}>Resumen Financiero de Plataforma</h3>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: 'MRR Estimado',       value: `$${(stats.mrr ?? 0).toLocaleString()}`, sub: 'Ingresos mensuales esperados', color: 'text-violet-700' },
                    { label: 'Tenants Activos',     value: stats.tenants_active ?? 0,              sub: 'Cuentas operativas',           color: 'text-emerald-700' },
                    { label: 'Tenants Suspendidos', value: stats.tenants_suspended ?? 0,           sub: 'Acceso restringido',           color: 'text-red-600' },
                    { label: 'Pago Vencido',        value: stats.billing_vencido ?? 0,             sub: 'Requieren atención inmediata', color: 'text-orange-600' },
                  ].map(({ label, value, sub, color }) => (
                    <div key={label} className="p-3 rounded-lg border border-slate-100 bg-slate-50">
                      <p className="text-xs text-slate-500 font-medium mb-1">{label}</p>
                      <p className={`text-2xl font-bold ${color}`} style={{ fontFamily: 'Manrope, sans-serif' }}>{value}</p>
                      <p className="text-xs text-slate-400 mt-1">{sub}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        {activeTab === 1 && <TenantTab tenants={tenants} onRefresh={fetchAll} />}
        {activeTab === 2 && <PropertiesTab properties={properties} tenants={tenants} onRefresh={fetchAll} />}
        {activeTab === 3 && <RolePermissionsTab />}
        {activeTab === 4 && <OnboardingWizard tenants={tenants} roomTypes={roomTypes} onRefresh={fetchAll} />}
        {activeTab === 5 && (
          <PlatformUsersTab users={users} tenants={tenants} properties={properties} onRefresh={fetchAll} />
        )}
        {activeTab === 6 && <BillingTab tenants={tenants} onRefresh={fetchAll} />}
      </div>
    </div>
  );
}
