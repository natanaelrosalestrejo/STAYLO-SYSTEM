"""
Seeds package: demo data and catalog seeds for STAYLO.
Import run_all, COLORS, DEMO_PROPERTY_ID from here for use in server startup and routes.
"""
from .run import COLORS, DEMO_PROPERTY_ID, run_all

__all__ = ["run_all", "COLORS", "DEMO_PROPERTY_ID"]
