"""
Unit tests for RFC v1 permission resolution (services.permission_resolution).
No live Mongo required — tests resolve_effective_modules_core.
"""
from models import DEFAULT_ROLE_PERMISSIONS
from services.permission_resolution import (
    KNOWN_MODULE_KEYS,
    MODULE_CATALOG_ORDER,
    normalize_to_catalog,
    resolve_effective_modules_core,
)


class TestNormalizeToCatalog:
    def test_dedupes_and_sorts(self):
        raw = ["tasks", "inbox", "inbox", "dashboard"]
        out = normalize_to_catalog(raw)
        assert out == sorted(set(raw), key=lambda m: MODULE_CATALOG_ORDER.index(m))

    def test_unknown_modules_dropped(self):
        out = normalize_to_catalog(["dashboard", "not_a_real_module", "guests"])
        assert "not_a_real_module" not in out
        assert set(out) <= KNOWN_MODULE_KEYS

    def test_manager_financial_view_is_known(self):
        assert "manager_financial_view" in KNOWN_MODULE_KEYS


class TestDefaultOnlyAndGlobalOverride:
    def test_default_receptionist_full_catalog_fallback(self):
        """Tenant allowlist None → full catalog; equals default role list (sorted)."""
        default = DEFAULT_ROLE_PERMISSIONS["receptionist"]
        got = resolve_effective_modules_core(
            role="receptionist",
            tenant_id="t1",
            custom_permissions=None,
            global_role_modules=list(default),
            tenant_role_modules_replace=None,
            tenant_enabled_allowlist=None,
            platform_admin=False,
        )
        assert got == normalize_to_catalog(default)

    def test_global_override_replaces_default_list(self):
        override = ["dashboard", "reports", "bogus_unknown"]
        got = resolve_effective_modules_core(
            role="manager",
            tenant_id="t1",
            custom_permissions=None,
            global_role_modules=override,
            tenant_role_modules_replace=None,
            tenant_enabled_allowlist=None,
            platform_admin=False,
        )
        assert "bogus_unknown" not in got
        assert got == ["dashboard", "reports"]


class TestTenantRoleModules:
    def test_tenant_role_replace_overrides_global(self):
        got = resolve_effective_modules_core(
            role="manager",
            tenant_id="t1",
            custom_permissions=None,
            global_role_modules=["dashboard", "inbox"],
            tenant_role_modules_replace=["tasks", "inbox"],
            tenant_enabled_allowlist=None,
            platform_admin=False,
        )
        assert set(got) == {"inbox", "tasks"}


class TestTenantHardCutoff:
    def test_intersection_with_whitelist(self):
        allow = {"dashboard", "rooms", "guests"}
        got = resolve_effective_modules_core(
            role="receptionist",
            tenant_id="t1",
            custom_permissions=None,
            global_role_modules=DEFAULT_ROLE_PERMISSIONS["receptionist"],
            tenant_role_modules_replace=None,
            tenant_enabled_allowlist=allow,
            platform_admin=False,
        )
        assert set(got) == allow


