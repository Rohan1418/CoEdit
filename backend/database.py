import logging
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from backend.config import settings

logger = logging.getLogger(__name__)

class Database:
    client: AsyncIOMotorClient = None
    db: AsyncIOMotorDatabase = None

db_instance = Database()

async def get_database() -> AsyncIOMotorDatabase:
    """Dependency injector for FastAPI endpoints to retrieve the active database."""
    return db_instance.db

async def connect_to_mongo():
    """Initializes Motor client, connects to MongoDB Atlas, and establishes indexes."""
    try:
        logger.info(f"Connecting to MongoDB at {settings.MONGO_URI}...")
        client = AsyncIOMotorClient(
            settings.MONGO_URI,
            serverSelectionTimeoutMS=1000
        )
        # Verify connection
        await client.admin.command('ping')
        db_instance.client = client
        db_instance.db = client[settings.DB_NAME]
        logger.info(f"Successfully connected to MongoDB database: {settings.DB_NAME}")
        
        # Create indexes
        await _create_indexes()
    except Exception as e:
        db_instance.client = None
        db_instance.db = None
        logger.warning(f"Could not connect to MongoDB: {e}. Fallback to in-memory mode active.")

async def close_mongo_connection():
    """Closes MongoDB client pool gracefully on application shutdown."""
    if db_instance.client is not None:
        logger.info("Closing MongoDB connection...")
        db_instance.client.close()
        logger.info("MongoDB connection closed.")

async def _create_indexes():
    """Configures optimal query indexes for Users, Rooms, Files, and Messages."""
    try:
        db = db_instance.db
        if db is None:
            return
        
        # Users indexes
        await db.users.create_index("email", unique=True)
        await db.users.create_index("username", unique=True)
        
        # Rooms indexes
        await db.rooms.create_index("room_id", unique=True)
        await db.rooms.create_index("created_by")
        
        # Files indexes (compound index on room_id and path)
        await db.files.create_index([("room_id", 1), ("path", 1)], unique=True)
        await db.files.create_index("room_id")
        
        # Messages indexes (query messages by room ordered by timestamp)
        await db.messages.create_index([("room_id", 1), ("timestamp", -1)])
        
        logger.info("MongoDB collection indexes verified successfully.")
    except Exception as e:
        logger.warning(f"Index creation warning: {e}")
