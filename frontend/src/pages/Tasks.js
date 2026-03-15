import { useState, useEffect } from 'react';
import api from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'sonner';
import { Plus, Sparkles, X, ChevronRight, Trash2 } from 'lucide-react';

const PRIORITY_CONFIG = {
  low: { label: 'Baja', cls: 'bg-slate-100 text-slate-600' },
  medium: { label: 'Media', cls: 'bg-amber-100 text-amber-700' },
  high: { label: 'Alta', cls: 'bg-red-100 text-red-600' },
  urgent: { label: 'Urgente', cls: 'bg-red-600 text-white' },
};

const CATEGORY_CONFIG = {
  housekeeping: { label: 'Housekeeping', cls: 'bg-emerald-100 text-emerald-700' },
  maintenance: { label: 'Mantenimiento', cls: 'bg-blue-100 text-blue-700' },
  reception: { label: 'Recepción', cls: 'bg-violet-100 text-violet-700' },
  general: { label: 'General', cls: 'bg-slate-100 text-slate-600' },
};

const COLUMNS = [
  { key: 'pending', label: 'Pendiente', color: 'border-t-amber-400' },
  { key: 'in_progress', label: 'En Progreso', color: 'border-t-blue-500' },
  { key: 'completed', label: 'Completada', color: 'border-t-emerald-500' },
];

const STATUS_NEXT = { pending: 'in_progress', in_progress: 'completed', completed: 'pending' };

const TaskCard = ({ task, onStatusChange, onDelete }) => {
  const p = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium;
  const c = CATEGORY_CONFIG[task.category] || CATEGORY_CONFIG.general;

  return (
    <div data-testid={`task-card-${task.id}`}
      className="bg-white rounded-lg border border-slate-200 p-3.5 shadow-sm hover:shadow-md transition-all">
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-sm font-semibold text-slate-800 leading-snug">{task.title}</p>
        <button data-testid={`delete-task-${task.id}`} onClick={() => onDelete(task.id)}
          className="text-slate-300 hover:text-red-500 transition-colors flex-shrink-0">
          <Trash2 size={13} />
        </button>
      </div>
      {task.description && <p className="text-xs text-slate-400 mb-2 line-clamp-2">{task.description}</p>}
      <div className="flex flex-wrap gap-1 mb-2.5">
        <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${p.cls}`}>{p.label}</span>
        <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${c.cls}`}>{c.label}</span>
        {task.room_number && <span className="px-1.5 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-600 font-mono">Hab. {task.room_number}</span>}
      </div>
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-400">{task.assigned_to_name || 'Sin asignar'}</p>
        {task.status !== 'completed' && (
          <button data-testid={`advance-task-${task.id}`}
            onClick={() => onStatusChange(task.id, STATUS_NEXT[task.status])}
            className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 font-semibold">
            {task.status === 'pending' ? 'Iniciar' : 'Completar'} <ChevronRight size={12} />
          </button>
        )}
      </div>
    </div>
  );
};

