import { useState, useEffect, useRef, useMemo } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useProperty } from '../contexts/PropertyContext';
import api from '../utils/api';
import { getModuleForPath, routeSatisfiedByModules } from '../utils/permissions';
import { getPinnedPropertyIdForShell, isAssignedPropertyScopedRole, shouldShowPropertySelector } from '../utils/propertyScope';
import { deriveShellContext } from '../utils/shellContext';
import {
  LayoutDashboard, CalendarCheck, BedDouble, Users, Inbox,
  CheckSquare, BarChart3, UserCog, LogOut, Bell, Menu, BookOpen,
  Building2, Sparkles, ChevronDown, Globe2, Settings, Shield, Layers,
  CalendarDays, Calendar, Cpu, CreditCard
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
  // Owner strategic nav (lenguaje corporativo / cartera)
  { to: '/corporate', icon: Globe2, label: 'Visión corporativa', roles: ['owner', 'manager'] },
  { to: '/hotels', icon: Building2, label: 'Cartera de hoteles', roles: ['owner', 'manager'] },
  { to: '/event-gardens', icon: Sparkles, label: 'Portafolio de jardines', roles: ['owner', 'manager'] },
  // Operación diaria (finance no usa / — home en /reports)
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', labelOwner: 'Panel operativo', labelManager: 'Panel operativo', roles: ['receptionist', 'sales', 'manager', 'owner'] },
  { to: '/reservations', icon: CalendarCheck, label: 'Reservas', roles: ['receptionist', 'sales', 'manager', 'owner'] },
  { to: '/rooms', icon: BedDouble, label: 'Habitaciones', roles: ['receptionist', 'sales', 'manager', 'owner'] },
  { to: '/guests', icon: Users, label: 'Huéspedes', roles: ['receptionist', 'sales', 'manager', 'owner'] },
  { to: '/jardines', icon: Sparkles, label: 'Eventos en jardines', roles: ['manager', 'owner'] },
  { to: '/hotel-events', icon: CalendarDays, label: 'Eventos Hotel', roles: ['sales', 'manager', 'owner'] },
  // Shared modules
  { to: '/inbox', icon: Inbox, label: 'Inbox', roles: ['receptionist', 'sales', 'housekeeping', 'maintenance', 'security', 'restaurant', 'manager'] },
  { to: '/tasks', icon: CheckSquare, label: 'Tareas', roles: ['receptionist', 'sales', 'housekeeping', 'maintenance', 'security', 'restaurant', 'manager'] },
  { to: '/catalogo', icon: BookOpen, label: 'Catálogo', roles: ['receptionist', 'sales', 'manager'] },
  { to: '/reports', icon: BarChart3, label: 'Reportes', labelFinance: 'Centro financiero', roles: ['owner', 'manager', 'finance'] },
  // Management
  { to: '/staff', icon: UserCog, label: 'Personal', roles: ['manager'] },
  { to: '/room-types', icon: Cpu, label: 'Tipos de Hab.', roles: ['manager'] },
  { to: '/properties', icon: Settings, label: 'Propiedades', roles: ['manager'] },
];

const ADMIN_TYPE_LABELS = {
  platform_support: 'Platform Support',
  billing_admin: 'Billing Admin',
  technical_admin: 'Technical Admin',
  hotel_admin: 'Admin de hotel (plataforma)',
};

const getRoleLabel = (user) => {
  if (!user) return '';
  if (user.role === 'platform_admin') {
    return ADMIN_TYPE_LABELS[user.admin_type] || 'Platform Admin';
  }
  const labels = {
    manager: 'Gerente de operaciones',
    receptionist: 'Staff — Recepción',
    sales: 'Staff — Ventas',
    housekeeping: 'Staff — Limpieza',
    maintenance: 'Staff — Mantenimiento',
    security: 'Staff — Seguridad',
    restaurant: 'Staff — Restaurante',
    owner: 'Propietario',
    finance: 'Finanzas',
  };
  return labels[user.role] || user.role;
};

