from datetime import datetime, timedelta
from typing import Optional, Dict, Any
import jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from motor.motor_asyncio import AsyncIOMotorDatabase
from bson import ObjectId

from backend.config import settings
from backend.database import get_database
from backend.models import UserResponse

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.API_V1_STR}/auth/login")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifies a plain password against the stored bcrypt hash."""
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    """Computes a bcrypt hash for password storage."""
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Encodes JWT access token with expiration time using PyJWT."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": int(expire.timestamp())})
    encoded_jwt = jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    return encoded_jwt

def decode_token(token: str) -> Optional[Dict[str, Any]]:
    """Decodes and validates a JWT token; returns payload dict or None."""
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        return payload
    except (jwt.PyJWTError, Exception):
        return None

async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncIOMotorDatabase = Depends(get_database)
) -> UserResponse:
    """FastAPI dependency for authenticating REST requests via Bearer token."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    payload = decode_token(token)
    if payload is None:
        raise credentials_exception
    
    user_id: str = payload.get("sub")
    if user_id is None:
        raise credentials_exception
    
    if db is None:
        # Fallback for dev mode / memory mode
        return UserResponse(
            id=user_id,
            username=payload.get("username", "developer"),
            email=payload.get("email", "dev@example.com"),
            avatar_color=payload.get("avatar_color", "#3b82f6"),
            created_at=datetime.utcnow()
        )
    
    try:
        user_doc = await db.users.find_one({"_id": ObjectId(user_id)})
    except Exception:
        user_doc = await db.users.find_one({"id": user_id})
        
    if user_doc is None:
        raise credentials_exception
        
    return UserResponse(
        id=str(user_doc.get("_id", user_id)),
        username=user_doc["username"],
        email=user_doc["email"],
        avatar_color=user_doc.get("avatar_color", "#3b82f6"),
        created_at=user_doc.get("created_at", datetime.utcnow())
    )

def authenticate_socket_token(token: str) -> Optional[Dict[str, Any]]:
    """Validates JWT auth token provided in Socket.IO handshake auth or query."""
    if not token:
        return None
    # Strip Bearer prefix if present
    if token.startswith("Bearer "):
        token = token[7:]
    return decode_token(token)
