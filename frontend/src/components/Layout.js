import { useState, useEffect, useRef } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useProperty } from '../contexts/PropertyContext';
import api from '../utils/api';
import { getModuleForPath } from '../utils/permissions';
import {
  LayoutDashboard, CalendarCheck, BedDouble, Users, Inbox,
  CheckSquare, BarChart3, UserCog, LogOut, Bell, Menu, BookOpen,
  Building2, Sparkles, ChevronDown, Globe2, Settings, Shield, Layers,
  CalendarDays, TreePine, Cpu, CreditCard
} from 'lucide-react';

const navItems = [
  // Platform Admin — 7 modules in sidebar
  { to: '/platform-admin',              icon: LayoutDashboard, label: 'Resumen',      roles: ['platform_admin'], end: true },
  { to: '/platform-admin/tenants',       icon: Globe2,          label: 'Tenants',      roles: ['platform_admin'] },
  { to: '/platform-admin/propiedades',   icon: Building2,       label: 'Propiedades',  roles: ['platform_admin'] },
  { to: '/platform-admin/permisos',      icon: Shield,          label: 'Permisos',     roles: ['platform_admin'] },
  { to: '/platform-admin/onboarding',    icon: Cpu,             label: 'Onboarding',   roles: ['platform_admin'] },
  { to: '/platform-admin/usuarios',      icon: Users,           label: 'Usuarios',     roles: ['platform_admin'] },
  { to: '/platform-admin/facturacion',   icon: CreditCard,      label: 'Facturación',  roles: ['platform_admin'] },
  // Owner strategic nav
  { to: '/corporate', icon: Globe2, label: 'Corp. Dashboard', roles: ['admin', 'owner'] },
  { to: '/hotels', icon: Building2, label: 'Hoteles', roles: ['owner'] },
  { to: '/event-gardens', icon: Sparkles, label: 'Jardines', roles: ['owner'] },
  // Operational nav (admin + manager + receptionist)
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', roles: ['admin', 'receptionist', 'manager'] },
  { to: '/reservations', icon: CalendarCheck, label: 'Reservas', roles: ['admin', 'receptionist', 'manager'] },
  { to: '/rooms', icon: BedDouble, label: 'Habitaciones', roles: ['admin', 'receptionist', 'manager'] },
  { to: '/guests', icon: Users, label: 'Huéspedes', roles: ['admin', 'receptionist', 'manager'] },
  { to: '/jardines', icon: Sparkles, label: 'Jardines', roles: ['admin', 'receptionist', 'manager'] },
  { to: '/hotel-events', icon: CalendarDays, label: 'Eventos Hotel', roles: ['admin', 'receptionist', 'manager'] },
  // Shared modules
  { to: '/inbox', icon: Inbox, label: 'Inbox', roles: ['admin', 'receptionist', 'housekeeping', 'maintenance', 'security', 'restaurant', 'manager'] },
  { to: '/tasks', icon: CheckSquare, label: 'Tareas', roles: ['admin', 'receptionist', 'housekeeping', 'maintenance', 'security', 'restaurant', 'manager'] },
  { to: '/catalogo', icon: BookOpen, label: 'Catálogo', roles: ['admin', 'receptionist', 'manager'] },
  { to: '/reports', icon: BarChart3, label: 'Reportes', roles: ['admin', 'owner', 'manager'] },
  // Management
  { to: '/staff', icon: UserCog, label: 'Personal', roles: ['admin', 'manager'] },
  { to: '/room-types', icon: Cpu, label: 'Tipos de Hab.', roles: ['admin', 'manager'] },
  { to: '/properties', icon: Settings, label: 'Propiedades', roles: ['admin'] },
];

const ADMIN_TYPE_LABELS = {
  platform_support: 'Platform Support',
  billing_admin: 'Billing Admin',
  technical_admin: 'Technical Admin',
  hotel_admin: 'Hotel Admin',
};

