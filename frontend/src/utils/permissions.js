/**
 * Single source of truth for route–module mapping and module-based access.
 * Used by Layout (sidebar) and ProtectedRoute so visibility and route access stay consistent.
 * Backend remains source of truth for effective modules (user.modules from /auth/me).
 */

/** Path or path prefix → backed module key. Must stay in sync with backend module keys. */
export const ROUTE_MODULE_MAP = {
  '/platform-admin': 'platform_admin',
  '/platform-admin/tenants': 'platform_admin',
  '/platform-admin/propiedades': 'platform_admin',
  '/platform-admin/onboarding': 'platform_admin',
  '/platform-admin/usuarios': 'platform_admin',
  '/platform-admin/facturacion': 'platform_admin',
  '/staff': 'staff',
  '/corporate': 'corporate',
  '/hotels': 'hotels',
  '/event-gardens': 'event-gardens',
  '/': 'dashboard',
  '/reservations': 'reservations',
  '/rooms': 'rooms',
  '/guests': 'guests',
  '/jardines': 'jardines',
  '/hotel-events': 'hotel-events',
  '/room-types': 'room-types',
  '/inbox': 'inbox',
  '/tasks': 'tasks',
  '/catalogo': 'catalog',
  '/reports': 'reports',
  '/properties': 'properties',
};

/** Garden module keys (backend) → operational UI still uses /jardines for navigation. */
const GARDEN_MODULE_KEYS = [
  'garden_dashboard',
  'garden_event_bookings',
  'garden_event_spaces',
  'garden_lodging_integration',
  'garden_guest_list',
  'garden_sales',
];

/** module_key → first path to open when ordering by effective modules. */
export const MODULE_HOME = {
  platform_admin: '/platform-admin',
  corporate: '/corporate',
  hotels: '/hotels',
  'event-gardens': '/event-gardens',
  dashboard: '/',
  reservations: '/reservations',
  rooms: '/rooms',
  guests: '/guests',
  jardines: '/jardines',
  'hotel-events': '/hotel-events',
  catalog: '/catalogo',
  reports: '/reports',
  /** Property-scoped financial UI (maps to /reports); not global owner finance. */
  manager_financial_view: '/reports',
  inbox: '/inbox',
  tasks: '/tasks',
  staff: '/staff',
  properties: '/properties',
  'room-types': '/room-types',
  ...Object.fromEntries(GARDEN_MODULE_KEYS.map((k) => [k, '/jardines'])),
};

const OWNER_HOME_ORDER = [
  'corporate',
  'hotels',
  'event-gardens',
  'dashboard',
  'reservations',
  'rooms',
  'guests',
  'hotel-events',
  'catalog',
  'reports',
  'jardines',
  'inbox',
  'tasks',
  'staff',
  'properties',
  'room-types',
  ...GARDEN_MODULE_KEYS,
];

/** Prioridad de landing para gerente operativo de grupo. */
const GROUP_MANAGER_HOME_ORDER = [
  'hotels',
  'event-gardens',
  'corporate',
  'dashboard',
  'reservations',
  'rooms',
  'guests',
  'inbox',
  'tasks',
  'catalog',
  'jardines',
  'hotel-events',
  'reports',
  'staff',
  'properties',
  'room-types',
  ...GARDEN_MODULE_KEYS,
];

const RECEPTIONIST_MANAGER_HOME_ORDER = [
  'dashboard',
  'reservations',
  'rooms',
  'guests',
  'inbox',
  'tasks',
  'catalog',
  'jardines',
  'hotel-events',
  'manager_financial_view',
  'reports',
  'staff',
  'properties',
  'room-types',
  ...GARDEN_MODULE_KEYS,
];

/** Finance lands on /reports only; never operational dashboard. */
const FINANCE_HOME_ORDER = ['reports'];

const STAFF_LIGHT_HOME_ORDER = ['inbox', 'tasks', 'dashboard', ...GARDEN_MODULE_KEYS];

/**
 * Landing path after auth: first matching module key → MODULE_HOME.
 * Used so each hotel role has a stable entry (login, forbidden fallback, catch-all).
 * Access still enforced by canAccessRoute (module + allowedRoles).
 */
const ROLE_ENTRY_MODULE = {
  owner: 'corporate',
  finance: 'reports',
  sales: 'dashboard',
};

/**
 * Returns the module key for a given pathname, or null if no module (e.g. public routes).
 * Subpaths under /platform-admin map to platform_admin.
 */
