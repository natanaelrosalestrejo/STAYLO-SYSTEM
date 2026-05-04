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

__all__ = [
    "messages_router", "tasks_router", "users_router", "auth_router",
    "rooms_router", "guests_router", "event_lodging_router",
    "reservations_router", "reports_router",
]
