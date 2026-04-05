/**
 * Client-side mirror of backend assigned-property resolution (property_ids first, then property_id).
 * Used for shell context, selectors, and page-level filtering. Backend remains authoritative.
 */

/**
 * @param {{ property_id?: string|null, property_ids?: string[]|null }|null|undefined} user
 * @returns {string[]}
 */
export function getAssignedPropertyIds(user) {
  if (!user) return [];
  const out = [];
  const seen = new Set();
  const raw = Array.isArray(user.property_ids) ? user.property_ids : [];
  for (const x of raw) {
    const s = String(x || '').trim();
    if (s && !seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  if (out.length) return out;
  const pid = user.property_id != null ? String(user.property_id).trim() : '';
  return pid ? [pid] : [];
}

/** Roles that must never use “grupo corporativo” framing in the shell. */
export function isAssignedPropertyScopedRole(role) {
  return role === 'manager' || role === 'finance';
}

/**
 * Pin for deriveShellContext when a single assigned property should imply hotel/garden mode.
 * @param {{ role?: string, property_id?: string|null, property_ids?: string[]|null }|null|undefined} user
 */
export function getPinnedPropertyIdForShell(user) {
  const ids = getAssignedPropertyIds(user);
  if (ids.length === 1) return ids[0];
  return user?.property_id != null ? String(user.property_id).trim() || null : null;
}

/**
 * Show header property switcher for roles that have multiple visible properties or need explicit context.
 */
export function shouldShowPropertySelector(user, visiblePropertiesCount) {
  if (!user || visiblePropertiesCount <= 0) return false;
  if (user.role === 'manager' || user.role === 'owner') return true;
  if (isAssignedPropertyScopedRole(user.role)) return visiblePropertiesCount > 1;
  if (['receptionist', 'housekeeping', 'maintenance', 'security', 'restaurant'].includes(user.role)) {
    return visiblePropertiesCount > 1;
  }
  return false;
}
