import { useState, useEffect } from 'react';
import api from '../utils/api';
import { toast } from 'sonner';
import { Plus, BedDouble, X, Search, Edit2, Trash2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const STATUS_OPTS = ['available', 'occupied', 'cleaning', 'maintenance', 'reserved'];
const STATUS_LABELS = { available: 'Disponible', occupied: 'Ocupada', cleaning: 'Limpieza', maintenance: 'Mantenimiento', reserved: 'Reservada' };
const TYPE_LABELS = { single: 'Individual', double: 'Doble', suite: 'Suite', deluxe: 'Deluxe', junior_suite: 'Junior Suite' };
const ROOM_TYPES = Object.entries(TYPE_LABELS).map(([k, v]) => ({ value: k, label: v }));

const RoomCard = ({ room, onStatusClick, onEditClick, canManage }) => (
  <div data-testid={`room-card-${room.number}`}
    className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 transition-all hover:shadow-md">
    <div className="flex items-start justify-between mb-3">
      <div className="cursor-pointer" onClick={() => onStatusClick(room)}>
        <p className="text-xl font-bold text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>{room.number}</p>
        <p className="text-xs text-slate-500">Planta {room.floor} · {TYPE_LABELS[room.type] || room.type}</p>
      </div>
      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold status-${room.status}`}>
        {STATUS_LABELS[room.status] || room.status}
      </span>
    </div>
    <div className="flex items-center justify-between mt-2">
      <p className="text-sm font-semibold text-emerald-600">${(room.price_per_night || 0).toLocaleString('es-MX')}<span className="text-xs font-normal text-slate-400">/noche</span></p>
      {canManage && (
        <div className="flex gap-1">
          <button data-testid={`edit-room-${room.number}`} onClick={() => onEditClick(room)}
            className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors" title="Editar">
            <Edit2 size={13} />
          </button>
        </div>
      )}
    </div>
  </div>
);

export default function Rooms() {
  const { user } = useAuth();
  const canManage = ['admin', 'platform_admin'].includes(user?.role);
  const [rooms, setRooms] = useState([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [floorFilter, setFloorFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedRoom, setSelectedRoom] = useState(null);   // for status update
  const [editRoom, setEditRoom] = useState(null);            // for full edit
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newStatus, setNewStatus] = useState('');
  const [createForm, setCreateForm] = useState({ number: '', type: 'double', floor: 1, price_per_night: 1000, capacity: 2, amenities: 'WiFi, TV, AC' });
  const [editForm, setEditForm] = useState({});
  const [loading, setLoading] = useState(false);

  const fetchRooms = async () => {
    try { const r = await api.get('/rooms'); setRooms(r.data); } catch (e) {}
  };

  useEffect(() => { fetchRooms(); }, []);

  const floors = [...new Set(rooms.map(r => r.floor))].sort();
  const filtered = rooms.filter(r => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    if (floorFilter !== 'all' && r.floor !== parseInt(floorFilter)) return false;
    if (search && !r.number.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const handleStatusUpdate = async () => {
    if (!newStatus) { toast.error('Selecciona un estado'); return; }
    try {
      await api.patch(`/rooms/${selectedRoom.id}/status`, { status: newStatus });
      toast.success('Estado actualizado');
      setSelectedRoom(null); fetchRooms();
    } catch (e) { toast.error('Error al actualizar'); }
  };

  const handleCreate = async (e) => {
    e.preventDefault(); setLoading(true);
    try {
      await api.post('/rooms', {
        ...createForm,
        amenities: createForm.amenities.split(',').map(a => a.trim()).filter(Boolean),
        floor: parseInt(createForm.floor),
        price_per_night: parseFloat(createForm.price_per_night),
        capacity: parseInt(createForm.capacity),
      });
      toast.success('Habitación creada'); setShowCreateModal(false); fetchRooms();
    } catch (e) { toast.error(e.response?.data?.detail || 'Error'); }
    finally { setLoading(false); }
  };

  const openEdit = (room) => {
    setEditForm({
      number: room.number, type: room.type, floor: room.floor,
      price_per_night: room.price_per_night, capacity: room.capacity,
      status: room.status,
      amenities: (room.amenities || []).join(', '),
      description: room.description || '',
    });
    setEditRoom(room);
  };

  const handleEdit = async (e) => {
    e.preventDefault(); setLoading(true);
    try {
      await api.put(`/rooms/${editRoom.id}`, {
        ...editForm,
        amenities: editForm.amenities.split(',').map(a => a.trim()).filter(Boolean),
        floor: parseInt(editForm.floor),
        price_per_night: parseFloat(editForm.price_per_night),
        capacity: parseInt(editForm.capacity),
      });
      toast.success('Habitación actualizada'); setEditRoom(null); fetchRooms();
    } catch (e) { toast.error(e.response?.data?.detail || 'Error'); }
    finally { setLoading(false); }
  };

  const handleDelete = async (room) => {
    if (!window.confirm(`¿Eliminar habitación ${room.number}? Esta acción no se puede deshacer.`)) return;
    try {
      await api.delete(`/rooms/${room.id}`);
      toast.success('Habitación eliminada'); setEditRoom(null); fetchRooms();
    } catch (e) { toast.error(e.response?.data?.detail || 'Error al eliminar'); }
  };

  const counts = STATUS_OPTS.reduce((acc, s) => ({ ...acc, [s]: rooms.filter(r => r.status === s).length }), {});

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>Habitaciones</h1>
          <p className="text-sm text-slate-500">{rooms.length} habitaciones · Haz clic para cambiar estado</p>
        </div>
        {canManage && (
          <button data-testid="new-room-btn" onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-all active:scale-95">
            <Plus size={16} /> Nueva Hab.
          </button>
        )}
      </div>

      {/* Status summary */}
      <div className="flex gap-3 flex-wrap">
        {[['all', 'Todas', 'bg-slate-900 text-white', rooms.length], ...STATUS_OPTS.map(s => [s, STATUS_LABELS[s], `status-${s}`, counts[s]])].map(([key, label, cls, count]) => (
          <button key={key} data-testid={`filter-${key}`} onClick={() => setStatusFilter(key)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${statusFilter === key ? 'ring-2 ring-slate-400' : ''} ${cls}`}>
            {label} <span className="bg-white/30 px-1.5 py-0.5 rounded-full">{count}</span>
          </button>
        ))}
      </div>

      {/* Floor + search filters */}
      <div className="flex gap-3 flex-wrap">
        <select data-testid="floor-filter" value={floorFilter} onChange={e => setFloorFilter(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-emerald-500">
          <option value="all">Todas las plantas</option>
          {floors.map(f => <option key={f} value={f}>Planta {f}</option>)}
        </select>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input data-testid="room-search" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Nº habitación..." className="pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:border-emerald-500 w-36" />
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {filtered.map(r => (
          <RoomCard key={r.id} room={r} canManage={canManage}
            onStatusClick={(rm) => { setSelectedRoom(rm); setNewStatus(rm.status); }}
            onEditClick={openEdit} />
        ))}
        {filtered.length === 0 && <p className="col-span-5 text-center py-12 text-slate-400">No hay habitaciones con este filtro</p>}
      </div>

      {/* Status Update Modal */}
      {selectedRoom && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl" data-testid="room-status-modal">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <h2 className="text-lg font-bold text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>Habitación {selectedRoom.number}</h2>
                <p className="text-xs text-slate-500">{TYPE_LABELS[selectedRoom.type]} · Planta {selectedRoom.floor} · ${(selectedRoom.price_per_night || 0).toLocaleString('es-MX')}/noche</p>
              </div>
              <button onClick={() => setSelectedRoom(null)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {(selectedRoom.amenities || []).length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {selectedRoom.amenities.map(a => <span key={a} className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-xs">{a}</span>)}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Cambiar estado:</label>
                <div className="space-y-2">
                  {STATUS_OPTS.map(s => (
                    <label key={s} className="flex items-center gap-3 cursor-pointer">
                      <input type="radio" name="status" value={s} checked={newStatus === s}
                        onChange={() => setNewStatus(s)} className="accent-emerald-600" />
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold status-${s}`}>{STATUS_LABELS[s]}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                {canManage && (
                  <button data-testid={`open-edit-room-${selectedRoom.number}`}
                    onClick={() => { openEdit(selectedRoom); setSelectedRoom(null); }}
                    className="flex items-center gap-1.5 px-4 py-2.5 border border-slate-200 text-slate-700 rounded-lg font-semibold text-sm hover:bg-slate-50 transition-colors">
                    <Edit2 size={14} /> Editar
                  </button>
                )}
                <button data-testid="update-room-status-btn" onClick={handleStatusUpdate}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-lg font-semibold text-sm transition-all">
                  Actualizar Estado
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Room Modal */}
      {editRoom && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-lg font-bold" style={{ fontFamily: 'Manrope, sans-serif' }}>Editar Habitación {editRoom.number}</h2>
              <button onClick={() => setEditRoom(null)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <form onSubmit={handleEdit} className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Número *</label>
                  <input data-testid="edit-room-number" value={editForm.number} onChange={e => setEditForm({ ...editForm, number: e.target.value })} required
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Tipo</label>
                  <select value={editForm.type} onChange={e => setEditForm({ ...editForm, type: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500">
                    {ROOM_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Planta</label>
                  <input type="number" min="1" value={editForm.floor} onChange={e => setEditForm({ ...editForm, floor: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Precio/noche</label>
                  <input type="number" min="1" value={editForm.price_per_night} onChange={e => setEditForm({ ...editForm, price_per_night: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Capacidad</label>
                  <input type="number" min="1" value={editForm.capacity} onChange={e => setEditForm({ ...editForm, capacity: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Estado</label>
                <select value={editForm.status} onChange={e => setEditForm({ ...editForm, status: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500">
                  {STATUS_OPTS.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Amenidades (separados por coma)</label>
                <input value={editForm.amenities} onChange={e => setEditForm({ ...editForm, amenities: e.target.value })}
                  placeholder="WiFi, TV, AC..."
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" data-testid={`delete-room-${editRoom.number}`}
                  onClick={() => handleDelete(editRoom)}
                  className="flex items-center gap-1.5 px-4 py-2.5 border border-red-200 text-red-600 rounded-lg font-semibold text-sm hover:bg-red-50 transition-colors">
                  <Trash2 size={14} /> Eliminar
                </button>
                <button type="button" onClick={() => setEditRoom(null)}
                  className="px-4 py-2.5 border border-slate-200 text-slate-700 rounded-lg font-semibold text-sm hover:bg-slate-50">Cancelar</button>
                <button type="submit" disabled={loading} data-testid="save-edit-room-btn"
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-lg font-semibold text-sm transition-all disabled:opacity-60">
                  {loading ? 'Guardando...' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Room Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-lg font-bold" style={{ fontFamily: 'Manrope, sans-serif' }}>Nueva Habitación</h2>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <form onSubmit={handleCreate} className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Número *</label>
                  <input data-testid="room-number-input" value={createForm.number} onChange={e => setCreateForm({ ...createForm, number: e.target.value })} required
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Tipo</label>
                  <select value={createForm.type} onChange={e => setCreateForm({ ...createForm, type: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500">
                    {ROOM_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Planta</label>
                  <input type="number" min="1" value={createForm.floor} onChange={e => setCreateForm({ ...createForm, floor: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Precio/noche</label>
                  <input type="number" min="1" value={createForm.price_per_night} onChange={e => setCreateForm({ ...createForm, price_per_night: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Capacidad</label>
                  <input type="number" min="1" value={createForm.capacity} onChange={e => setCreateForm({ ...createForm, capacity: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Amenidades (separados por coma)</label>
                <input value={createForm.amenities} onChange={e => setCreateForm({ ...createForm, amenities: e.target.value })}
                  placeholder="WiFi, TV, AC..."
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowCreateModal(false)}
                  className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-700 rounded-lg font-semibold text-sm hover:bg-slate-50">Cancelar</button>
                <button type="submit" disabled={loading} data-testid="create-room-submit"
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-lg font-semibold text-sm transition-all disabled:opacity-60">
                  {loading ? 'Creando...' : 'Crear Habitación'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
