/**
 * Derives shell mode (group vs hotel vs garden) from route + property selection.
 * Used by Layout for branding — does not replace backend permissions.
 */

export const OWNER_GROUP_PATHS = new Set(['/corporate', '/hotels', '/event-gardens']);

/**
 * @param {{ pathname: string, search?: string }} location
 * @param {Array<{ id: string, type: string, name?: string }>} properties
 * @param {string} selectedPropertyId
 * @param {string | null | undefined} pinnedPropertyId - user's property_id (e.g. receptionist); used for subtitle when scope is "all"
 * @returns {{ mode: 'group'|'hotel'|'garden', focusProperty: object | null, focusPropertyId: string | null }}
 */
export function deriveShellContext(
  location,
  properties,
  selectedPropertyId,
  pinnedPropertyId = null
) {
  const pathname = (location.pathname || '/').replace(/\/$/, '') || '/';
  const params = new URLSearchParams(location.search || '');
  const qPid = params.get('propertyId');

  if (OWNER_GROUP_PATHS.has(pathname)) {
    return { mode: 'group', focusProperty: null, focusPropertyId: null };
  }

  const parts = pathname.split('/').filter(Boolean);
  if (parts[0] === 'owner' && parts[1] === 'hotel' && parts[2]) {
    const id = parts[2];
    const focusProperty = properties.find((p) => p.id === id) || null;
    return { mode: 'hotel', focusProperty, focusPropertyId: id };
  }
  if (parts[0] === 'owner' && parts[1] === 'garden' && parts[2]) {
    const id = parts[2];
    const focusProperty = properties.find((p) => p.id === id) || null;
    return { mode: 'garden', focusProperty, focusPropertyId: id };
  }

  if (pathname === '/jardines') {
    const id = qPid || (selectedPropertyId !== 'all' ? selectedPropertyId : null);
    if (id) {
      const focusProperty = properties.find((p) => p.id === id);
      if (focusProperty?.type === 'event_garden') {
        return { mode: 'garden', focusProperty, focusPropertyId: id };
      }
    }
  }

  if (selectedPropertyId && selectedPropertyId !== 'all') {
    const sp = properties.find((p) => p.id === selectedPropertyId);
    if (sp?.type === 'hotel') {
      return { mode: 'hotel', focusProperty: sp, focusPropertyId: selectedPropertyId };
    }
    if (sp?.type === 'event_garden') {
      return { mode: 'garden', focusProperty: sp, focusPropertyId: selectedPropertyId };
    }
  }

  if (pinnedPropertyId && (!selectedPropertyId || selectedPropertyId === 'all')) {
    const p = properties.find((x) => x.id === pinnedPropertyId);
    if (p?.type === 'hotel') {
      return { mode: 'hotel', focusProperty: p, focusPropertyId: pinnedPropertyId };
    }
    if (p?.type === 'event_garden') {
      return { mode: 'garden', focusProperty: p, focusPropertyId: pinnedPropertyId };
    }
  }

  return { mode: 'group', focusProperty: null, focusPropertyId: null };
}

/** @deprecated use deriveShellContext — alias kept for existing imports */
export const deriveOwnerShellContext = deriveShellContext;
