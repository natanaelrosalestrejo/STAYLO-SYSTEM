"""
Mongo match helpers for report endpoints.

allowed_property_ids semantics (from auth.allowed_property_ids_for_reports):
  None  → platform_admin; no property filter (full DB).
  []    → no visible properties; all counts should be zero / empty series.
  [...] → restrict reservations, rooms, and derived metrics to these property_id values
          (may be multiple ids from user.property_ids or legacy property_id).
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional


def reservation_property_match(allowed_property_ids: Optional[List[str]]) -> Dict[str, Any]:
    if allowed_property_ids is None:
        return {}
    return {"property_id": {"$in": allowed_property_ids}}


def room_property_match(allowed_property_ids: Optional[List[str]]) -> Dict[str, Any]:
    if allowed_property_ids is None:
        return {}
    return {"property_id": {"$in": allowed_property_ids}}