const getRoleLabel = (user) => {
  if (!user) return '';
  if (user.role === 'platform_admin') {
    return ADMIN_TYPE_LABELS[user.admin_type] || 'Platform Admin';
  }
  const labels = {
    admin: 'Hotel Admin',
    manager: 'Gerente',
    receptionist: 'Staff — Recepción',
    housekeeping: 'Staff — Limpieza',
    maintenance: 'Staff — Mantenimiento',
    security: 'Staff — Seguridad',
    restaurant: 'Staff — Restaurante',
    owner: 'Propietario',
  };
  return labels[user.role] || user.role;
};

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const { properties, selectedPropertyId, selectedProperty, selectProperty } = useProperty();
  const navigate = useNavigate();
  const [unreadCount, setUnreadCount] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [propDropdown, setPropDropdown] = useState(false);
  const dropRef = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (dropRef.current && !dropRef.current.contains(e.target)) setPropDropdown(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    const fetchUnread = async () => {
      try { const res = await api.get('/messages/unread-count'); setUnreadCount(res.data.count); } catch (e) {}
    };
    fetchUnread();
    const interval = setInterval(fetchUnread, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleLogout = () => { logout(); navigate('/login'); };

  const isPlatformAdmin = user?.role === 'platform_admin';

  const roleFiltered = navItems.filter(n => n.roles.includes(user?.role));
  // Backend sends effective modules (role_permissions merged with DB overrides, or custom_permissions if set)
  const modules = user?.modules;
  const filtered = modules && modules.length > 0
    ? roleFiltered.filter(n => {
        const mod = getModuleForPath(n.to);
        return mod ? modules.includes(mod) : true;
      })
    : roleFiltered;

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo / Branding */}
      <div className="px-6 py-6" style={{ borderBottom: '1px solid rgba(210, 199, 182, 0.2)' }}>
        {isPlatformAdmin ? (
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(252,245,224,0.12)', border: '1px solid rgba(252,245,224,0.25)' }}>
              <Layers size={17} style={{ color: '#fcf5e0' }} strokeWidth={1.5} />
            </div>
            <div>
              <p style={{ fontFamily: 'Manrope, sans-serif', color: '#fcf5e0', fontSize: '15px', fontWeight: 700, lineHeight: 1 }}>Staylo</p>
              <p style={{ color: '#c8b8a8', fontSize: '9px', letterSpacing: '0.22em', fontFamily: 'Montserrat, sans-serif', fontWeight: 500, marginTop: 3 }}>PLATFORM CONSOLE</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full border flex items-center justify-center flex-shrink-0"
              style={{ borderColor: 'rgba(252,245,224,0.4)', background: 'rgba(252,245,224,0.1)' }}>
              <span style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', color: '#fcf5e0', fontSize: '16px', fontStyle: 'italic', fontWeight: 400, lineHeight: 1 }}>ab</span>
            </div>
            <div>
              <p style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', color: '#fcf5e0', fontSize: '20px', fontWeight: 500, lineHeight: 1, letterSpacing: '0.05em' }}>alma</p>
              <p style={{ color: '#c8b8a8', fontSize: '9px', letterSpacing: '0.2em', fontFamily: 'Montserrat, sans-serif', fontWeight: 500 }}>HOTEL BOUTIQUE</p>
            </div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {filtered.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/' || item.end === true}
            className={({ isActive }) => `sidebar-nav-item ${isActive ? 'active' : ''}`}
            onClick={() => setSidebarOpen(false)}
            data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
          >
            <item.icon size={17} strokeWidth={1.5} />
            <span>{item.label}</span>
            {item.to === '/inbox' && unreadCount > 0 && (
              <span className="ml-auto text-xs rounded-full w-5 h-5 flex items-center justify-center font-semibold"
                style={{ background: '#d2c7b6', color: '#625746' }}>
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User */}
      <div className="px-3 py-4" style={{ borderTop: '1px solid rgba(210, 199, 182, 0.2)' }}>
        <div className="flex items-center gap-3 px-3 py-2 mb-2">
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
            style={{ backgroundColor: user?.avatar_color || '#917a6a' }}>
            {user?.name?.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p style={{ color: '#fcf5e0', fontSize: '13px', fontWeight: 600 }} className="truncate">{user?.name}</p>
            <p style={{ color: '#c8b8a8', fontSize: '11px' }}>{getRoleLabel(user)}</p>
          </div>
        </div>
        <button onClick={handleLogout} data-testid="logout-btn"
          className="sidebar-nav-item w-full" style={{ color: '#e8a8a8' }}>
          <LogOut size={15} strokeWidth={1.5} />
          <span>Cerrar sesión</span>
        </button>
        <p style={{ color: '#6b5d4e', fontSize: '10px', textAlign: 'center', marginTop: 8, letterSpacing: '0.08em', fontFamily: 'Montserrat, sans-serif' }}>
          {isPlatformAdmin ? 'STAYLO v1.0' : 'ALMA HOSPITALITY SYSTEM'}
        </p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex" style={{ background: '#faf8f3' }}>
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-56 flex-col flex-shrink-0 fixed h-full z-30"
        style={{ background: '#625746' }}>
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-56 flex flex-col" style={{ background: '#625746' }}>
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main */}
      <main className="flex-1 md:ml-56 min-h-screen flex flex-col">
        {/* Top bar */}
        <header className="bg-white border-b px-6 py-3 flex items-center justify-between sticky top-0 z-20"
          style={{ borderColor: '#e8e0d4' }}>
          <button className="md:hidden" style={{ color: '#625746' }} onClick={() => setSidebarOpen(true)} data-testid="menu-btn">
            <Menu size={22} />
          </button>
          <div className="hidden md:block" />
          <div className="flex items-center gap-3">
            {/* Property Selector (admin only) */}
            {user?.role === 'admin' && properties.length > 0 && (
              <div className="relative" ref={dropRef}>
                <button
                  data-testid="property-selector-btn"
                  onClick={() => setPropDropdown(v => !v)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors hover:bg-slate-50"
                  style={{ borderColor: '#e8e0d4', color: '#625746' }}>
                  <Building2 size={14} strokeWidth={1.5} />
                  <span className="hidden sm:inline max-w-[140px] truncate">
                    {selectedProperty ? selectedProperty.name : 'Todas las propiedades'}
                  </span>
                  <ChevronDown size={13} className={`transition-transform ${propDropdown ? 'rotate-180' : ''}`} />
                </button>
                {propDropdown && (
                  <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-50 min-w-[210px] py-1">
                    <button
                      data-testid="prop-option-all"
                      onClick={() => { selectProperty('all'); setPropDropdown(false); }}
                      className={`w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 transition-colors flex items-center gap-2 ${selectedPropertyId === 'all' ? 'font-semibold' : ''}`}
                      style={{ color: '#625746' }}>
                      <Globe2 size={14} strokeWidth={1.5} />
                      Todas las propiedades
                    </button>
                    {properties.map(p => (
                      <button
                        key={p.id}
                        data-testid={`prop-option-${p.id}`}
                        onClick={() => { selectProperty(p.id); setPropDropdown(false); }}
                        className={`w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 transition-colors flex items-center gap-2 ${selectedPropertyId === p.id ? 'font-semibold' : ''}`}
                        style={{ color: '#625746' }}>
                        {p.type === 'hotel'
                          ? <Building2 size={14} strokeWidth={1.5} />
                          : <Sparkles size={14} strokeWidth={1.5} />
                        }
                        {p.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <NavLink to="/inbox" className="relative transition-colors" style={{ color: '#917a6a' }} data-testid="header-inbox-btn">
              <Bell size={19} strokeWidth={1.5} />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold"
                  style={{ background: '#625746', color: '#fcf5e0', fontSize: '10px' }}>
                  {unreadCount}
                </span>
              )}
            </NavLink>
            <div className="h-5 w-px" style={{ background: '#e8e0d4' }} />
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold"
                style={{ backgroundColor: user?.avatar_color || '#917a6a' }}>
                {user?.name?.charAt(0).toUpperCase()}
              </div>
              <span className="text-sm hidden sm:block font-medium" style={{ color: '#625746' }}>{user?.name}</span>
            </div>
          </div>
        </header>

        <div className="flex-1 p-6 fade-in">
          {children}
        </div>
      </main>
    </div>
  );
}