export function getModuleForPath(pathname) {
  const normalized = pathname.replace(/\/$/, '') || '/';
  if (ROUTE_MODULE_MAP[normalized] !== undefined) return ROUTE_MODULE_MAP[normalized];
  if (normalized.startsWith('/platform-admin')) return 'platform_admin';
  if (normalized.startsWith('/owner/hotel')) return 'hotels';
  if (normalized.startsWith('/owner/garden')) return 'event-gardens';
  return null;
}

/** True if effective modules satisfy the route's module (includes manager_financial_view → reports). */
export function routeSatisfiedByModules(modules, moduleKey) {
  if (!modules || !Array.isArray(modules) || modules.length === 0) return false;
  if (modules.includes(moduleKey)) return true;
  if (moduleKey === 'reports' && modules.includes('manager_financial_view')) return true;
  return false;
}

/**
 * Returns true if the user is allowed to access the route.
 * - If allowedRoles is provided and user.role is not in it → false.
 * - If the route has a moduleKey and user.modules is missing, not an array, or empty → false
 *   (aligns with backend: empty effective_modules means no product modules).
 * - If the route has a moduleKey and the module is not in user.modules → false.
 */
export function canAccessRoute(user, pathname, allowedRoles) {
  if (!user) return false;
  if (allowedRoles != null && allowedRoles.length > 0 && !allowedRoles.includes(user.role)) return false;
  const moduleKey = getModuleForPath(pathname);
  if (moduleKey == null) return true;
  return routeSatisfiedByModules(user.modules, moduleKey);
}

/** First navigable path from an ordered list of module keys. */
function firstHomeFromModules(modules, order, moduleHome) {
  if (!modules || !Array.isArray(modules) || modules.length === 0) return null;
  for (const key of order) {
    if (modules.includes(key) && moduleHome[key]) return moduleHome[key];
  }
  return null;
}

function homeFromGardenOnlyModules(modules) {
  if (!modules || !Array.isArray(modules)) return null;
  if (modules.some((m) => typeof m === 'string' && m.startsWith('garden_'))) return '/jardines';
  return null;
}

/**
 * Default landing path after login (used for redirects).
 * Returns null when there is no non-empty effective module list or no matching home (caller may logout).
 * @param {string|{ role?: string, modules?: string[] }} roleOrUser
 * @returns {string|null}
 */
export function getDefaultPathForRole(roleOrUser) {
  const role = typeof roleOrUser === 'string' ? roleOrUser : roleOrUser?.role;
  const modules = typeof roleOrUser === 'object' && roleOrUser != null ? roleOrUser.modules : null;

  if (role === 'platform_admin') return '/platform-admin';

  if (!Array.isArray(modules) || modules.length === 0) return null;

  const entryKey = role != null ? ROLE_ENTRY_MODULE[role] : undefined;
  if (entryKey && routeSatisfiedByModules(modules, entryKey)) {
    const home = MODULE_HOME[entryKey];
    if (home) return home;
  }

  if (role === 'owner') {
    const path = firstHomeFromModules(modules, OWNER_HOME_ORDER, MODULE_HOME);
    if (path) return path;
    return homeFromGardenOnlyModules(modules);
  }

  if (role === 'manager') {
    const path = firstHomeFromModules(modules, GROUP_MANAGER_HOME_ORDER, MODULE_HOME);
    if (path) return path;
    const pathRm = firstHomeFromModules(modules, RECEPTIONIST_MANAGER_HOME_ORDER, MODULE_HOME);
    if (pathRm) return pathRm;
    return homeFromGardenOnlyModules(modules);
  }

  if (role === 'finance') {
    const path = firstHomeFromModules(modules, FINANCE_HOME_ORDER, MODULE_HOME);
    if (path) return path;
    return homeFromGardenOnlyModules(modules);
  }

  if (role === 'receptionist' || role === 'sales') {
    const path = firstHomeFromModules(modules, RECEPTIONIST_MANAGER_HOME_ORDER, MODULE_HOME);
    if (path) return path;
    return homeFromGardenOnlyModules(modules);
  }

  if (['housekeeping', 'maintenance', 'security', 'restaurant'].includes(role)) {
    const path = firstHomeFromModules(modules, STAFF_LIGHT_HOME_ORDER, MODULE_HOME);
    if (path) return path;
    return homeFromGardenOnlyModules(modules);
  }

  if (typeof role === 'string' && role.startsWith('garden_')) {
    const path = firstHomeFromModules(modules, [...GARDEN_MODULE_KEYS, 'inbox', 'tasks', 'reports', 'staff'], MODULE_HOME);
    if (path) return path;
    return homeFromGardenOnlyModules(modules);
  }

  const path = firstHomeFromModules(modules, RECEPTIONIST_MANAGER_HOME_ORDER, MODULE_HOME);
  if (path) return path;
  return homeFromGardenOnlyModules(modules);
}
