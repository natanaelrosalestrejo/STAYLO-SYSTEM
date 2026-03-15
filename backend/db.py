"""
MongoDB connection for the STAYLO backend.
Uses config for MONGO_URL and DB_NAME; exports client and db for app and shutdown.
"""
from motor.motor_asyncio import AsyncIOMotorClient

from config import DB_NAME, MONGO_URL

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]
