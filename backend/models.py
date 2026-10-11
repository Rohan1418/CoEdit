from pydantic import BaseModel, Field, EmailStr
from typing import Optional, List, Dict, Any
from datetime import datetime

# --- User & Auth Models ---
class UserBase(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    email: EmailStr

class UserCreate(UserBase):
    password: str = Field(..., min_length=6)

class UserLogin(BaseModel):
    username_or_email: str
    password: str

class UserResponse(UserBase):
    id: str
    avatar_color: Optional[str] = "#3b82f6"
    created_at: datetime = Field(default_factory=datetime.utcnow)

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

class TokenPayload(BaseModel):
    sub: str  # user_id
    username: str
    email: str
    exp: int

# --- Room Models ---
class RoomCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    description: Optional[str] = ""
    is_private: bool = False
    password: Optional[str] = None

class ParticipantInfo(BaseModel):
    user_id: str
    username: str
    avatar_color: str
    is_audio_active: bool = False
    active_file_id: Optional[str] = None
    joined_at: datetime = Field(default_factory=datetime.utcnow)

class RoomResponse(BaseModel):
    room_id: str
    name: str
    description: Optional[str] = ""
    created_by: str
    created_at: datetime
    is_private: bool = False
    active_participants: List[ParticipantInfo] = []

# --- File Tree Models ---
class FileItemType(str):
    FILE = "file"
    FOLDER = "folder"

class FileItem(BaseModel):
    id: str
    room_id: str
    name: str
    path: str  # e.g. "/src/App.tsx"
    parent_path: str  # e.g. "/src"
    is_folder: bool = False
    content: Optional[str] = ""
    language: Optional[str] = "typescript"
    size: int = 0
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    updated_by: Optional[str] = None

class FileCreateRequest(BaseModel):
    name: str
    parent_path: str = "/"
    is_folder: bool = False
    content: Optional[str] = ""
    language: Optional[str] = "typescript"

class FileUpdateRequest(BaseModel):
    content: str
    version: Optional[int] = None

class FileRenameRequest(BaseModel):
    new_name: str

class FileDeleteRequest(BaseModel):
    file_id: str

# --- Chat Models ---
class ChatMessageCreate(BaseModel):
    room_id: str
    content: str = Field(..., min_length=1, max_length=2000)

class ChatMessage(BaseModel):
    id: str
    room_id: str
    sender_id: str
    sender_name: str
    sender_avatar_color: str = "#3b82f6"
    content: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)

# --- Real-Time Socket Payloads ---
class CodeChangeEvent(BaseModel):
    room_id: str
    file_id: str
    content: str
    delta: Optional[Dict[str, Any]] = None
    sender_id: str
    sender_name: str
    version: Optional[int] = None

class CursorPositionEvent(BaseModel):
    room_id: str
    file_id: str
    sender_id: str
    sender_name: str
    sender_avatar_color: str
    position: Dict[str, Any]  # { lineNumber: int, column: int }
    selection: Optional[Dict[str, Any]] = None

class WebRTCSignalEvent(BaseModel):
    room_id: str
    target_user_id: Optional[str] = None
    sender_id: str
    sender_name: Optional[str] = None
    type: str  # 'offer', 'answer', 'ice-candidate', 'join-voice', 'leave-voice', 'mute-status'
    payload: Any