const OWNER_STRATEGIC = ['/corporate', '/hotels', '/event-gardens'];
const OWNER_HOTEL_OPS = ['/', '/reservations', '/rooms', '/guests', '/hotel-events', '/catalogo', '/reports'];

const ADMIN_GROUP_ORDER = ['/corporate', '/properties', '/staff', '/hotels', '/event-gardens'];
const ADMIN_HOTEL_ORDER = ['/', '/reservations', '/rooms', '/guests', '/hotel-events', '/inbox', '/tasks', '/catalogo', '/reports', '/staff'];
const ADMIN_GROUP_SECONDARY = ['/corporate', '/hotels', '/event-gardens', '/properties'];
const ADMIN_GARDEN_TAIL = ['/inbox', '/tasks', '/staff', '/reports'];

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const { properties, selectedPropertyId, selectedProperty, selectProperty } = useProperty();
  const navigate = useNavigate();
  const location = useLocation();
  const [unreadCount, setUnreadCount] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [propDropdown, setPropDropdown] = useState(false);
  const [groupDisplayName, setGroupDisplayName] = useState(null);
  const dropRef = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (dropRef.current && !dropRef.current.contains(e.target)) setPropDropdown(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (!user?.modules?.includes('inbox')) {
      setUnreadCount(0);
      return undefined;
    }
    const fetchUnread = async () => {
      try {
        const res = await api.get('/messages/unread-count');
        setUnreadCount(res.data.count);
      } catch (e) {
        setUnreadCount(0);
      }
    };
    fetchUnread();
    const interval = setInterval(fetchUnread, 30000);
    return () => clearInterval(interval);
  }, [user?.modules]);

  useEffect(() => {
    if (!user || user.role === 'platform_admin') {
      setGroupDisplayName(null);
      return;
    }
    const tid = user?.tenant_id || properties[0]?.tenant_id;
    if (!tid) {
      setGroupDisplayName(null);
      return;
    }
    api
      .get(`/tenants/${tid}`)
      .then((r) => setGroupDisplayName(r.data?.name || null))
      .catch(() => setGroupDisplayName(null));
  }, [user, user?.tenant_id, properties]);

  const handleLogout = () => { logout(); navigate('/login'); };

  const isPlatformAdmin = user?.role === 'platform_admin';

  const roleFiltered = navItems.filter(n => n.roles.includes(user?.role));
  // Backend sends effective modules (role_permissions merged with DB overrides, or custom_permissions if set)
  const modules = user?.modules;
  const filtered = modules && modules.length > 0
    ? roleFiltered.filter(n => {
        const mod = getModuleForPath(n.to);
        return mod ? routeSatisfiedByModules(modules, mod) : true;
      })
    : roleFiltered;

  const shellContext = useMemo(() => {
    if (!user || user.role === 'platform_admin') return null;
    return deriveShellContext(
      location,
      properties,
      selectedPropertyId,
      getPinnedPropertyIdForShell(user)
    );
  }, [user, location.pathname, location.search, properties, selectedPropertyId]);

  const navForOwner = useMemo(() => {
    if (user?.role !== 'owner' || !shellContext) return null;
    const strategic = filtered.filter((i) => OWNER_STRATEGIC.includes(i.to));
    const mode = shellContext.mode;
    if (mode === 'group') {
      return {
        primaryLabel: 'Corporativo',
        primary: strategic,
        secondaryLabel: null,
        secondary: [],
      };
    }
    if (mode === 'hotel') {
      return {
        primaryLabel: 'Operación del negocio',
        primary: filtered.filter((i) => OWNER_HOTEL_OPS.includes(i.to)),
        secondaryLabel: 'Estrategia de grupo',
        secondary: strategic,
      };
    }
    if (mode === 'garden') {
      return {
        primaryLabel: 'Operación del jardín',
        primary: filtered.filter((i) => i.to === '/jardines' || i.to === '/reports'),
        secondaryLabel: 'Estrategia de grupo',
        secondary: strategic,
      };
    }
    return {
      primaryLabel: 'Corporativo',
      primary: strategic,
      secondaryLabel: null,
      secondary: [],
    };
  }, [filtered, user?.role, shellContext]);

  /** Group / hotel / garden shell for operational manager. */
  const navForGroupManager = useMemo(() => {
    if (user?.role !== 'manager' || !shellContext) return null;
    const byTo = (to) => filtered.find((i) => i.to === to);
    const asItems = (paths) =>
      paths.map(byTo).filter(Boolean).map((item) => ({ kind: 'item', item }));

    const mode = shellContext.mode;
    if (mode === 'group') {
      return {
        primaryLabel: 'Corporativo',
        primary: asItems(ADMIN_GROUP_ORDER),
        secondaryLabel: null,
        secondary: [],
      };
    }
    if (mode === 'hotel') {
      return {
        primaryLabel: 'Operación del negocio',
        primary: asItems(ADMIN_HOTEL_ORDER),
        secondaryLabel: 'Estrategia de grupo',
        secondary: ADMIN_GROUP_SECONDARY.map(byTo).filter(Boolean),
      };
    }
    if (mode === 'garden') {
      const pid = shellContext.focusPropertyId;
      const primary = [];
      if (pid) {
        primary.push({
          kind: 'extra',
          key: 'garden-dash',
          to: `/jardines?propertyId=${encodeURIComponent(pid)}`,
          label: 'Dashboard del jardín',
          icon: LayoutDashboard,
        });
        primary.push({
          kind: 'extra',
          key: 'garden-cal',
          to: `/jardines?propertyId=${encodeURIComponent(pid)}&tab=calendar`,
          label: 'Calendario',
          icon: Calendar,
        });
      } else {
        const j = byTo('/jardines');
        if (j) primary.push({ kind: 'item', item: j });
      }
      ADMIN_GARDEN_TAIL.forEach((to) => {
        const it = byTo(to);
        if (it) primary.push({ kind: 'item', item: it });
      });
      return {
        primaryLabel: 'Operación del jardín',
        primary,
        secondaryLabel: 'Estrategia de grupo',
        secondary: ADMIN_GROUP_SECONDARY.map(byTo).filter(Boolean),
      };
    }
    return {
      primaryLabel: 'Corporativo',
      primary: asItems(ADMIN_GROUP_ORDER),
      secondaryLabel: null,
      secondary: [],
    };
  }, [user?.role, shellContext, filtered]);

  const navLabel = (item) => {
    if (user?.role === 'finance' && item.labelFinance) return item.labelFinance;
    if (user?.role === 'manager' && item.labelManager) return item.labelManager;
    if (user?.role === 'owner' && item.labelOwner) return item.labelOwner;
    return item.label;
  };

  const contextualNavLabel = (item) => {
    const base = navLabel(item);
    if (user?.role === 'manager' && item.to === '/reports') return 'Finanzas y reportes';
    if (user?.role === 'owner' && shellContext) {
      if (item.to === '/reports' && shellContext.mode === 'hotel') return 'Reportes del hotel';
      if (item.to === '/reports' && shellContext.mode === 'garden') return 'Reportes del jardín';
      return base;
    }
    if (user?.role !== 'manager' || !shellContext) return base;
    const m = shellContext.mode;
    if (m === 'group' && item.to === '/corporate') return 'Dashboard del grupo';
    if (m === 'group' && item.to === '/hotels') return 'Hoteles';
    if (m === 'group' && item.to === '/event-gardens') return 'Jardines';
    if (m === 'hotel' && item.to === '/') return 'Dashboard del hotel';
    if (m === 'hotel' && item.to === '/reports') return 'Reportes del hotel';
    if (m === 'garden' && item.to === '/jardines') return 'Eventos de jardín';
    if (m === 'garden' && item.to === '/reports') return 'Reportes del jardín';
    return base;
  };

  const tenantBrandSubtitle = () => {
    if (!shellContext) return '';
    if (shellContext.mode === 'group') {
      if (isAssignedPropertyScopedRole(user?.role)) {
        const n = properties.length;
        if (n === 0) return 'Sin propiedad asignada';
        if (n === 1) return properties[0]?.name || 'Propiedad';
        if (selectedPropertyId === 'all') return `${n} propiedades asignadas`;
        return shellContext.focusProperty?.name || groupDisplayName || 'Propiedad';
      }
      return groupDisplayName || 'Tu grupo';
    }
    return shellContext.focusProperty?.name || 'Propiedad';
  };

  const applyPropertySelection = (id) => {
    selectProperty(id);
    setPropDropdown(false);
    if (id === 'all') {
      if (user?.role === 'owner' || user?.role === 'manager') navigate('/corporate');
      return;
    }
    if (user?.role === 'owner') {
      const p = properties.find((x) => x.id === id);
      if (p?.type === 'hotel') navigate(`/owner/hotel/${id}`);
      else if (p?.type === 'event_garden') navigate(`/owner/garden/${id}`);
      return;
    }
    if (user?.role === 'manager') {
      const p = properties.find((x) => x.id === id);
      if (p?.type === 'hotel') navigate('/');
      else if (p?.type === 'event_garden') navigate(`/jardines?propertyId=${encodeURIComponent(id)}`);
    }
  };

  const pathForNavItem = (item) => {
    if (
      (user?.role === 'owner' || user?.role === 'manager') &&
      shellContext?.mode === 'garden' &&
      item.to === '/jardines' &&
      shellContext.focusPropertyId
    ) {
      return `/jardines?propertyId=${encodeURIComponent(shellContext.focusPropertyId)}`;
    }
    return item.to;
  };

  const renderNavLink = (item) => (
    <NavLink
      key={item.to}
      to={pathForNavItem(item)}
      end={item.to === '/' || item.end === true}
      className={({ isActive }) => `sidebar-nav-item ${isActive ? 'active' : ''}`}
      onClick={() => setSidebarOpen(false)}
      data-testid={`nav-${contextualNavLabel(item).toLowerCase().replace(/\s+/g, '-')}`}
    >
      <item.icon size={17} strokeWidth={1.5} />
      <span>{contextualNavLabel(item)}</span>
      {item.to === '/inbox' && unreadCount > 0 && (
        <span className="ml-auto text-xs rounded-full w-5 h-5 flex items-center justify-center font-semibold"
          style={{ background: '#d2c7b6', color: '#625746' }}>
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}
    </NavLink>
  );

  const renderAdminExtraLink = (entry) => {
    const Icon = entry.icon;
    return (
      <NavLink
        key={entry.key}
        to={entry.to}
        className={({ isActive }) => `sidebar-nav-item ${isActive ? 'active' : ''}`}
        onClick={() => setSidebarOpen(false)}
        data-testid={`nav-${entry.label.toLowerCase().replace(/\s+/g, '-')}`}
      >
        <Icon size={17} strokeWidth={1.5} />
        <span>{entry.label}</span>
      </NavLink>
    );
  };

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
              <p style={{ fontFamily: 'Manrope, sans-serif', color: '#fcf5e0', fontSize: '15px', fontWeight: 700, lineHeight: 1 }}>STAYLO</p>
              <p style={{ color: '#c8b8a8', fontSize: '9px', letterSpacing: '0.22em', fontFamily: 'Montserrat, sans-serif', fontWeight: 500, marginTop: 3 }}>PLATFORM CONSOLE</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(252,245,224,0.1)', border: '1px solid rgba(252,245,224,0.25)' }}
            >
              <span
                style={{
                  fontFamily: 'Manrope, sans-serif',
                  color: '#fcf5e0',
                  fontSize: '11px',
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                }}
              >
                S
              </span>
            </div>
            <div>
              <p
                style={{
                  fontFamily: 'Manrope, sans-serif',
                  color: '#fcf5e0',
                  fontSize: '15px',
                  fontWeight: 700,
                  lineHeight: 1,
                  letterSpacing: '0.04em',
                }}
              >
                STAYLO
              </p>
              <p
                style={{
                  color: '#c8b8a8',
                  fontSize: '10px',
                  letterSpacing: '0.06em',
                  fontFamily: 'Montserrat, sans-serif',
                  fontWeight: 500,
                  marginTop: 4,
                  lineHeight: 1.25,
                }}
                className="max-w-[148px] truncate"
                title={tenantBrandSubtitle()}
              >
                {tenantBrandSubtitle()}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {user?.role === 'manager' && navForGroupManager ? (
          <>
            <p className="px-3 pt-1 pb-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#a89888' }}>
              {navForGroupManager.primaryLabel}
            </p>
            {navForGroupManager.primary.map((entry) =>
              entry.kind === 'extra' ? renderAdminExtraLink(entry) : renderNavLink(entry.item)
            )}
            {navForGroupManager.secondary.length > 0 && navForGroupManager.secondaryLabel && (
              <>
                <p className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#a89888' }}>
                  {navForGroupManager.secondaryLabel}
                </p>
                {navForGroupManager.secondary.map(renderNavLink)}
              </>
            )}
          </>
        ) : user?.role === 'owner' && navForOwner ? (
          <>
            <p className="px-3 pt-1 pb-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#a89888' }}>
              {navForOwner.primaryLabel}
            </p>
            {navForOwner.primary.map(renderNavLink)}
            {navForOwner.secondary.length > 0 && navForOwner.secondaryLabel && (
              <>
                <p className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#a89888' }}>
                  {navForOwner.secondaryLabel}
                </p>
                {navForOwner.secondary.map(renderNavLink)}
              </>
            )}
          </>
        ) : (
          filtered.map(renderNavLink)
        )}
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
          STAYLO v1.0
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
            {/* Property selector (manager de grupo + owner): owner navega a rutas alineadas al contexto */}
            {shouldShowPropertySelector(user, properties.length) && (
              <div className="relative" ref={dropRef}>
                <button
                  data-testid="property-selector-btn"
                  onClick={() => setPropDropdown(v => !v)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors hover:bg-slate-50"
                  style={{ borderColor: '#e8e0d4', color: '#625746' }}
                  title="Cambiar propiedad en contexto"
                >
                  <Building2 size={14} strokeWidth={1.5} />
                  <span className="hidden sm:inline max-w-[160px] truncate">
                    {selectedProperty
                      ? selectedProperty.name
                      : isAssignedPropertyScopedRole(user?.role) || !['owner', 'manager'].includes(user?.role || '')
                        ? `Todas (${properties.length})`
                        : 'Todas las propiedades'}
                  </span>
                  <ChevronDown size={13} className={`transition-transform ${propDropdown ? 'rotate-180' : ''}`} />
                </button>
                {propDropdown && (
                  <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-50 min-w-[220px] py-1">
                    {(user?.role === 'owner' || user?.role === 'manager' || properties.length > 1) && (
                    <button
                      data-testid="prop-option-all"
                      onClick={() => applyPropertySelection('all')}
                      className={`w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 transition-colors flex items-center gap-2 ${selectedPropertyId === 'all' ? 'font-semibold' : ''}`}
                      style={{ color: '#625746' }}>
                      <Globe2 size={14} strokeWidth={1.5} />
                      {user?.role === 'owner' || user?.role === 'manager'
                        ? 'Todas las propiedades (grupo)'
                        : `Todas mis propiedades (${properties.length})`}
                    </button>
                    )}
                    {properties.map(p => (
                      <button
                        key={p.id}
                        data-testid={`prop-option-${p.id}`}
                        onClick={() => applyPropertySelection(p.id)}
                        className={`w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 transition-colors flex items-center gap-2 ${selectedPropertyId === p.id ? 'font-semibold' : ''}`}
                        style={{ color: '#625746' }}>
                        {p.type === 'hotel'
                          ? <Building2 size={14} strokeWidth={1.5} />
                          : <Sparkles size={14} strokeWidth={1.5} />
                        }
                        <span className="truncate">{p.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {user?.modules?.includes('inbox') && (
              <>
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
              </>
            )}
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
              style={{ backgroundColor: user?.avatar_color || '#917a6a' }}
              title={user?.name ? `${user.name} — ${getRoleLabel(user)}` : undefined}
              aria-label={user?.name ? `Usuario: ${user.name}` : 'Usuario'}
            >
              {user?.name?.charAt(0).toUpperCase()}
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
