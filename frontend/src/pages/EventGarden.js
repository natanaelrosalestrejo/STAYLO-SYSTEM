import { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { useProperty } from '../contexts/PropertyContext';
import { toast } from 'sonner';
import {
  Plus, Search, Calendar, Users, DollarSign, CheckCircle, XCircle,
  Clock, Sparkles, Eye, Trash2, ChevronLeft, ChevronRight as ChevronRightIcon,
  Package, Star, Phone, Mail, Globe, Edit2, Image, CalendarDays, MapPin,
  Music, Camera, Cake, Volume2, Flower, Armchair, Utensils, Zap, Gift
} from 'lucide-react';

// ─────────────── Constants ───────────────

const EVENT_TYPES = {
  wedding:   { label: 'Boda',          color: 'bg-pink-50 text-pink-700' },
  corporate: { label: 'Corporativo',   color: 'bg-blue-50 text-blue-700' },
  birthday:  { label: 'Cumpleaños',    color: 'bg-amber-50 text-amber-700' },
  social:    { label: 'Social',        color: 'bg-violet-50 text-violet-700' },
  other:     { label: 'Otro',          color: 'bg-slate-100 text-slate-600' },
};

const BOOKING_STATUS = {
  confirmed: { label: 'Confirmado',  cls: 'status-reserved' },
  pending:   { label: 'Pendiente',   cls: 'status-cleaning' },
  cancelled: { label: 'Cancelado',   cls: 'status-maintenance' },
};

const PAY_STATUS = {
  paid:    { label: 'Pagado',    cls: 'bg-emerald-50 text-emerald-700' },
  pending: { label: 'Pendiente', cls: 'bg-amber-50 text-amber-700' },
};

const VENDOR_CATEGORIES = {
  musica_dj:         { label: 'Música / DJ',          icon: Music,    color: 'bg-violet-50 text-violet-600' },
  fotografia_video:  { label: 'Fotografía / Video',   icon: Camera,   color: 'bg-blue-50 text-blue-600' },
  pasteleria:        { label: 'Pastelería',            icon: Cake,     color: 'bg-pink-50 text-pink-600' },
  audio_sonido:      { label: 'Audio y Sonido',        icon: Volume2,  color: 'bg-indigo-50 text-indigo-600' },
  flores_decoracion: { label: 'Flores / Decoración',  icon: Flower,   color: 'bg-rose-50 text-rose-600' },
  mobiliario_renta:  { label: 'Mobiliario / Renta',   icon: Armchair, color: 'bg-amber-50 text-amber-600' },
  snacks_catering:   { label: 'Snacks / Catering',    icon: Utensils, color: 'bg-orange-50 text-orange-600' },
  camara_360:        { label: 'Cámara 360',            icon: Zap,      color: 'bg-cyan-50 text-cyan-600' },
  entretenimiento:   { label: 'Entretenimiento',       icon: Gift,     color: 'bg-teal-50 text-teal-600' },
  otros:             { label: 'Otros',                 icon: Package,  color: 'bg-slate-50 text-slate-600' },
};

const INVENTORY_CATEGORIES = {
  sillas:      { label: 'Sillas',           emoji: '🪑' },
  mesas:       { label: 'Mesas',            emoji: '🪵' },
  manteles:    { label: 'Manteles',         emoji: '🧣' },
  iluminacion: { label: 'Iluminación',      emoji: '💡' },
  decoracion:  { label: 'Decoración',       emoji: '✨' },
  audio_visual:{ label: 'Audio / Visual',   emoji: '🔊' },
  vajilla:     { label: 'Vajilla',          emoji: '🍽️' },
  carpas:      { label: 'Carpas / Toldos',  emoji: '⛺' },
  otros:       { label: 'Otros',            emoji: '📦' },
};

const INVENTORY_CONDITION = {
  excelente: { label: 'Excelente', cls: 'bg-emerald-50 text-emerald-700' },
  buena:     { label: 'Buena',     cls: 'bg-blue-50 text-blue-700' },
  regular:   { label: 'Regular',   cls: 'bg-amber-50 text-amber-700' },
  baja:      { label: 'Baja',      cls: 'bg-red-50 text-red-700' },
};

const VISIT_TYPES = {
  cliente:     { label: 'Visita de cliente',     color: 'bg-blue-50 text-blue-700' },
  proveedor:   { label: 'Visita de proveedor',   color: 'bg-violet-50 text-violet-700' },
  degustacion: { label: 'Degustación',           color: 'bg-amber-50 text-amber-700' },
  decoracion:  { label: 'Decoración',            color: 'bg-pink-50 text-pink-700' },
  fotografia:  { label: 'Sesión fotográfica',    color: 'bg-teal-50 text-teal-700' },
  tour:        { label: 'Tour del jardín',       color: 'bg-emerald-50 text-emerald-700' },
  otro:        { label: 'Otro',                  color: 'bg-slate-100 text-slate-600' },
};

const VISIT_STATUS = {
  scheduled: { label: 'Agendada',   cls: 'bg-blue-50 text-blue-700' },
  completed: { label: 'Realizada',  cls: 'bg-emerald-50 text-emerald-700' },
  cancelled: { label: 'Cancelada',  cls: 'bg-red-50 text-red-700' },
  no_show:   { label: 'No asistió', cls: 'bg-slate-100 text-slate-600' },
};

const ACCENT = '#625746';
const fmt = (n) => `$${Number(n || 0).toLocaleString('es-MX')}`;

// ─────────────── Small components ───────────────

const EventTypeBadge = ({ type }) => {
  const c = EVENT_TYPES[type] || EVENT_TYPES.other;
  return <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${c.color}`}>{c.label}</span>;
};
const StatusBadge = ({ s }) => {
  const c = BOOKING_STATUS[s] || { label: s, cls: '' };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${c.cls}`}>{c.label}</span>;
};
const PayBadge = ({ s }) => {
  const c = PAY_STATUS[s] || PAY_STATUS.pending;
  return <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${c.cls}`}>{c.label}</span>;
};

// Stars display for vendor rating
const Stars = ({ rating }) => {
  if (!rating) return null;
  return (
    <div className="flex items-center gap-0.5">
      {[1,2,3,4,5].map(i => (
        <Star key={i} size={11}
          className={i <= Math.round(rating) ? 'text-amber-400 fill-amber-400' : 'text-slate-200 fill-slate-200'} />
      ))}
    </div>
  );
};

// ─────────────── Empty forms ───────────────

const EMPTY_BOOKING = {
  event_space_id: '', client_name: '', client_email: '', client_phone: '',
  event_date: '', event_type: 'wedding', attendees: '', total_price: '',
  booking_status: 'confirmed', notes: '', reservation_source: 'reception',
};
const EMPTY_VENDOR = {
  name: '', category: 'musica_dj', contact_name: '', phone: '',
  email: '', website: '', description: '', price_info: '', images: [], rating: '', notes: '',
};
const EMPTY_INVENTORY = {
  name: '', category: 'sillas', description: '', quantity_total: '',
  quantity_available: '', unit_price_rent: '', images: [], condition: 'buena', notes: '',
};
const EMPTY_VISIT = {
  visit_type: 'cliente', client_name: '', client_phone: '', client_email: '',
  vendor_id: '', vendor_name: '', visit_date: '', duration_minutes: '60', notes: '',
};

// ─────────────── Page component ───────────────

export default function EventGarden() {
  const { user } = useAuth();
  const { properties, selectedPropertyId } = useProperty();
  const [searchParams, setSearchParams] = useSearchParams();
  const eventDeepLinkHandled = useRef(null);

  // Core data
  const [spaces, setSpaces] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [visits, setVisits] = useState([]);

  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('bookings');
  const [loading, setLoading] = useState(false);

  // Booking modal / detail
  const [showModal, setShowModal] = useState(false);
  const [detailBooking, setDetailBooking] = useState(null);
  const [form, setForm] = useState(EMPTY_BOOKING);
  const [lodgingData, setLodgingData] = useState(null);
  const [lodgingForm, setLodgingForm] = useState({
    lodging_integration_enabled: false,
    bride_room_id: '', groom_room_id: '', parents_room_id: '', close_family_room_id: '',
    guest_block_count: 0,
  });
  const [lodgingSaving, setLodgingSaving] = useState(false);

  // Calendar
  const [calMonth, setCalMonth] = useState(() => {
    const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() };
  });

  // Vendor state
  const [showVendorModal, setShowVendorModal] = useState(false);
  const [editVendor, setEditVendor] = useState(null);
  const [vendorForm, setVendorForm] = useState(EMPTY_VENDOR);
  const [vendorImageUrl, setVendorImageUrl] = useState('');
  const [vendorCatFilter, setVendorCatFilter] = useState('');

  // Inventory state
  const [showInventoryModal, setShowInventoryModal] = useState(false);
  const [editInventoryItem, setEditInventoryItem] = useState(null);
  const [inventoryForm, setInventoryForm] = useState(EMPTY_INVENTORY);
  const [inventoryImageUrl, setInventoryImageUrl] = useState('');
  const [inventoryCatFilter, setInventoryCatFilter] = useState('');

  // Visit state
  const [showVisitModal, setShowVisitModal] = useState(false);
  const [editVisit, setEditVisit] = useState(null);
  const [visitForm, setVisitForm] = useState(EMPTY_VISIT);
  const [visitStatusFilter, setVisitStatusFilter] = useState('');

  const propIdFromUrl = searchParams.get('propertyId');
  const gardenProp = useMemo(() => {
    const gardens = properties.filter((p) => p.type === 'event_garden');
    if (!gardens.length) return null;
    if (propIdFromUrl) { const hit = gardens.find((p) => p.id === propIdFromUrl); if (hit) return hit; }
    if (selectedPropertyId && selectedPropertyId !== 'all') { const sel = gardens.find((p) => p.id === selectedPropertyId); if (sel) return sel; }
    return gardens[0];
  }, [properties, propIdFromUrl, selectedPropertyId]);

  const isAdmin = user?.role === 'manager';
  const isReceptionist = ['manager', 'receptionist', 'sales'].includes(user?.role);

  // ─── Fetch functions ───

  const fetchData = async () => {
    try {
      const propId = gardenProp?.id;
      const [s, b, r] = await Promise.all([
        api.get('/event-spaces' + (propId ? `?property_id=${propId}` : '')),
        api.get('/event-bookings' + (propId ? `?property_id=${propId}` : '')),
        api.get('/rooms'),
      ]);
      setSpaces(s.data);
      setBookings(b.data);
      setRooms((r.data || []).filter(room => room.property_id === propId));
    } catch (e) {}
  };

  const fetchVendors = async () => {
    try {
      const propId = gardenProp?.id;
      const res = await api.get('/vendors' + (propId ? `?property_id=${propId}` : ''));
      setVendors(res.data);
    } catch (e) {}
  };

  const fetchInventory = async () => {
    try {
      const propId = gardenProp?.id;
      const res = await api.get('/garden-inventory' + (propId ? `?property_id=${propId}` : ''));
      setInventory(res.data);
    } catch (e) {}
  };

  const fetchVisits = async () => {
    try {
      const propId = gardenProp?.id;
      const res = await api.get('/garden-visits' + (propId ? `?property_id=${propId}` : ''));
      setVisits(res.data);
    } catch (e) {}
  };

  useEffect(() => {
    fetchData();
    fetchVendors();
    fetchInventory();
    fetchVisits();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gardenProp?.id]);

  useEffect(() => {
    const t = searchParams.get('tab');
    const valid = ['calendar', 'bookings', 'spaces', 'proveedores', 'inventario', 'visitas'];
    if (valid.includes(t)) setTab(t);
  }, [searchParams]);

  // ─── Booking handlers ───

  const filtered = bookings.filter(b => {
    const q = search.toLowerCase();
    return !q || b.client_name?.toLowerCase().includes(q) || b.event_type?.toLowerCase().includes(q);
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.event_space_id || !form.client_name || !form.event_date || !form.event_type) {
      toast.error('Completa los campos requeridos'); return;
    }
    setLoading(true);
    try {
      await api.post('/event-bookings', {
        ...form, property_id: gardenProp?.id || '',
        attendees: parseInt(form.attendees) || 0, total_price: parseFloat(form.total_price) || 0,
      });
      toast.success('Reserva de evento creada');
      setShowModal(false); setForm(EMPTY_BOOKING); fetchData();
    } catch (err) { toast.error(err.response?.data?.detail || 'Error al crear reserva'); }
    finally { setLoading(false); }
  };

  const handleStatusChange = async (id, field, value) => {
    try {
      await api.patch(`/event-bookings/${id}/status`, { [field]: value });
      toast.success('Estado actualizado'); fetchData();
    } catch { toast.error('Error al actualizar'); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Eliminar esta reserva?')) return;
    try {
      await api.delete(`/event-bookings/${id}`);
      toast.success('Reserva eliminada'); fetchData();
    } catch { toast.error('Error al eliminar'); }
  };

  const loadLodging = async (booking) => {
    try {
      const res = await api.get(`/event-bookings/${booking.id}/lodging`);
      const data = res.data;
      setLodgingData(data);
      const assignments = data.assignments || [];
      const findSpecial = (role) => assignments.find(a => a.assignment_type === 'special_role' && a.special_role === role && ['held', 'reserved'].includes(a.assignment_status));
      setLodgingForm({
        lodging_integration_enabled: !!data.lodging_integration_enabled,
        bride_room_id: findSpecial('bride')?.room_id || '',
        groom_room_id: findSpecial('groom')?.room_id || '',
        parents_room_id: findSpecial('parents')?.room_id || '',
        close_family_room_id: findSpecial('close_family')?.room_id || '',
        guest_block_count: data.room_block?.target_room_count || 0,
      });
    } catch {
      setLodgingData(null);
      setLodgingForm({ lodging_integration_enabled: false, bride_room_id: '', groom_room_id: '', parents_room_id: '', close_family_room_id: '', guest_block_count: 0 });
    }
  };

  const openDetail = (booking) => { setDetailBooking(booking); loadLodging(booking); };

  useEffect(() => {
    const eid = searchParams.get('eventId');
    if (!eid || !bookings.length) return;
    if (eventDeepLinkHandled.current === eid) return;
    const b = bookings.find(x => x.id === eid);
    if (b) {
      eventDeepLinkHandled.current = eid;
      setDetailBooking(b); loadLodging(b); setTab('bookings');
      const next = new URLSearchParams(searchParams); next.delete('eventId');
      setSearchParams(next, { replace: true });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookings, searchParams, setSearchParams]);

  const saveLodgingSetup = async () => {
    if (!detailBooking) return;
    setLodgingSaving(true);
    try {
      const special_rooms = [
        { special_role: 'bride', room_id: lodgingForm.bride_room_id || null },
        { special_role: 'groom', room_id: lodgingForm.groom_room_id || null },
        { special_role: 'parents', room_id: lodgingForm.parents_room_id || null },
        { special_role: 'close_family', room_id: lodgingForm.close_family_room_id || null },
      ];
      await api.post(`/event-bookings/${detailBooking.id}/lodging/setup`, {
        lodging_integration_enabled: !!lodgingForm.lodging_integration_enabled,
        check_in_date: detailBooking.event_date, check_out_date: detailBooking.event_date,
        special_rooms, guest_block_count: parseInt(lodgingForm.guest_block_count) || 0,
      });
      toast.success('Hospedaje del evento actualizado');
      await loadLodging(detailBooking);
    } catch (err) { toast.error(err.response?.data?.detail || 'Error al guardar hospedaje'); }
    finally { setLodgingSaving(false); }
  };

  // ─── Vendor handlers ───

  const handleVendorSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = {
        ...vendorForm, property_id: gardenProp?.id || '',
        rating: vendorForm.rating ? parseFloat(vendorForm.rating) : null,
      };
      if (editVendor) {
        await api.patch(`/vendors/${editVendor.id}`, payload);
        toast.success('Proveedor actualizado');
      } else {
        await api.post('/vendors', payload);
        toast.success('Proveedor registrado');
      }
      setShowVendorModal(false); setEditVendor(null); setVendorForm(EMPTY_VENDOR); setVendorImageUrl('');
      fetchVendors();
    } catch (err) { toast.error(err.response?.data?.detail || 'Error al guardar proveedor'); }
    finally { setLoading(false); }
  };

  const handleDeleteVendor = async (id) => {
    if (!window.confirm('¿Eliminar este proveedor?')) return;
    try { await api.delete(`/vendors/${id}`); toast.success('Proveedor eliminado'); fetchVendors(); }
    catch { toast.error('Error al eliminar'); }
  };

  const openVendorEdit = (vendor) => {
    setEditVendor(vendor);
    setVendorForm({
      name: vendor.name || '', category: vendor.category || 'musica_dj',
      contact_name: vendor.contact_name || '', phone: vendor.phone || '',
      email: vendor.email || '', website: vendor.website || '',
      description: vendor.description || '', price_info: vendor.price_info || '',
      images: vendor.images || [], rating: vendor.rating ? String(vendor.rating) : '', notes: vendor.notes || '',
    });
    setVendorImageUrl(''); setShowVendorModal(true);
  };

  // ─── Inventory handlers ───

  const handleInventorySubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = {
        ...inventoryForm, property_id: gardenProp?.id || '',
        quantity_total: parseInt(inventoryForm.quantity_total) || 0,
        quantity_available: parseInt(inventoryForm.quantity_available) || 0,
        unit_price_rent: parseFloat(inventoryForm.unit_price_rent) || 0,
      };
      if (editInventoryItem) {
        await api.patch(`/garden-inventory/${editInventoryItem.id}`, payload);
        toast.success('Artículo actualizado');
      } else {
        await api.post('/garden-inventory', payload);
        toast.success('Artículo registrado');
      }
      setShowInventoryModal(false); setEditInventoryItem(null); setInventoryForm(EMPTY_INVENTORY); setInventoryImageUrl('');
      fetchInventory();
    } catch (err) { toast.error(err.response?.data?.detail || 'Error al guardar'); }
    finally { setLoading(false); }
  };

  const handleDeleteInventory = async (id) => {
    if (!window.confirm('¿Eliminar este artículo?')) return;
    try { await api.delete(`/garden-inventory/${id}`); toast.success('Artículo eliminado'); fetchInventory(); }
    catch { toast.error('Error al eliminar'); }
  };

  const openInventoryEdit = (item) => {
    setEditInventoryItem(item);
    setInventoryForm({
      name: item.name || '', category: item.category || 'sillas',
      description: item.description || '',
      quantity_total: String(item.quantity_total || 0),
      quantity_available: String(item.quantity_available || 0),
      unit_price_rent: String(item.unit_price_rent || 0),
      images: item.images || [], condition: item.condition || 'buena', notes: item.notes || '',
    });
    setInventoryImageUrl(''); setShowInventoryModal(true);
  };

  // ─── Visit handlers ───

  const handleVisitSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = {
        ...visitForm, property_id: gardenProp?.id || '',
        duration_minutes: parseInt(visitForm.duration_minutes) || 60,
      };
      if (editVisit) {
        await api.patch(`/garden-visits/${editVisit.id}`, payload);
        toast.success('Visita actualizada');
      } else {
        await api.post('/garden-visits', payload);
        toast.success('Visita agendada');
      }
      setShowVisitModal(false); setEditVisit(null); setVisitForm(EMPTY_VISIT);
      fetchVisits();
    } catch (err) { toast.error(err.response?.data?.detail || 'Error al guardar visita'); }
    finally { setLoading(false); }
  };

  const handleDeleteVisit = async (id) => {
    if (!window.confirm('¿Eliminar esta visita?')) return;
    try { await api.delete(`/garden-visits/${id}`); toast.success('Visita eliminada'); fetchVisits(); }
    catch { toast.error('Error al eliminar'); }
  };

  const openVisitEdit = (visit) => {
    setEditVisit(visit);
    setVisitForm({
      visit_type: visit.visit_type || 'cliente', client_name: visit.client_name || '',
      client_phone: visit.client_phone || '', client_email: visit.client_email || '',
      vendor_id: visit.vendor_id || '', vendor_name: visit.vendor_name || '',
      visit_date: visit.visit_date ? visit.visit_date.slice(0,16) : '',
      duration_minutes: String(visit.duration_minutes || 60), notes: visit.notes || '',
    });
    setShowVisitModal(true);
  };

  const handleVisitStatus = async (id, status) => {
    try {
      await api.patch(`/garden-visits/${id}`, { status });
      toast.success('Estado actualizado'); fetchVisits();
    } catch { toast.error('Error al actualizar'); }
  };

  // ─── Metrics ───

  const totalRevenue = bookings.filter(b => b.booking_status !== 'cancelled').reduce((s, b) => s + (b.total_price || 0), 0);
  const pendingPayments = bookings.filter(b => b.payment_status === 'pending' && b.booking_status !== 'cancelled').length;
  const confirmedEvents = bookings.filter(b => b.booking_status === 'confirmed').length;
  const today = new Date().toISOString().split('T')[0];
  const upcoming = bookings.filter(b => b.event_date >= today && b.booking_status === 'confirmed').length;

  // Filtered lists
  const filteredVendors = vendorCatFilter ? vendors.filter(v => v.category === vendorCatFilter) : vendors;
  const filteredInventory = inventoryCatFilter ? inventory.filter(i => i.category === inventoryCatFilter) : inventory;
  const filteredVisits = visitStatusFilter ? visits.filter(v => v.status === visitStatusFilter) : visits;

  // ─────────────── Render ───────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>
            {gardenProp?.name || 'Jardín de Eventos'}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Gestión de eventos, proveedores e inventario</p>
        </div>
        <div className="flex gap-2">
          {isReceptionist && tab === 'bookings' && (
            <button onClick={() => { setForm(EMPTY_BOOKING); setShowModal(true); }}
              data-testid="new-event-booking-btn"
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white"
              style={{ background: ACCENT }}>
              <Plus size={16} />Nueva Reserva
            </button>
          )}
          {isAdmin && tab === 'proveedores' && (
            <button onClick={() => { setVendorForm(EMPTY_VENDOR); setEditVendor(null); setVendorImageUrl(''); setShowVendorModal(true); }}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white"
              style={{ background: ACCENT }}>
              <Plus size={16} />Agregar Proveedor
            </button>
          )}
          {isAdmin && tab === 'inventario' && (
            <button onClick={() => { setInventoryForm(EMPTY_INVENTORY); setEditInventoryItem(null); setInventoryImageUrl(''); setShowInventoryModal(true); }}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white"
              style={{ background: ACCENT }}>
              <Plus size={16} />Agregar Artículo
            </button>
          )}
          {isReceptionist && tab === 'visitas' && (
            <button onClick={() => { setVisitForm(EMPTY_VISIT); setEditVisit(null); setShowVisitModal(true); }}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white"
              style={{ background: ACCENT }}>
              <Plus size={16} />Agendar Visita
            </button>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Ingresos Totales', value: fmt(totalRevenue), icon: DollarSign, color: 'text-emerald-600', bg: 'bg-emerald-50', testId: 'garden-revenue' },
          { label: 'Eventos Confirmados', value: confirmedEvents, icon: CheckCircle, color: 'text-blue-600', bg: 'bg-blue-50', testId: 'garden-confirmed' },
          { label: 'Próximos Eventos', value: upcoming, icon: Calendar, color: 'text-violet-600', bg: 'bg-violet-50', testId: 'garden-upcoming' },
          { label: 'Cobros Pendientes', value: pendingPayments, icon: Clock, color: pendingPayments > 0 ? 'text-red-500' : 'text-slate-400', bg: pendingPayments > 0 ? 'bg-red-50' : 'bg-slate-50', testId: 'garden-pending' },
        ].map(({ label, value, icon: Icon, color, bg, testId }) => (
          <div key={label} data-testid={testId} className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
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
      <div className="flex flex-wrap gap-1 bg-slate-100 rounded-lg p-1 w-fit">
        {[
          { key: 'bookings',    label: `Reservas (${bookings.length})` },
          { key: 'spaces',      label: `Espacios (${spaces.length})` },
          { key: 'calendar',    label: 'Calendario' },
          { key: 'proveedores', label: `Proveedores (${vendors.length})` },
          { key: 'inventario',  label: `Inventario (${inventory.length})` },
          { key: 'visitas',     label: `Visitas (${visits.length})` },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${tab === t.key ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Search (bookings) */}
      {tab === 'bookings' && (
        <div className="relative w-full max-w-xs">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input data-testid="garden-search" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar cliente o tipo..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-offset-1"
            style={{ '--tw-ring-color': ACCENT }} />
        </div>
      )}

      {/* ═══════════ BOOKINGS TAB ═══════════ */}
      {tab === 'bookings' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100" style={{ background: '#faf8f3' }}>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Cliente</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Espacio</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Fecha</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Tipo</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Total</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Estado</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Pago</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-10 text-slate-400 text-sm">No hay reservas de eventos</td></tr>
                ) : filtered.map(b => (
                  <tr key={b.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800">{b.client_name}</p>
                      <p className="text-xs text-slate-400">{b.attendees} personas</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600 text-xs">{b.event_space_name}</td>
                    <td className="px-4 py-3 text-slate-600 text-xs">{b.event_date}</td>
                    <td className="px-4 py-3"><EventTypeBadge type={b.event_type} /></td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-800">{fmt(b.total_price)}</td>
                    <td className="px-4 py-3">
                      {isReceptionist ? (
                        <select value={b.booking_status}
                          onChange={e => handleStatusChange(b.id, 'booking_status', e.target.value)}
                          className="text-xs border border-slate-200 rounded px-2 py-1 bg-white focus:outline-none">
                          <option value="confirmed">Confirmado</option>
                          <option value="pending">Pendiente</option>
                          <option value="cancelled">Cancelado</option>
                        </select>
                      ) : <StatusBadge s={b.booking_status} />}
                    </td>
                    <td className="px-4 py-3">
                      {isReceptionist ? (
                        <select value={b.payment_status}
                          onChange={e => handleStatusChange(b.id, 'payment_status', e.target.value)}
                          className="text-xs border border-slate-200 rounded px-2 py-1 bg-white focus:outline-none">
                          <option value="pending">Pendiente</option>
                          <option value="paid">Pagado</option>
                        </select>
                      ) : <PayBadge s={b.payment_status} />}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button data-testid={`view-event-${b.id}`} onClick={() => openDetail(b)}
                          className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                          <Eye size={14} />
                        </button>
                        {isAdmin && (
                          <button data-testid={`delete-event-${b.id}`} onClick={() => handleDelete(b.id)}
                            className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors">
                            <Trash2 size={14} />
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
      )}

      {/* ═══════════ SPACES TAB ═══════════ */}
      {tab === 'spaces' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {spaces.length === 0 ? (
            <div className="col-span-3 text-center py-12 text-slate-400">No hay espacios registrados</div>
          ) : spaces.map(s => (
            <div key={s.id} data-testid={`space-card-${s.id}`}
              className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-violet-50">
                  <Sparkles size={20} className="text-violet-600" strokeWidth={1.5} />
                </div>
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${s.status === 'available' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                  {s.status === 'available' ? 'Disponible' : 'Ocupado'}
                </span>
              </div>
              <h3 className="font-semibold text-slate-800 mb-1" style={{ fontFamily: 'Manrope, sans-serif' }}>{s.space_name}</h3>
              {s.description && <p className="text-xs text-slate-500 mb-3 leading-relaxed">{s.description}</p>}
              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                <span className="flex items-center gap-1 text-xs text-slate-500"><Users size={12} /> Capacidad: {s.capacity}</span>
                {s.price_per_event && <span className="text-xs font-semibold text-emerald-700">{fmt(s.price_per_event)}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ═══════════ PROVEEDORES TAB ═══════════ */}
      {tab === 'proveedores' && (
        <div className="space-y-4">
          {/* Category filter */}
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setVendorCatFilter('')}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${!vendorCatFilter ? 'border-transparent text-white' : 'border-slate-200 text-slate-600 bg-white hover:border-slate-300'}`}
              style={!vendorCatFilter ? { background: ACCENT } : {}}>
              Todos ({vendors.length})
            </button>
            {Object.entries(VENDOR_CATEGORIES).map(([key, cat]) => {
              const count = vendors.filter(v => v.category === key).length;
              if (!count && vendorCatFilter !== key) return null;
              return (
                <button key={key} onClick={() => setVendorCatFilter(key)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${vendorCatFilter === key ? 'border-transparent text-white' : 'border-slate-200 text-slate-600 bg-white hover:border-slate-300'}`}
                  style={vendorCatFilter === key ? { background: ACCENT } : {}}>
                  {cat.label} ({count})
                </button>
              );
            })}
          </div>

          {filteredVendors.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <Package size={40} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">No hay proveedores registrados.</p>
              {isAdmin && <p className="text-xs mt-1">Haz clic en "Agregar Proveedor" para comenzar.</p>}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredVendors.map(vendor => {
                const cat = VENDOR_CATEGORIES[vendor.category] || VENDOR_CATEGORIES.otros;
                const CatIcon = cat.icon;
                return (
                  <div key={vendor.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    {/* Photo */}
                    {vendor.images?.length > 0 ? (
                      <div className="h-40 overflow-hidden bg-slate-100">
                        <img src={vendor.images[0]} alt={vendor.name}
                          className="w-full h-full object-cover"
                          onError={e => { e.target.style.display='none'; }} />
                      </div>
                    ) : (
                      <div className={`h-28 flex items-center justify-center ${cat.color.replace('text-', 'bg-').replace('-600','-50').replace('-700','-50')}`}>
                        <CatIcon size={36} className={cat.color.split(' ')[1]} strokeWidth={1} />
                      </div>
                    )}
                    <div className="p-4 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="font-semibold text-slate-900 text-sm leading-tight" style={{ fontFamily: 'Manrope, sans-serif' }}>
                            {vendor.name}
                          </h3>
                          <span className={`inline-flex items-center gap-1 mt-0.5 px-2 py-0.5 rounded-full text-xs font-medium ${cat.color}`}>
                            <CatIcon size={10} />{cat.label}
                          </span>
                        </div>
                        {isAdmin && (
                          <div className="flex gap-1 flex-shrink-0">
                            <button onClick={() => openVendorEdit(vendor)}
                              className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                              <Edit2 size={13} />
                            </button>
                            <button onClick={() => handleDeleteVendor(vendor.id)}
                              className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors">
                              <Trash2 size={13} />
                            </button>
                          </div>
                        )}
                      </div>

                      {vendor.rating && <Stars rating={vendor.rating} />}

                      {vendor.description && (
                        <p className="text-xs text-slate-500 leading-relaxed line-clamp-2">{vendor.description}</p>
                      )}
                      {vendor.price_info && (
                        <p className="text-xs font-semibold text-emerald-700">{vendor.price_info}</p>
                      )}

                      <div className="pt-2 border-t border-slate-100 space-y-1">
                        {vendor.contact_name && (
                          <p className="text-xs text-slate-600 flex items-center gap-1.5">
                            <Users size={11} className="text-slate-400" />{vendor.contact_name}
                          </p>
                        )}
                        {vendor.phone && (
                          <p className="text-xs text-slate-600 flex items-center gap-1.5">
                            <Phone size={11} className="text-slate-400" />{vendor.phone}
                          </p>
                        )}
                        {vendor.email && (
                          <p className="text-xs text-slate-600 flex items-center gap-1.5">
                            <Mail size={11} className="text-slate-400" />{vendor.email}
                          </p>
                        )}
                        {vendor.website && (
                          <a href={vendor.website} target="_blank" rel="noreferrer"
                            className="text-xs text-blue-600 flex items-center gap-1.5 hover:underline">
                            <Globe size={11} />{vendor.website.replace(/^https?:\/\//, '')}
                          </a>
                        )}
                      </div>

                      {/* Additional images strip */}
                      {vendor.images?.length > 1 && (
                        <div className="flex gap-1 pt-1">
                          {vendor.images.slice(1, 4).map((img, i) => (
                            <img key={i} src={img} alt="" className="w-12 h-12 object-cover rounded-md border border-slate-100"
                              onError={e => { e.target.style.display='none'; }} />
                          ))}
                          {vendor.images.length > 4 && (
                            <div className="w-12 h-12 rounded-md bg-slate-100 flex items-center justify-center text-xs text-slate-500 font-medium">
                              +{vendor.images.length - 4}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══════════ INVENTARIO TAB ═══════════ */}
      {tab === 'inventario' && (
        <div className="space-y-4">
          {/* Category filter */}
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setInventoryCatFilter('')}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${!inventoryCatFilter ? 'border-transparent text-white' : 'border-slate-200 text-slate-600 bg-white'}`}
              style={!inventoryCatFilter ? { background: ACCENT } : {}}>
              Todos ({inventory.length})
            </button>
            {Object.entries(INVENTORY_CATEGORIES).map(([key, cat]) => {
              const count = inventory.filter(i => i.category === key).length;
              if (!count && inventoryCatFilter !== key) return null;
              return (
                <button key={key} onClick={() => setInventoryCatFilter(key)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${inventoryCatFilter === key ? 'border-transparent text-white' : 'border-slate-200 text-slate-600 bg-white'}`}
                  style={inventoryCatFilter === key ? { background: ACCENT } : {}}>
                  {cat.emoji} {cat.label} ({count})
                </button>
              );
            })}
          </div>

          {filteredInventory.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <Package size={40} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">No hay artículos registrados.</p>
              {isAdmin && <p className="text-xs mt-1">Haz clic en "Agregar Artículo" para comenzar.</p>}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredInventory.map(item => {
                const cat = INVENTORY_CATEGORIES[item.category] || INVENTORY_CATEGORIES.otros;
                const cond = INVENTORY_CONDITION[item.condition] || INVENTORY_CONDITION.buena;
                return (
                  <div key={item.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    {/* Photo */}
                    {item.images?.length > 0 ? (
                      <div className="h-40 overflow-hidden bg-slate-100">
                        <img src={item.images[0]} alt={item.name}
                          className="w-full h-full object-cover"
                          onError={e => { e.target.style.display='none'; }} />
                      </div>
                    ) : (
                      <div className="h-28 bg-slate-50 flex items-center justify-center">
                        <span className="text-4xl">{cat.emoji}</span>
                      </div>
                    )}
                    <div className="p-4 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold text-slate-900 text-sm leading-tight" style={{ fontFamily: 'Manrope, sans-serif' }}>
                          {item.name}
                        </h3>
                        {isAdmin && (
                          <div className="flex gap-1 flex-shrink-0">
                            <button onClick={() => openInventoryEdit(item)}
                              className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                              <Edit2 size={13} />
                            </button>
                            <button onClick={() => handleDeleteInventory(item.id)}
                              className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors">
                              <Trash2 size={13} />
                            </button>
                          </div>
                        )}
                      </div>

                      <p className="text-xs text-slate-500">{cat.emoji} {cat.label}</p>

                      {item.description && <p className="text-xs text-slate-400 line-clamp-2">{item.description}</p>}

                      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
                        <div className="text-center">
                          <p className="text-xs text-slate-400">Disponibles</p>
                          <p className="font-bold text-slate-800 text-lg">{item.quantity_available}</p>
                          <p className="text-xs text-slate-400">de {item.quantity_total}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-slate-400">Renta / pieza</p>
                          <p className="font-bold text-emerald-700 text-sm">{fmt(item.unit_price_rent)}</p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cond.cls}`}>
                          {cond.label}
                        </span>
                        {item.images?.length > 1 && (
                          <span className="text-xs text-slate-400 flex items-center gap-1">
                            <Image size={11} />{item.images.length} fotos
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══════════ VISITAS TAB ═══════════ */}
      {tab === 'visitas' && (
        <div className="space-y-4">
          {/* Status filter */}
          <div className="flex flex-wrap gap-2">
            {[{ key: '', label: `Todas (${visits.length})` }, ...Object.entries(VISIT_STATUS).map(([k,v]) => ({ key: k, label: v.label }))].map(({ key, label }) => (
              <button key={key} onClick={() => setVisitStatusFilter(key)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${visitStatusFilter === key ? 'border-transparent text-white' : 'border-slate-200 text-slate-600 bg-white'}`}
                style={visitStatusFilter === key ? { background: ACCENT } : {}}>
                {label}
              </button>
            ))}
          </div>

          {filteredVisits.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <CalendarDays size={40} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">No hay visitas registradas.</p>
              {isReceptionist && <p className="text-xs mt-1">Haz clic en "Agendar Visita" para comenzar.</p>}
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100" style={{ background: '#faf8f3' }}>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Fecha / Hora</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Tipo</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Cliente / Contacto</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Duración</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Estado</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredVisits.map(visit => {
                    const vt = VISIT_TYPES[visit.visit_type] || VISIT_TYPES.otro;
                    const vs = VISIT_STATUS[visit.status] || VISIT_STATUS.scheduled;
                    const dt = visit.visit_date ? new Date(visit.visit_date) : null;
                    return (
                      <tr key={visit.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3">
                          <p className="font-medium text-slate-800 text-xs">
                            {dt ? dt.toLocaleDateString('es-MX', { day:'2-digit', month:'short', year:'numeric' }) : visit.visit_date}
                          </p>
                          <p className="text-xs text-slate-400">
                            {dt ? dt.toLocaleTimeString('es-MX', { hour:'2-digit', minute:'2-digit' }) : ''}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${vt.color}`}>{vt.label}</span>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-slate-800 text-xs">{visit.client_name}</p>
                          {visit.vendor_name && <p className="text-xs text-slate-400">Prov: {visit.vendor_name}</p>}
                          {visit.client_phone && (
                            <p className="text-xs text-slate-400 flex items-center gap-1"><Phone size={10} />{visit.client_phone}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">{visit.duration_minutes} min</td>
                        <td className="px-4 py-3">
                          {isReceptionist ? (
                            <select value={visit.status} onChange={e => handleVisitStatus(visit.id, e.target.value)}
                              className="text-xs border border-slate-200 rounded px-2 py-1 bg-white focus:outline-none">
                              {Object.entries(VISIT_STATUS).map(([k,v]) => (
                                <option key={k} value={k}>{v.label}</option>
                              ))}
                            </select>
                          ) : (
                            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${vs.cls}`}>{vs.label}</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            {isReceptionist && (
                              <button onClick={() => openVisitEdit(visit)}
                                className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                                <Edit2 size={13} />
                              </button>
                            )}
                            {isAdmin && (
                              <button onClick={() => handleDeleteVisit(visit.id)}
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

      {/* ═══════════ CALENDAR TAB ═══════════ */}
      {tab === 'calendar' && (() => {
        const { year, month } = calMonth;
        const monthNames = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
        const dayNames = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;
        const monthBookings = bookings.filter(b => b.event_date?.startsWith(monthStr) && b.booking_status !== 'cancelled');
        const byDay = {};
        monthBookings.forEach(b => { const day = parseInt(b.event_date?.split('-')[2] || 0); if (!byDay[day]) byDay[day] = []; byDay[day].push(b); });
        const todayStr = new Date().toISOString().split('T')[0];
        const prevMonth = () => setCalMonth(c => c.month === 0 ? { year: c.year - 1, month: 11 } : { year: c.year, month: c.month - 1 });
        const nextMonth = () => setCalMonth(c => c.month === 11 ? { year: c.year + 1, month: 0 } : { year: c.year, month: c.month + 1 });
        return (
          <div className="space-y-4" data-testid="garden-calendar">
            <div className="flex items-center justify-between bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-3">
              <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-slate-500"><ChevronLeft size={18} /></button>
              <h3 className="font-semibold text-slate-800 text-base" style={{ fontFamily: 'Manrope, sans-serif' }}>{monthNames[month]} {year}</h3>
              <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-slate-500"><ChevronRightIcon size={18} /></button>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="grid grid-cols-7 border-b border-slate-100">
                {dayNames.map(d => <div key={d} className="py-2 text-center text-xs font-semibold text-slate-400 uppercase tracking-wide">{d}</div>)}
              </div>
              <div className="grid grid-cols-7">
                {Array.from({ length: firstDay }).map((_, i) => <div key={`e-${i}`} className="min-h-[80px] border-r border-b border-slate-50 bg-slate-50/50" />)}
                {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
                  const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                  const isToday = dateStr === todayStr;
                  const dayEvents = byDay[day] || [];
                  return (
                    <div key={day} className="min-h-[80px] p-2 border-r border-b border-slate-50">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-medium mb-1 ${isToday ? 'text-white' : 'text-slate-600'}`}
                        style={isToday ? { background: ACCENT } : {}}>
                        {day}
                      </div>
                      <div className="space-y-0.5">
                        {dayEvents.slice(0,2).map(b => {
                          const et = EVENT_TYPES[b.event_type] || EVENT_TYPES.other;
                          return <button key={b.id} onClick={() => openDetail(b)}
                            className={`w-full text-left px-1.5 py-0.5 rounded text-xs font-medium truncate ${et.color} hover:opacity-80`}>
                            {b.client_name}
                          </button>;
                        })}
                        {dayEvents.length > 2 && <p className="text-xs text-slate-400 px-1.5">+{dayEvents.length - 2} más</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            {monthBookings.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                <h4 className="font-semibold text-slate-700 text-sm mb-3">{monthBookings.length} evento(s) en {monthNames[month]}</h4>
                <div className="space-y-2">
                  {monthBookings.sort((a,b) => a.event_date.localeCompare(b.event_date)).map(b => {
                    const et = EVENT_TYPES[b.event_type] || EVENT_TYPES.other;
                    return (
                      <div key={b.id} onClick={() => openDetail(b)}
                        className="flex items-center gap-3 p-2.5 rounded-lg border border-slate-100 hover:bg-slate-50 cursor-pointer">
                        <div className="text-xs font-bold text-slate-400 w-10 text-center flex-shrink-0">{b.event_date?.split('-')[2]}</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">{b.client_name}</p>
                          <p className="text-xs text-slate-400">{b.event_space_name}</p>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold flex-shrink-0 ${et.color}`}>{et.label}</span>
                        <span className="text-sm font-semibold text-slate-700 flex-shrink-0">{fmt(b.total_price)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* ═══════════ NEW BOOKING MODAL ═══════════ */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-5 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>Nueva Reserva de Evento</h2>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Espacio *</label>
                <select data-testid="form-space" value={form.event_space_id}
                  onChange={e => setForm(f => ({ ...f, event_space_id: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2" required>
                  <option value="">Seleccionar espacio</option>
                  {spaces.map(s => <option key={s.id} value={s.id}>{s.space_name} (cap. {s.capacity})</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Nombre del cliente *</label>
                  <input data-testid="form-client-name" value={form.client_name}
                    onChange={e => setForm(f => ({ ...f, client_name: e.target.value }))}
                    placeholder="Ej: Familia Rodríguez"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2" required />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Tipo de evento *</label>
                  <select data-testid="form-event-type" value={form.event_type}
                    onChange={e => setForm(f => ({ ...f, event_type: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2">
                    {Object.entries(EVENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Email</label>
                  <input value={form.client_email} onChange={e => setForm(f => ({ ...f, client_email: e.target.value }))}
                    type="email" placeholder="cliente@email.com"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Teléfono</label>
                  <input value={form.client_phone} onChange={e => setForm(f => ({ ...f, client_phone: e.target.value }))}
                    placeholder="+52 55 0000 0000"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Fecha del evento *</label>
                  <input data-testid="form-event-date" value={form.event_date}
                    onChange={e => setForm(f => ({ ...f, event_date: e.target.value }))}
                    type="date" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2" required />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">No. de asistentes</label>
                  <input value={form.attendees} onChange={e => setForm(f => ({ ...f, attendees: e.target.value }))}
                    type="number" min="1" placeholder="0"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Total del evento (MXN)</label>
                <input data-testid="form-total-price" value={form.total_price}
                  onChange={e => setForm(f => ({ ...f, total_price: e.target.value }))}
                  type="number" min="0" step="100" placeholder="0.00"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Notas</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  rows={2} placeholder="Detalles del evento..."
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 resize-none" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)}
                  className="flex-1 py-2.5 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50">Cancelar</button>
                <button data-testid="submit-event-booking" type="submit" disabled={loading}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
                  style={{ background: ACCENT }}>{loading ? 'Guardando...' : 'Crear Reserva'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══════════ DETAIL MODAL ═══════════ */}
      {detailBooking && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setDetailBooking(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>Detalle del Evento</h2>
              <button onClick={() => setDetailBooking(null)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><XCircle size={18} /></button>
            </div>
            <div className="px-6 py-5 space-y-5">
              {[
                { label: 'Cliente', value: detailBooking.client_name },
                { label: 'Espacio', value: detailBooking.event_space_name },
                { label: 'Fecha', value: detailBooking.event_date },
                { label: 'Tipo', value: <EventTypeBadge type={detailBooking.event_type} /> },
                { label: 'Asistentes', value: detailBooking.attendees },
                { label: 'Total', value: fmt(detailBooking.total_price) },
                { label: 'Estado', value: <StatusBadge s={detailBooking.booking_status} /> },
                { label: 'Pago', value: <PayBadge s={detailBooking.payment_status} /> },
                ...(detailBooking.client_email ? [{ label: 'Email', value: detailBooking.client_email }] : []),
                ...(detailBooking.client_phone ? [{ label: 'Teléfono', value: detailBooking.client_phone }] : []),
                ...(detailBooking.notes ? [{ label: 'Notas', value: detailBooking.notes }] : []),
              ].map(({ label, value }) => (
                <div key={label} className="flex items-start justify-between gap-2">
                  <span className="text-xs text-slate-500 font-medium w-24 flex-shrink-0">{label}</span>
                  <span className="text-sm text-slate-800 text-right">{value}</span>
                </div>
              ))}
              <div className="pt-3 border-t border-slate-100 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-800">Integración de hospedaje</h3>
                  <label className="flex items-center gap-2 text-xs text-slate-600">
                    <input type="checkbox" checked={!!lodgingForm.lodging_integration_enabled}
                      onChange={e => setLodgingForm(f => ({ ...f, lodging_integration_enabled: e.target.checked }))} />
                    Activar
                  </label>
                </div>
                {lodgingForm.lodging_integration_enabled && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { key: 'bride_room_id', label: 'Habitación Novia' },
                        { key: 'groom_room_id', label: 'Habitación Novio' },
                        { key: 'parents_room_id', label: 'Habitación Padres' },
                        { key: 'close_family_room_id', label: 'Familia Cercana' },
                      ].map(({ key, label }) => (
                        <div key={key}>
                          <label className="block text-xs font-semibold text-slate-600 mb-1">{label}</label>
                          <select value={lodgingForm[key]}
                            onChange={e => setLodgingForm(f => ({ ...f, [key]: e.target.value }))}
                            className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white">
                            <option value="">Sin asignar</option>
                            {rooms.map(r => <option key={r.id} value={r.id}>#{r.number} · {r.type}</option>)}
                          </select>
                        </div>
                      ))}
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Bloque de huéspedes (habitaciones)</label>
                      <input type="number" min="0" value={lodgingForm.guest_block_count}
                        onChange={e => setLodgingForm(f => ({ ...f, guest_block_count: e.target.value }))}
                        className="w-full max-w-[220px] border border-slate-200 rounded-lg px-2 py-1.5 text-xs" />
                    </div>
                  </>
                )}
                <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <div className="text-xs text-slate-600">
                    <p>Resumen habitaciones</p>
                    <p className="mt-1">Held: <strong>{lodgingData?.summary?.held || 0}</strong> · Reserved: <strong>{lodgingData?.summary?.reserved || 0}</strong> · Released: <strong>{lodgingData?.summary?.released || 0}</strong></p>
                  </div>
                  {isReceptionist && (
                    <button onClick={saveLodgingSetup} disabled={lodgingSaving}
                      className="px-3 py-2 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
                      style={{ background: ACCENT }}>
                      {lodgingSaving ? 'Guardando...' : 'Guardar hospedaje'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ VENDOR MODAL ═══════════ */}
      {showVendorModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[92vh] overflow-y-auto">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>
                {editVendor ? 'Editar Proveedor' : 'Nuevo Proveedor'}
              </h2>
              <button onClick={() => { setShowVendorModal(false); setEditVendor(null); }} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><XCircle size={18} /></button>
            </div>
            <form onSubmit={handleVendorSubmit} className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Nombre del proveedor *</label>
                  <input value={vendorForm.name} onChange={e => setVendorForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="Ej: Estudio Luz y Color" required
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Categoría *</label>
                  <select value={vendorForm.category} onChange={e => setVendorForm(f => ({ ...f, category: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2">
                    {Object.entries(VENDOR_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Contacto</label>
                  <input value={vendorForm.contact_name} onChange={e => setVendorForm(f => ({ ...f, contact_name: e.target.value }))}
                    placeholder="Nombre del contacto"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Teléfono</label>
                  <input value={vendorForm.phone} onChange={e => setVendorForm(f => ({ ...f, phone: e.target.value }))}
                    placeholder="+52 55 0000 0000"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Email</label>
                  <input value={vendorForm.email} onChange={e => setVendorForm(f => ({ ...f, email: e.target.value }))}
                    type="email" placeholder="proveedor@email.com"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Sitio web</label>
                  <input value={vendorForm.website} onChange={e => setVendorForm(f => ({ ...f, website: e.target.value }))}
                    placeholder="https://..."
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Descripción</label>
                  <textarea value={vendorForm.description} onChange={e => setVendorForm(f => ({ ...f, description: e.target.value }))}
                    rows={2} placeholder="¿Qué servicios ofrece?"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 resize-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Precio / tarifa</label>
                  <input value={vendorForm.price_info} onChange={e => setVendorForm(f => ({ ...f, price_info: e.target.value }))}
                    placeholder="Ej: desde $8,000"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Calificación (1-5)</label>
                  <input value={vendorForm.rating} onChange={e => setVendorForm(f => ({ ...f, rating: e.target.value }))}
                    type="number" min="1" max="5" step="0.5" placeholder="4.5"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2" />
                </div>
              </div>

              {/* Photos */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-2 flex items-center gap-1"><Image size={12} /> Fotos del proveedor / portafolio</label>
                <div className="flex gap-2 mb-2">
                  <input value={vendorImageUrl} onChange={e => setVendorImageUrl(e.target.value)}
                    placeholder="Pega URL de imagen (jpg, png, webp...)"
                    className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2" />
                  <button type="button" onClick={() => {
                    if (vendorImageUrl.trim()) {
                      setVendorForm(f => ({ ...f, images: [...f.images, vendorImageUrl.trim()] }));
                      setVendorImageUrl('');
                    }
                  }} className="px-3 py-2 rounded-lg text-xs font-semibold text-white" style={{ background: ACCENT }}>
                    + Agregar
                  </button>
                </div>
                {vendorForm.images.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {vendorForm.images.map((img, i) => (
                      <div key={i} className="relative group">
                        <img src={img} alt="" className="w-16 h-16 object-cover rounded-lg border border-slate-200"
                          onError={e => { e.target.style.display='none'; }} />
                        <button type="button" onClick={() => setVendorForm(f => ({ ...f, images: f.images.filter((_,j) => j !== i) }))}
                          className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Notas internas</label>
                <textarea value={vendorForm.notes} onChange={e => setVendorForm(f => ({ ...f, notes: e.target.value }))}
                  rows={2} placeholder="Notas para el equipo..."
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 resize-none" />
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setShowVendorModal(false); setEditVendor(null); }}
                  className="flex-1 py-2.5 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50">Cancelar</button>
                <button type="submit" disabled={loading}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
                  style={{ background: ACCENT }}>{loading ? 'Guardando...' : editVendor ? 'Actualizar' : 'Registrar Proveedor'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══════════ INVENTORY MODAL ═══════════ */}
      {showInventoryModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[92vh] overflow-y-auto">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>
                {editInventoryItem ? 'Editar Artículo' : 'Nuevo Artículo de Inventario'}
              </h2>
              <button onClick={() => { setShowInventoryModal(false); setEditInventoryItem(null); }} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><XCircle size={18} /></button>
            </div>
            <form onSubmit={handleInventorySubmit} className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Nombre del artículo *</label>
                  <input value={inventoryForm.name} onChange={e => setInventoryForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="Ej: Silla Tiffany Blanca" required
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Categoría *</label>
                  <select value={inventoryForm.category} onChange={e => setInventoryForm(f => ({ ...f, category: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2">
                    {Object.entries(INVENTORY_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v.emoji} {v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Condición</label>
                  <select value={inventoryForm.condition} onChange={e => setInventoryForm(f => ({ ...f, condition: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2">
                    {Object.entries(INVENTORY_CONDITION).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Descripción</label>
                  <textarea value={inventoryForm.description} onChange={e => setInventoryForm(f => ({ ...f, description: e.target.value }))}
                    rows={2} placeholder="Color, material, dimensiones..."
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 resize-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Cantidad total</label>
                  <input value={inventoryForm.quantity_total} onChange={e => setInventoryForm(f => ({ ...f, quantity_total: e.target.value }))}
                    type="number" min="0" placeholder="0"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Disponibles</label>
                  <input value={inventoryForm.quantity_available} onChange={e => setInventoryForm(f => ({ ...f, quantity_available: e.target.value }))}
                    type="number" min="0" placeholder="0"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Precio de renta por pieza (MXN)</label>
                  <input value={inventoryForm.unit_price_rent} onChange={e => setInventoryForm(f => ({ ...f, unit_price_rent: e.target.value }))}
                    type="number" min="0" step="1" placeholder="0.00"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2" />
                </div>
              </div>

              {/* Photos */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-2 flex items-center gap-1"><Image size={12} /> Fotos del artículo</label>
                <div className="flex gap-2 mb-2">
                  <input value={inventoryImageUrl} onChange={e => setInventoryImageUrl(e.target.value)}
                    placeholder="Pega URL de imagen..."
                    className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2" />
                  <button type="button" onClick={() => {
                    if (inventoryImageUrl.trim()) {
                      setInventoryForm(f => ({ ...f, images: [...f.images, inventoryImageUrl.trim()] }));
                      setInventoryImageUrl('');
                    }
                  }} className="px-3 py-2 rounded-lg text-xs font-semibold text-white" style={{ background: ACCENT }}>
                    + Agregar
                  </button>
                </div>
                {inventoryForm.images.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {inventoryForm.images.map((img, i) => (
                      <div key={i} className="relative group">
                        <img src={img} alt="" className="w-16 h-16 object-cover rounded-lg border border-slate-200"
                          onError={e => { e.target.style.display='none'; }} />
                        <button type="button" onClick={() => setInventoryForm(f => ({ ...f, images: f.images.filter((_,j) => j !== i) }))}
                          className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Notas</label>
                <textarea value={inventoryForm.notes} onChange={e => setInventoryForm(f => ({ ...f, notes: e.target.value }))}
                  rows={2} placeholder="Observaciones, almacenamiento..."
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 resize-none" />
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setShowInventoryModal(false); setEditInventoryItem(null); }}
                  className="flex-1 py-2.5 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50">Cancelar</button>
                <button type="submit" disabled={loading}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
                  style={{ background: ACCENT }}>{loading ? 'Guardando...' : editInventoryItem ? 'Actualizar' : 'Registrar Artículo'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══════════ VISIT MODAL ═══════════ */}
      {showVisitModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>
                {editVisit ? 'Editar Visita' : 'Agendar Visita'}
              </h2>
              <button onClick={() => { setShowVisitModal(false); setEditVisit(null); }} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><XCircle size={18} /></button>
            </div>
            <form onSubmit={handleVisitSubmit} className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Tipo de visita *</label>
                  <select value={visitForm.visit_type} onChange={e => setVisitForm(f => ({ ...f, visit_type: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2">
                    {Object.entries(VISIT_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Nombre del cliente / contacto *</label>
                  <input value={visitForm.client_name} onChange={e => setVisitForm(f => ({ ...f, client_name: e.target.value }))}
                    placeholder="Ej: María García" required
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Teléfono</label>
                  <input value={visitForm.client_phone} onChange={e => setVisitForm(f => ({ ...f, client_phone: e.target.value }))}
                    placeholder="+52 55 0000 0000"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Email</label>
                  <input value={visitForm.client_email} onChange={e => setVisitForm(f => ({ ...f, client_email: e.target.value }))}
                    type="email" placeholder="cliente@email.com"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2" />
                </div>
                {visitForm.visit_type === 'proveedor' && (
                  <div className="col-span-2">
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Proveedor relacionado</label>
                    <select value={visitForm.vendor_id}
                      onChange={e => {
                        const v = vendors.find(vnd => vnd.id === e.target.value);
                        setVisitForm(f => ({ ...f, vendor_id: e.target.value, vendor_name: v?.name || '' }));
                      }}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2">
                      <option value="">Sin proveedor asignado</option>
                      {vendors.map(v => <option key={v.id} value={v.id}>{v.name} — {VENDOR_CATEGORIES[v.category]?.label || v.category}</option>)}
                    </select>
                  </div>
                )}
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Fecha y hora *</label>
                  <input value={visitForm.visit_date} onChange={e => setVisitForm(f => ({ ...f, visit_date: e.target.value }))}
                    type="datetime-local" required
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Duración (minutos)</label>
                  <select value={visitForm.duration_minutes} onChange={e => setVisitForm(f => ({ ...f, duration_minutes: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2">
                    {[30, 45, 60, 90, 120, 180].map(m => <option key={m} value={m}>{m} min</option>)}
                  </select>
                </div>
                {editVisit && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Estado</label>
                    <select value={visitForm.status} onChange={e => setVisitForm(f => ({ ...f, status: e.target.value }))}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2">
                      {Object.entries(VISIT_STATUS).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>
                )}
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Notas</label>
                  <textarea value={visitForm.notes} onChange={e => setVisitForm(f => ({ ...f, notes: e.target.value }))}
                    rows={3} placeholder="Propósito de la visita, requisitos especiales..."
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 resize-none" />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setShowVisitModal(false); setEditVisit(null); }}
                  className="flex-1 py-2.5 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50">Cancelar</button>
                <button type="submit" disabled={loading}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
                  style={{ background: ACCENT }}>{loading ? 'Guardando...' : editVisit ? 'Actualizar' : 'Agendar Visita'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
