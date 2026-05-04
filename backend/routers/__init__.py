"""
Routers package: extracted route groups from server.py.
"""
from .messages import router as messages_router
from .tasks import router as tasks_router
from .users import router as users_router
from .auth import router as auth_router
from .rooms import router as rooms_router
from .guests import router as guests_router
from .event_lodging import router as event_lodging_router
from .reservations import router as reservations_router
from .reports import router as reports_router
from .properties import router as properties_router
from .tenants import router as tenants_router
from .public_booking import router as public_booking_router
from .event_spaces import router as event_spaces_router
from .hotel_spaces import router as hotel_spaces_router
from .amenities import router as amenities_router
from .room_types import router as room_types_router
from .role_permissions import router as role_permissions_router
from .onboarding import router as onboarding_router
from .corporate import router as corporate_router
from .ai import router as ai_router
from .features import router as features_router

__all__ = [
    "messages_router",
    "tasks_router",
    "users_router",
    "auth_router",
    "rooms_router",
    "guests_router",
    "event_lodging_router",
    "reservations_router",
    "reports_router",
    "properties_router",
    "tenants_router",
    "public_booking_router",
    "event_spaces_router",
    "hotel_spaces_router",
    "amenities_router",
    "room_types_router",
    "role_permissions_router",
    "onboarding_router",
    "corporate_router",
    "ai_router",
    "features_router",
]