class TestCustomPermissions:
    def test_manager_optional_financial_module_unions(self):
        """manager_financial_view in custom_permissions adds module without dropping role defaults."""
        default = DEFAULT_ROLE_PERMISSIONS["manager"]
        got = resolve_effective_modules_core(
            role="manager",
            tenant_id="t1",
            custom_permissions=["manager_financial_view"],
            global_role_modules=list(default),
            tenant_role_modules_replace=None,
            tenant_enabled_allowlist=None,
            platform_admin=False,
        )
        assert "manager_financial_view" in got
        assert set(default) <= set(got)

    def test_manager_custom_restricts_plus_financial(self):
        got = resolve_effective_modules_core(
            role="manager",
            tenant_id="t1",
            custom_permissions=["dashboard", "manager_financial_view"],
            global_role_modules=list(DEFAULT_ROLE_PERMISSIONS["manager"]),
            tenant_role_modules_replace=None,
            tenant_enabled_allowlist=None,
            platform_admin=False,
        )
        assert got == normalize_to_catalog(["dashboard", "manager_financial_view"])

    def test_manager_financial_view_respects_tenant_module_whitelist(self):
        """Optional grant must not bypass tenant enabled_modules (RFC tenant cutoff)."""
        default = list(DEFAULT_ROLE_PERMISSIONS["manager"])
        allow = set(default)
        assert "manager_financial_view" not in allow
        got = resolve_effective_modules_core(
            role="manager",
            tenant_id="t1",
            custom_permissions=["manager_financial_view"],
            global_role_modules=list(default),
            tenant_role_modules_replace=None,
            tenant_enabled_allowlist=allow,
            platform_admin=False,
        )
        assert "manager_financial_view" not in got
        assert set(got) == allow

    def test_manager_financial_view_allowed_when_whitelist_includes_it(self):
        default = list(DEFAULT_ROLE_PERMISSIONS["manager"])
        allow = set(default) | {"manager_financial_view"}
        got = resolve_effective_modules_core(
            role="manager",
            tenant_id="t1",
            custom_permissions=["manager_financial_view"],
            global_role_modules=list(default),
            tenant_role_modules_replace=None,
            tenant_enabled_allowlist=allow,
            platform_admin=False,
        )
        assert "manager_financial_view" in got

    def test_intersection_restricts(self):
        got = resolve_effective_modules_core(
            role="receptionist",
            tenant_id="t1",
            custom_permissions=["dashboard", "rooms", "extra_bad"],
            global_role_modules=DEFAULT_ROLE_PERMISSIONS["receptionist"],
            tenant_role_modules_replace=None,
            tenant_enabled_allowlist=None,
            platform_admin=False,
        )
        assert "extra_bad" not in got
        assert set(got) <= {"dashboard", "rooms"}

    def test_empty_custom_yields_empty(self):
        got = resolve_effective_modules_core(
            role="receptionist",
            tenant_id="t1",
            custom_permissions=[],
            global_role_modules=DEFAULT_ROLE_PERMISSIONS["receptionist"],
            tenant_role_modules_replace=None,
            tenant_enabled_allowlist=None,
            platform_admin=False,
        )
        assert got == []

    def test_none_custom_uses_after_tenant(self):
        got = resolve_effective_modules_core(
            role="receptionist",
            tenant_id="t1",
            custom_permissions=None,
            global_role_modules=DEFAULT_ROLE_PERMISSIONS["receptionist"],
            tenant_role_modules_replace=None,
            tenant_enabled_allowlist=None,
            platform_admin=False,
        )
        assert len(got) > 0


class TestMissingTenantId:
    def test_empty_tenant_id_returns_empty(self):
        got = resolve_effective_modules_core(
            role="manager",
            tenant_id="",
            custom_permissions=None,
            global_role_modules=DEFAULT_ROLE_PERMISSIONS["manager"],
            tenant_role_modules_replace=None,
            tenant_enabled_allowlist=None,
            platform_admin=False,
        )
        assert got == []

    def test_none_tenant_id_returns_empty(self):
        got = resolve_effective_modules_core(
            role="manager",
            tenant_id=None,
            custom_permissions=None,
            global_role_modules=DEFAULT_ROLE_PERMISSIONS["manager"],
            tenant_role_modules_replace=None,
            tenant_enabled_allowlist=None,
            platform_admin=False,
        )
        assert got == []


class TestPlatformAdmin:
    def test_ignores_tenant_allowlist_when_platform_admin(self):
        """platform_admin path must not apply tenant whitelist."""
        allow_small = {"platform_admin"}
        got = resolve_effective_modules_core(
            role="platform_admin",
            tenant_id=None,
            custom_permissions=None,
            global_role_modules=["platform_admin", "dashboard"],
            tenant_role_modules_replace=["tasks"],
            tenant_enabled_allowlist=allow_small,
            platform_admin=True,
        )
        assert set(got) == {"dashboard", "platform_admin"}

    def test_platform_admin_custom_intersection(self):
        got = resolve_effective_modules_core(
            role="platform_admin",
            tenant_id=None,
            custom_permissions=["platform_admin"],
            global_role_modules=["platform_admin", "dashboard"],
            tenant_role_modules_replace=None,
            tenant_enabled_allowlist=None,
            platform_admin=True,
        )
        assert got == ["platform_admin"]


class TestUnknownModulesLogSafe:
    def test_unknown_stripped_throughout_pipeline(self):
        got = resolve_effective_modules_core(
            role="manager",
            tenant_id="t1",
            custom_permissions=None,
            global_role_modules=["dashboard", "__unknown_x__", "rooms"],
            tenant_role_modules_replace=["__unknown_y__", "guests"],
            tenant_enabled_allowlist=set(KNOWN_MODULE_KEYS),
            platform_admin=False,
        )
        assert "__unknown_x__" not in got
        assert "__unknown_y__" not in got
        assert set(got) == {"guests"}

        got2 = resolve_effective_modules_core(
            role="manager",
            tenant_id="t1",
            custom_permissions=None,
            global_role_modules=["dashboard", "__unknown_z__", "rooms"],
            tenant_role_modules_replace=None,
            tenant_enabled_allowlist=set(KNOWN_MODULE_KEYS),
            platform_admin=False,
        )
        assert "__unknown_z__" not in got2
        assert {"dashboard", "rooms"} <= set(got2)
