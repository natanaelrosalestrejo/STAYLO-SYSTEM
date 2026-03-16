/**
 * Single source of truth for route–module mapping and module-based access.
 * Used by Layout (sidebar) and ProtectedRoute so visibility and route access stay consistent.
 * Backend remains source of truth for effective modules (user.modules from /auth/me).
 */

/** Path or path prefix → backend module key. Must stay in sync with backend module keys. */
export const ROUTE_MODULE_MAP = {
  '/platform-admin': 'platform_admin',
  '/platform-admin/tenants': 'platform_admin',
  '/platform-admin/propiedades': 'platform_admin',
  '/platform-admin/permisos': 'platform_admin',
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

/**
 * Returns the module key for a given pathname, or null if no module (e.g. public routes).
 * Subpaths under /platform-admin map to platform_admin.
 */
export function getModuleForPath(pathname) {
  const normalized = pathname.replace(/\/$/, '') || '/';
  if (ROUTE_MODULE_MAP[normalized] !== undefined) return ROUTE_MODULE_MAP[normalized];
  if (normalized.startsWith('/platform-admin')) return 'platform_admin';
  return null;
}

/**
 * Returns true if the user is allowed to access the route.
 * - If allowedRoles is provided and user.role is not in it → false.
 * - If the route has a module and user has effective modules (user.modules non-empty),
 *   the route's module must be in user.modules; otherwise → false.
 */
export function canAccessRoute(user, pathname, allowedRoles) {
  if (!user) return false;
  if (allowedRoles != null && allowedRoles.length > 0 && !allowedRoles.includes(user.role)) return false;
  const moduleKey = getModuleForPath(pathname);
  if (moduleKey == null) return true;
  const modules = user.modules;
  if (!modules || !Array.isArray(modules) || modules.length === 0) return true;
  return modules.includes(moduleKey);
}

/**
 * Default landing path after login by role (used for redirects).
 */
export function getDefaultPathForRole(role) {
  if (role === 'platform_admin') return '/platform-admin';
  if (role === 'owner') return '/corporate';
  if (['admin', 'receptionist', 'manager'].includes(role)) return '/';
  return '/tasks';
}
