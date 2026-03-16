"""
Routers package: extracted route groups from server.py.
"""
from .messages import router as messages_router
from .tasks import router as tasks_router
from .users import router as users_router

__all__ = ["messages_router", "tasks_router", "users_router"]