export default function Tasks() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [aiInput, setAiInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    title: '', description: '', assigned_to: '', room_id: '',
    priority: 'medium', category: 'general', due_date: ''
  });

  const fetchAll = async () => {
    try {
      const [t, u, r] = await Promise.all([api.get('/tasks'), api.get('/users'), api.get('/rooms')]);
      setTasks(t.data); setUsers(u.data); setRooms(r.data);
    } catch (e) {}
  };

  useEffect(() => { fetchAll(); }, []);

  const handleStatusChange = async (taskId, newStatus) => {
    try {
      await api.patch(`/tasks/${taskId}/status`, { status: newStatus });
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t));
      toast.success(newStatus === 'completed' ? 'Tarea completada' : 'Estado actualizado');
    } catch (e) { toast.error('Error al actualizar'); }
  };

  const handleDelete = async (taskId) => {
    if (!window.confirm('¿Eliminar esta tarea?')) return;
    try { await api.delete(`/tasks/${taskId}`); setTasks(prev => prev.filter(t => t.id !== taskId)); toast.success('Tarea eliminada'); }
    catch (e) { toast.error('Error al eliminar'); }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.title) { toast.error('Título requerido'); return; }
    setLoading(true);
    try {
      await api.post('/tasks', form);
      toast.success('Tarea creada');
      setShowModal(false);
      setForm({ title: '', description: '', assigned_to: '', room_id: '', priority: 'medium', category: 'general', due_date: '' });
      fetchAll();
    } catch (e) { toast.error('Error al crear tarea'); }
    finally { setLoading(false); }
  };

  const handleAiSuggest = async () => {
    if (!aiInput.trim()) { toast.error('Describe el problema primero'); return; }
    setAiLoading(true);
    try {
      const res = await api.post('/ai/task-suggestion', { issue: aiInput });
      setForm(prev => ({ ...prev, title: res.data.title || prev.title, description: res.data.description || prev.description, priority: res.data.priority || prev.priority, category: res.data.category || prev.category }));
      toast.success('Sugerencia aplicada');
    } catch (e) { toast.error('Error con IA'); }
    finally { setAiLoading(false); }
  };

  const colTasks = (status) => tasks.filter(t => t.status === status);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>Tareas</h1>
          <p className="text-sm text-slate-500">{tasks.length} tareas en total</p>
        </div>
        <button data-testid="new-task-btn" onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-all active:scale-95">
          <Plus size={16} /> Nueva Tarea
        </button>
      </div>

      {/* Kanban Board */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {COLUMNS.map(col => (
          <div key={col.key} className={`bg-white rounded-xl border border-slate-200 border-t-4 ${col.color} shadow-sm overflow-hidden`} data-testid={`column-${col.key}`}>
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-semibold text-slate-700 text-sm" style={{ fontFamily: 'Manrope, sans-serif' }}>{col.label}</h3>
              <span className="bg-slate-100 text-slate-600 text-xs font-bold rounded-full px-2 py-0.5">{colTasks(col.key).length}</span>
            </div>
            <div className="p-3 space-y-2.5 min-h-64 max-h-96 overflow-y-auto">
              {colTasks(col.key).map(t => (
                <TaskCard key={t.id} task={t} onStatusChange={handleStatusChange} onDelete={handleDelete} />
              ))}
              {colTasks(col.key).length === 0 && (
                <div className="flex items-center justify-center h-20 text-xs text-slate-300">Sin tareas</div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Create Task Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto" data-testid="task-modal">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white">
              <h2 className="text-lg font-bold" style={{ fontFamily: 'Manrope, sans-serif' }}>Nueva Tarea</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {/* AI Input */}
              <div className="ai-card rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles size={16} className="text-violet-600" />
                  <span className="text-sm font-semibold text-violet-700">Crear tarea con IA</span>
                </div>
                <div className="flex gap-2">
                  <input data-testid="ai-task-input" value={aiInput} onChange={e => setAiInput(e.target.value)}
                    placeholder="Describe el problema (ej: el grifo del 302 gotea)..."
                    className="flex-1 border border-violet-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-violet-500 bg-white" />
                  <button data-testid="ai-generate-task-btn" onClick={handleAiSuggest} disabled={aiLoading}
                    className="px-3 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-60">
                    {aiLoading ? '...' : 'Generar'}
                  </button>
                </div>
              </div>

              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Título *</label>
                  <input data-testid="task-title" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required
                    placeholder="Título de la tarea..."
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Descripción</label>
                  <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500 resize-none" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Asignar a</label>
                    <select value={form.assigned_to} onChange={e => setForm({ ...form, assigned_to: e.target.value })}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500">
                      <option value="">Sin asignar</option>
                      {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Habitación</label>
                    <select value={form.room_id} onChange={e => setForm({ ...form, room_id: e.target.value })}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500">
                      <option value="">Sin habitación</option>
                      {rooms.map(r => <option key={r.id} value={r.id}>Hab. {r.number}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Prioridad</label>
                    <select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500">
                      {Object.entries(PRIORITY_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Categoría</label>
                    <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500">
                      {Object.entries(CATEGORY_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Fecha límite</label>
                  <input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500" />
                </div>
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setShowModal(false)}
                    className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-700 rounded-lg font-semibold text-sm hover:bg-slate-50">Cancelar</button>
                  <button type="submit" disabled={loading} data-testid="create-task-submit"
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-lg font-semibold text-sm transition-all disabled:opacity-60">
                    {loading ? 'Creando...' : 'Crear Tarea'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
