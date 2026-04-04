"""
RFC v1 effective module resolution (docs/permission-resolution-rfc.md).

Backend-only: computes ordered module keys for auth responses and future guards.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, Iterable, List, Optional, Set

from models import DEFAULT_ROLE_PERMISSIONS, UserModel

logger = logging.getLogger(__name__)

PLATFORM_ADMIN_ROLE = "platform_admin"

# Optional modules not present in every role default (Platform Admin / custom_permissions).
ADDITIONAL_KNOWN_MODULE_KEYS: frozenset[str] = frozenset({"manager_financial_view"})

# Per-user optional grants: may be added via custom_permissions even if not in role default list.
OPTIONAL_USER_GRANT_MODULES_BY_ROLE: Dict[str, frozenset[str]] = {
    "manager": frozenset({"manager_financial_view"}),
}

KNOWN_MODULE_KEYS: Set[str] = (
    {m for modules in DEFAULT_ROLE_PERMISSIONS.values() for m in modules}
    | set(ADDITIONAL_KNOWN_MODULE_KEYS)
)
MODULE_CATALOG_ORDER: tuple[str, ...] = tuple(sorted(KNOWN_MODULE_KEYS))


def normalize_to_catalog(modules: Iterable[str], *, log_prefix: str = "") -> List[str]:
    """Deduplicate, drop unknown keys (log-safe), sort by catalog order."""
    out: List[str] = []
    seen: Set[str] = set()
    for m in modules:
        if m not in KNOWN_MODULE_KEYS:
            logger.warning(
                "permission_resolution: unknown module_key %r ignored in module list %s",
                m,
                log_prefix,
            )
            continue
        if m not in seen:
            seen.add(m)
            out.append(m)
    rank = {k: i for i, k in enumerate(MODULE_CATALOG_ORDER)}
    out.sort(key=lambda x: rank.get(x, len(MODULE_CATALOG_ORDER)))
    return out


def _finalize_with_custom(
    after_tenant: Iterable[str],
    custom_permissions: Optional[List[str]],
    *,
    log_ctx: str,
    role: str,
    tenant_allow: Optional[Set[str]] = None,
) -> List[str]:
    """RFC step 4: None skips; non-empty list intersects with after_tenant.

    Optional grant modules (e.g. manager_financial_view) union onto the result when listed
    in custom_permissions, so they can be granted per user without being in the role default.

    tenant_allow: when not None (tenant module whitelist), optional grants are only appended if
    present in this set — consistent with the tenant cutoff for base modules.
    """
    after_tenant_list = list(after_tenant)
    optional_for_role = OPTIONAL_USER_GRANT_MODULES_BY_ROLE.get(role, frozenset())

    if custom_permissions is None:
        return normalize_to_catalog(after_tenant_list, log_prefix=f"({log_ctx})")

    if len(custom_permissions) == 0:
        return []

    for c in custom_permissions:
        if c not in KNOWN_MODULE_KEYS:
            logger.warning(
                "permission_resolution: unknown module_key %r in custom_permissions ignored (%s)",
                c,
                log_ctx,
            )
    keep = set(custom_permissions)
    optional_in_custom = keep & optional_for_role
    restrict_keys = keep - optional_for_role

    if restrict_keys:
        base = [m for m in after_tenant_list if m in restrict_keys]
    else:
        base = list(after_tenant_list)

    for c in sorted(optional_in_custom):
        if tenant_allow is not None and c not in tenant_allow:
            logger.warning(
                "permission_resolution: optional module %r not in tenant module whitelist; skipped (%s)",
                c,
                log_ctx,
            )
            continue
        if c in KNOWN_MODULE_KEYS and c not in base:
            base.append(c)

    return normalize_to_catalog(base, log_prefix=f"({log_ctx})")


def _clean_tenant_allowlist(raw: Iterable[str]) -> Set[str]:
    s: Set[str] = set()
    for x in raw:
        if x not in KNOWN_MODULE_KEYS:
            logger.warning(
                "permission_resolution: unknown module_key %r in tenant.module_config.enabled_modules ignored",
                x,
            )
            continue
        s.add(x)
    return s


def _enabled_modules_from_tenant_doc(tenant: Dict[str, Any]) -> Optional[Set[str]]:
    """
    Returns:
      - set() empty → tenant has whitelist with no modules
      - non-empty set → whitelist
      - None → missing/invalid config → caller should use full catalog fallback
    """
    mc = tenant.get("module_config")
    if mc is None:
        return None
    if not isinstance(mc, dict):
        logger.warning("permission_resolution: tenant module_config is not an object; using full catalog fallback")
        return None
    mode = mc.get("mode", "whitelist")
    if mode != "whitelist":
        logger.warning(
            "permission_resolution: tenant module_config.mode=%r is not whitelist; using full catalog fallback",
            mode,
        )
        return None
    em = mc.get("enabled_modules")
    if not isinstance(em, list):
        logger.warning(
            "permission_resolution: tenant module_config.enabled_modules missing or invalid; using full catalog fallback"
        )
        return None
    return _clean_tenant_allowlist(em)


def resolve_effective_modules_core(
    *,
    role: str,
    tenant_id: Optional[str],
    custom_permissions: Optional[List[str]],
    global_role_modules: List[str],
    tenant_role_modules_replace: Optional[List[str]] = None,
    tenant_enabled_allowlist: Optional[Set[str]] = None,
    platform_admin: bool = False,
) -> List[str]:
    """
    Pure resolution for tests and docs parity with RFC.
    tenant_enabled_allowlist None → intersect with full known catalog (migration fallback).
    """
    if platform_admin:
        global_clean = normalize_to_catalog(global_role_modules, log_prefix=f"(role={role} platform)")
        return _finalize_with_custom(
            global_clean,
            custom_permissions,
            log_ctx=f"role={role} platform_admin",
            role=role,
            tenant_allow=None,
        )

    tid = (tenant_id or "").strip()
    if not tid:
        return []

    role_after = list(tenant_role_modules_replace) if tenant_role_modules_replace is not None else list(global_role_modules)
    role_after = normalize_to_catalog(role_after, log_prefix=f"(role={role} tenant={tid})")

    allow = set(KNOWN_MODULE_KEYS) if tenant_enabled_allowlist is None else set(tenant_enabled_allowlist)
    after_tenant = [m for m in role_after if m in allow]
    after_tenant = normalize_to_catalog(after_tenant, log_prefix=f"(tenant_cut tenant={tid})")

    return _finalize_with_custom(
        after_tenant,
        custom_permissions,
        log_ctx=f"role={role} tenant={tid}",
        role=role,
        tenant_allow=allow,
    )


async def _load_global_role_modules(role: str) -> List[str]:
    from db import db

    doc = await db.role_permissions.find_one({"role": role}, {"_id": 0})
    if doc and isinstance(doc.get("modules"), list):
        return list(doc["modules"])
    return list(DEFAULT_ROLE_PERMISSIONS.get(role, []))


async def resolve_effective_modules_for_user(user_obj: UserModel) -> List[str]:
    """
    Async resolver: reads Mongo for global role row, tenant_role_modules, tenant.module_config.
    platform_admin: ignores tenant_id and tenant module_config entirely (RFC exception).
    """
    role = user_obj.role
    global_mods = await _load_global_role_modules(role)

    if role == PLATFORM_ADMIN_ROLE:
        return resolve_effective_modules_core(
            role=role,
            tenant_id=user_obj.tenant_id,
            custom_permissions=user_obj.custom_permissions,
            global_role_modules=list(global_mods),
            tenant_role_modules_replace=None,
            tenant_enabled_allowlist=None,
            platform_admin=True,
        )

    tid = (user_obj.tenant_id or "").strip()
    if not tid:
        logger.warning(
            "permission_resolution: CONFIG ERROR missing tenant_id for tenant-scoped user "
            "(effective_modules=[]) user_id=%s email=%s role=%s",
            user_obj.id,
            user_obj.email,
            role,
        )
        return []

    from db import db

    tenant = await db.tenants.find_one({"id": tid}, {"_id": 0})
    if not tenant:
        logger.warning(
            "permission_resolution: CONFIG ERROR tenant not found "
            "(effective_modules=[]) tenant_id=%s user_id=%s role=%s",
            tid,
            user_obj.id,
            role,
        )
        return []

    tr_doc = await db.tenant_role_modules.find_one({"tenant_id": tid, "role": role}, {"_id": 0})
    tr_replace: Optional[List[str]] = None
    if tr_doc and isinstance(tr_doc.get("modules"), list):
        tr_replace = list(tr_doc["modules"])

    tenant_allow_optional = _enabled_modules_from_tenant_doc(tenant)
    if tenant_allow_optional is None:
        logger.info(
            "permission_resolution: tenant %s has no valid module_config whitelist; "
            "using full catalog fallback (run data migration per RFC)",
            tid,
        )

    return resolve_effective_modules_core(
        role=role,
        tenant_id=tid,
        custom_permissions=user_obj.custom_permissions,
        global_role_modules=list(global_mods),
        tenant_role_modules_replace=tr_replace,
        tenant_enabled_allowlist=tenant_allow_optional,
        platform_admin=False,
    )
