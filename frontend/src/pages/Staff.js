import { useState, useEffect } from 'react';
import api from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'sonner';
import { Plus, Edit2, UserX, UserCheck, X, Shield, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';

const STAFF_SUBTYPES = [
  { value: 'receptionist', label: 'Recepción' },
  { value: 'sales', label: 'Ventas' },
  { value: 'housekeeping', label: 'Limpieza' },
  { value: 'maintenance', label: 'Mantenimiento' },
  { value: 'security', label: 'Seguridad' },
  { value: 'restaurant', label: 'Restaurante' },
];

// ─── Role structure for hotel/property context ─────────────────
const ROLE_GROUPS = [
  { group: 'manager', label: 'Gerente', subTypes: null },
  { group: 'finance', label: 'Finanzas', subTypes: null },
  { group: 'staff', label: 'Staff', subTypes: STAFF_SUBTYPES },
];

/** Solo staff operativo: el gerente crea únicamente estos roles (según API). */
const ROLE_GROUPS_MANAGER = [
  { group: 'staff', label: 'Staff', subTypes: STAFF_SUBTYPES },
];

// Roles visibles en la tabla de personal del hotel
const PROPERTY_STAFF_ROLES = [
  'manager', 'finance', 'receptionist', 'sales', 'housekeeping', 'maintenance', 'security', 'restaurant',
];

const ALL_ROLES = [
  { value: 'manager',      label: 'Gerente',               color: 'bg-emerald-100 text-emerald-700' },
  { value: 'finance',      label: 'Finanzas',              color: 'bg-cyan-100 text-cyan-800' },
  { value: 'receptionist', label: 'Staff — Recepción',     color: 'bg-blue-100 text-blue-700' },
  { value: 'sales',        label: 'Staff — Ventas',        color: 'bg-indigo-100 text-indigo-800' },
  { value: 'housekeeping', label: 'Staff — Limpieza',      color: 'bg-amber-100 text-amber-700' },
  { value: 'maintenance',  label: 'Staff — Mantenimiento', color: 'bg-orange-100 text-orange-700' },
  { value: 'security',     label: 'Staff — Seguridad',     color: 'bg-red-100 text-red-600' },
  { value: 'restaurant',   label: 'Staff — Restaurante',   color: 'bg-pink-100 text-pink-700' },
];

const MANAGER_MANAGEABLE_ROLES = new Set(['receptionist', 'sales', 'housekeeping', 'maintenance', 'security', 'restaurant']);

const ALL_MODULES = [
  { key: 'dashboard',     label: 'Dashboard' },
  { key: 'reservations',  label: 'Reservas' },
  { key: 'rooms',         label: 'Habitaciones' },
  { key: 'guests',        label: 'Huéspedes' },
  { key: 'jardines',      label: 'Jardines' },
  { key: 'inbox',         label: 'Inbox' },
  { key: 'tasks',         label: 'Tareas' },
  { key: 'catalog',       label: 'Catálogo' },
  { key: 'reports',       label: 'Reportes' },
  { key: 'manager_financial_view', label: 'Vista financiera (gerente, propiedades asignadas)' },
  { key: 'staff',         label: 'Personal' },
  { key: 'properties',    label: 'Propiedades' },
  { key: 'corporate',     label: 'Dashboard Corp.' },
  { key: 'hotels',        label: 'Vista Hoteles' },
  { key: 'event-gardens', label: 'Vista Jardines' },
];

const groupFromRole = (role) => {
  if (role === 'manager') return { group: 'manager', subType: null };
  if (role === 'finance') return { group: 'finance', subType: null };
  if (PROPERTY_STAFF_ROLES.includes(role)) return { group: 'staff', subType: role };
  return { group: 'manager', subType: null };
};

const resolveRole = (group, subType) => {
  if (group === 'manager') return 'manager';
  if (group === 'finance') return 'finance';
  return subType;
};

export default function Staff() {
  const { user: currentUser } = useAuth();
  const [staff, setStaff]           = useState([]);
  const [showModal, setShowModal]   = useState(false);
  const [editing, setEditing]       = useState(null);
  const [loading, setLoading]       = useState(false);
  const [roleFilter, setRoleFilter] = useState('all');

  // Form state
  const [name, setName]                 = useState('');
  const [email, setEmail]               = useState('');
  const [password, setPassword]         = useState('');
  const [roleGroup, setRoleGroup]       = useState('manager');
  const [roleSubType, setRoleSubType]   = useState('');
  const [isActive, setIsActive]         = useState(true);
  const [showCustomPerms, setShowCustomPerms] = useState(false);
  const [customPerms, setCustomPerms]   = useState([]);

  const roleGroupsUi =
    currentUser?.role === 'manager' && (!editing || editing.id !== currentUser?.id)
      ? ROLE_GROUPS_MANAGER
      : ROLE_GROUPS;
  const currentGroupCfg = roleGroupsUi.find(g => g.group === roleGroup);
  const subTypes = currentGroupCfg?.subTypes || null;

  const fetchStaff = async () => {
    try { const r = await api.get('/users'); setStaff(r.data); } catch {}
  };

  useEffect(() => { fetchStaff(); }, []);

  const openCreate = () => {
    setEditing(null);
    setName(''); setEmail(''); setPassword('');
    if (currentUser?.role === 'manager') {
      setRoleGroup('staff');
      setRoleSubType('receptionist');
    } else {
      setRoleGroup('manager');
      setRoleSubType('');
    }
    setIsActive(true);
    setShowCustomPerms(false); setCustomPerms([]);
    setShowModal(true);
  };

  const openEdit = (s) => {
    const { group, subType } = groupFromRole(s.role);
    setEditing(s);
    setName(s.name); setEmail(s.email); setPassword('');
    setRoleGroup(group);
    setRoleSubType(subType || '');
    setIsActive(s.is_active);
    const hasCustom = !!s.custom_permissions;
    setShowCustomPerms(hasCustom);
    setCustomPerms(s.custom_permissions || []);
    setShowModal(true);
  };

  const handleGroupChange = (g) => {
    const cfg = roleGroupsUi.find(x => x.group === g);
    setRoleGroup(g);
    setRoleSubType(cfg?.subTypes?.[0]?.value || '');
    if (g !== 'manager') { setShowCustomPerms(false); setCustomPerms([]); }
  };

  const toggleModule = (mod) => {
    setCustomPerms(p => p.includes(mod) ? p.filter(m => m !== mod) : [...p, mod]);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!editing && !password) { toast.error('La contraseña es requerida'); return; }
    const actualRole = resolveRole(roleGroup, roleSubType);
    if (!actualRole) { toast.error('Selecciona un tipo de staff'); return; }

    const payload = {
      name, email, role: actualRole,
      is_active: isActive,
      custom_permissions: (roleGroup === 'manager' && showCustomPerms) ? customPerms : null,
    };
    if (password) payload.password = password;

    setLoading(true);
    try {
      if (editing) {
        await api.put(`/users/${editing.id}`, payload);
        toast.success('Usuario actualizado');
      } else {
        await api.post('/users', payload);
        toast.success('Usuario creado');
      }
      setShowModal(false); fetchStaff();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al guardar');
    } finally { setLoading(false); }
  };

  const toggleActive = async (u) => {
    try {
      await api.put(`/users/${u.id}`, { is_active: !u.is_active });
      toast.success(u.is_active ? 'Desactivado' : 'Activado');
      fetchStaff();
    } catch { toast.error('Error'); }
  };

  const canDelete = (targetUser) => {
    if (!currentUser) return false;
    if (currentUser.id === targetUser.id) return false;
    if (currentUser.role === 'platform_admin') return true;
    if (currentUser.role === 'manager') {
      return MANAGER_MANAGEABLE_ROLES.has(targetUser.role);
    }
    return false;
  };

  const canEditRow = (targetUser) => {
    if (!currentUser) return false;
    if (currentUser.role === 'platform_admin') return true;
    if (currentUser.role === 'manager') {
      return targetUser.id === currentUser.id || MANAGER_MANAGEABLE_ROLES.has(targetUser.role);
    }
    return false;
  };

  const deleteStaff = async (u) => {
    if (!window.confirm(`¿Eliminar a ${u.name}? Esta acción no se puede deshacer.`)) return;
    try {
      await api.delete(`/users/${u.id}`);
      toast.success('Empleado eliminado');
      fetchStaff();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al eliminar');
    }
  };

  const getRoleCfg = (role) =>
    ALL_ROLES.find(r => r.value === role) || { label: role, color: 'bg-slate-100 text-slate-600' };

  // Only show property-level staff (filter out platform & group admins)
  const filteredByRole = staff.filter(s => PROPERTY_STAFF_ROLES.includes(s.role));
  const visibleStaff = roleFilter === 'all'
    ? filteredByRole
    : filteredByRole.filter(s => s.role === roleFilter);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>
            Gestión de Personal
          </h1>
          <p className="text-sm text-slate-500">{filteredByRole.length} empleado(s) registrado(s)</p>
        </div>
        {currentUser?.role === 'manager' && (
        <button data-testid="new-staff-btn" onClick={openCreate}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-all active:scale-95">
          <Plus size={16} /> Nuevo Empleado
        </button>
        )}
      </div>

      {/* Role filter chips */}
      <div className="flex gap-2 flex-wrap">
        <button onClick={() => setRoleFilter('all')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${roleFilter === 'all' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'}`}>
          Todos <span className="bg-white/20 px-1.5 py-0.5 rounded-full">{filteredByRole.length}</span>
        </button>
        {ALL_ROLES.map(r => {
          const count = filteredByRole.filter(s => s.role === r.value).length;
          if (count === 0) return null;
          return (
            <button key={r.value} data-testid={`filter-role-${r.value}`}
              onClick={() => setRoleFilter(r.value)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border-transparent transition-all ${roleFilter === r.value ? 'ring-2 ring-slate-400' : ''} ${r.color}`}>
              {r.label} <span className="bg-black/10 px-1.5 py-0.5 rounded-full">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Staff table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {['Empleado', 'Email', 'Teléfono', 'Rol', 'Estado', 'Acciones'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleStaff.map(s => {
                const roleCfg = getRoleCfg(s.role);
                return (
                  <tr key={s.id} data-testid={`staff-row-${s.id}`}
                    className={`hover:bg-slate-50 transition-colors ${!s.is_active ? 'opacity-60' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                          style={{ backgroundColor: s.avatar_color || '#059669' }}>
                          {s.name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-medium text-slate-800">{s.name}</p>
                          {s.custom_permissions && (
                            <span className="text-xs text-violet-600 font-medium">Permisos custom</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{s.email}</td>
                    <td className="px-4 py-3 text-slate-600">{s.phone || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${roleCfg.color}`}>
                        {roleCfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${s.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                        {s.is_active ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        {canEditRow(s) && (
                        <button data-testid={`edit-staff-${s.id}`} onClick={() => openEdit(s)}
                          className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-colors">
                          <Edit2 size={14} />
                        </button>
                        )}
                        <button onClick={() => toggleActive(s)}
                          className={`p-1.5 rounded transition-colors ${s.is_active ? 'text-slate-400 hover:text-red-600 hover:bg-red-50' : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'}`}>
                          {s.is_active ? <UserX size={14} /> : <UserCheck size={14} />}
                        </button>
                        {canDelete(s) && (
                          <button data-testid={`delete-staff-${s.id}`} onClick={() => deleteStaff(s)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors">
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {visibleStaff.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400 text-sm">Sin empleados registrados</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto" data-testid="staff-modal">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
              <h2 className="text-lg font-bold text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>
                {editing ? 'Editar Empleado' : 'Nuevo Empleado'}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSave} className="px-6 py-5 space-y-4">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Nombre completo *</label>
                <input data-testid="staff-name" value={name} onChange={e => setName(e.target.value)} required
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500" />
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Email *</label>
                <input type="email" data-testid="staff-email" value={email} onChange={e => setEmail(e.target.value)} required
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500" />
              </div>

              {/* Password */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  {editing ? 'Nueva contraseña' : 'Contraseña *'}
                </label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                  placeholder={editing ? 'Dejar vacío para no cambiar' : ''}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500" />
              </div>

              {/* Role group selector */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Rol *</label>
                <select data-testid="staff-role-group" value={roleGroup} onChange={e => handleGroupChange(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500">
                  {roleGroupsUi.map(g => (
                    <option key={g.group} value={g.group}>{g.label}</option>
                  ))}
                </select>
              </div>

              {/* Staff sub-type selector */}
              {subTypes && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Tipo de Staff *</label>
                  <div className="flex gap-2 flex-wrap">
                    {subTypes.map(s => (
                      <button key={s.value} type="button"
                        data-testid={`subtype-${s.value}`}
                        onClick={() => setRoleSubType(s.value)}
                        className={`px-3 py-2 rounded-lg text-sm font-medium border transition-all ${roleSubType === s.value ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'}`}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Estado */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Estado</label>
                <div className="flex gap-2">
                  {[{ v: true, label: 'Activo' }, { v: false, label: 'Inactivo' }].map(({ v, label }) => (
                    <button key={label} type="button"
                      data-testid={`status-${label.toLowerCase()}`}
                      onClick={() => setIsActive(v)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all ${isActive === v ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom permissions — available for Gerente role */}
              {roleGroup === 'manager' && (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <button type="button"
                    onClick={() => { setShowCustomPerms(v => !v); if (showCustomPerms) setCustomPerms([]); }}
                    className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors text-sm font-semibold text-slate-700">
                    <div className="flex items-center gap-2">
                      <Shield size={14} className="text-violet-600" />
                      Permisos personalizados
                      {showCustomPerms && (
                        <span className="px-1.5 py-0.5 bg-violet-100 text-violet-700 text-xs rounded-full">Activo</span>
                      )}
                    </div>
                    {showCustomPerms ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                  </button>
                  {showCustomPerms && (
                    <div className="px-4 py-4 space-y-3">
                      <p className="text-xs text-slate-500">
                        Configura los módulos accesibles para este Gerente.
                      </p>
                      <div className="grid grid-cols-2 gap-1.5">
                        {ALL_MODULES.map(({ key, label }) => {
                          const checked = customPerms.includes(key);
                          return (
                            <label key={key}
                              className={`flex items-center gap-2 cursor-pointer p-2 rounded-lg border text-xs transition-all select-none ${checked ? 'border-violet-300 bg-violet-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
                              <input type="checkbox" checked={checked} onChange={() => toggleModule(key)}
                                className="w-3.5 h-3.5 accent-violet-600" />
                              <span className="text-slate-700">{label}</span>
                            </label>
                          );
                        })}
                      </div>
                      <p className="text-xs text-slate-400">{customPerms.length} módulos seleccionados</p>
                    </div>
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-700 rounded-lg font-semibold text-sm hover:bg-slate-50">
                  Cancelar
                </button>
                <button type="submit" disabled={loading} data-testid="save-staff-btn"
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-lg font-semibold text-sm transition-all disabled:opacity-60">
                  {loading ? 'Guardando...' : editing ? 'Guardar Cambios' : 'Crear Empleado'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
