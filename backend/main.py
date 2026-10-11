import logging
import os
import uuid
from datetime import datetime
from typing import List, Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
import socketio

from backend.config import settings
from backend.database import connect_to_mongo, close_mongo_connection, db_instance, get_database
from backend.models import (
    UserCreate, UserLogin, UserResponse, TokenResponse,
    RoomCreate, RoomResponse,
    FileItem, FileCreateRequest, FileUpdateRequest, FileRenameRequest,
    ChatMessage
)
from backend.auth import (
    verify_password, get_password_hash, create_access_token,
    get_current_user
)
from backend.socket_events import sio

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("api")

dist_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "dist"))

# Lifespan event for FastAPI
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing application services...")
    await connect_to_mongo()
    yield
    logger.info("Shutting down application services...")
    await close_mongo_connection()

# FastAPI application instance
app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    lifespan=lifespan
)

# CORS Middleware setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def add_cache_control_header(request, call_next):
    response = await call_next(request)
    if request.url.path == "/" or request.url.path.endswith(".html"):
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    return response

# --- REST Endpoints: Root & Health Check ---
if not os.path.exists(dist_dir):
    @app.get("/")
    async def root():
        return {
            "status": "online",
            "service": settings.PROJECT_NAME,
            "message": "Python backend is running! Open the frontend at http://localhost:3000 to use the code editor.",
            "api_docs": "/docs",
            "health": "/health"
        }

@app.get("/health")
@app.get(f"{settings.API_V1_STR}/health")
async def health_check():
    db_status = "connected" if db_instance.client is not None else "disconnected (check MONGO_URI)"
    return {
        "status": "online",
        "service": settings.PROJECT_NAME,
        "database": db_status,
        "timestamp": datetime.utcnow()
    }


# --- REST Endpoints: Authentication ---
@app.post(f"{settings.API_V1_STR}/auth/signup", response_model=TokenResponse)
async def signup(user_data: UserCreate, db=Depends(get_database)):
    """Registers a new user account with hashed password and returns JWT token."""
    avatar_colors = ["#3b82f6", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6", "#06b6d4", "#f97316"]
    assigned_color = avatar_colors[hash(user_data.username) % len(avatar_colors)]
    user_id = str(uuid.uuid4())
    
    if db is not None:
        # Check existing username/email
        existing_user = await db.users.find_one({
            "$or": [{"email": user_data.email}, {"username": user_data.username}]
        })
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User with this email or username already exists."
            )
        
        user_doc = {
            "id": user_id,
            "username": user_data.username,
            "email": user_data.email,
            "hashed_password": get_password_hash(user_data.password),
            "avatar_color": assigned_color,
            "created_at": datetime.utcnow()
        }
        await db.users.insert_one(user_doc)

    user_resp = UserResponse(
        id=user_id,
        username=user_data.username,
        email=user_data.email,
        avatar_color=assigned_color,
        created_at=datetime.utcnow()
    )
    access_token = create_access_token(data={
        "sub": user_id,
        "username": user_data.username,
        "email": user_data.email,
        "avatar_color": assigned_color
    })
    return TokenResponse(access_token=access_token, user=user_resp)


@app.post(f"{settings.API_V1_STR}/auth/login", response_model=TokenResponse)
async def login(credentials: UserLogin, db=Depends(get_database)):
    """Validates user credentials and issues a signed JWT token."""
    if db is None:
        # Development fallback login
        user_id = f"user_{str(uuid.uuid4())[:6]}"
        user_resp = UserResponse(
            id=user_id,
            username=credentials.username_or_email,
            email=f"{credentials.username_or_email}@collab.local",
            avatar_color="#3b82f6",
            created_at=datetime.utcnow()
        )
        token = create_access_token(data={"sub": user_id, "username": user_resp.username, "email": user_resp.email})
        return TokenResponse(access_token=token, user=user_resp)

    user = await db.users.find_one({
        "$or": [
            {"username": credentials.username_or_email},
            {"email": credentials.username_or_email}
        ]
    })
    
    if not user or not verify_password(credentials.password, user.get("hashed_password", "")):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username/email or password.",
            headers={"WWW-Authenticate": "Bearer"}
        )

    user_resp = UserResponse(
        id=str(user.get("id", user.get("_id"))),
        username=user["username"],
        email=user["email"],
        avatar_color=user.get("avatar_color", "#3b82f6"),
        created_at=user.get("created_at", datetime.utcnow())
    )
    token = create_access_token(data={
        "sub": user_resp.id,
        "username": user_resp.username,
        "email": user_resp.email,
        "avatar_color": user_resp.avatar_color
    })
    return TokenResponse(access_token=token, user=user_resp)


@app.get(f"{settings.API_V1_STR}/auth/me", response_model=UserResponse)
async def get_me(current_user: UserResponse = Depends(get_current_user)):
    """Returns currently authenticated user profile."""
    return current_user


# --- REST Endpoints: Room Management ---
@app.post(f"{settings.API_V1_STR}/rooms", response_model=RoomResponse)
async def create_room(
    room_data: RoomCreate,
    current_user: UserResponse = Depends(get_current_user),
    db=Depends(get_database)
):
    """Creates a new collaboration project room with initial project scaffold."""
    room_id = f"room_{str(uuid.uuid4())[:8]}"
    created_at = datetime.utcnow()
    
    room_doc = {
        "room_id": room_id,
        "name": room_data.name,
        "description": room_data.description or "",
        "created_by": current_user.username,
        "created_at": created_at,
        "is_private": room_data.is_private,
        "password": get_password_hash(room_data.password) if room_data.password else None
    }
    
    if db is not None:
        await db.rooms.insert_one(room_doc)
        
        # Seed default starter files for the new room
        default_files = [
            {
                "id": str(uuid.uuid4()),
                "room_id": room_id,
                "name": "src",
                "path": "/src",
                "parent_path": "/",
                "is_folder": True,
                "content": "",
                "language": None,
                "size": 0,
                "updated_at": created_at,
                "updated_by": current_user.username
            },
            {
                "id": str(uuid.uuid4()),
                "room_id": room_id,
                "name": "index.ts",
                "path": "/src/index.ts",
                "parent_path": "/src",
                "is_folder": False,
                "content": "// Real-time Collaborative Session\nconsole.log('Welcome to Room " + room_data.name + "');\n\nexport function calculate(a: number, b: number): number {\n  return a + b;\n}\n",
                "language": "typescript",
                "size": 140,
                "updated_at": created_at,
                "updated_by": current_user.username
            },
            {
                "id": str(uuid.uuid4()),
                "room_id": room_id,
                "name": "README.md",
                "path": "/README.md",
                "parent_path": "/",
                "is_folder": False,
                "content": f"# {room_data.name}\n\n{room_data.description or 'Collaborative project workspace.'}\n\n- Created by: @{current_user.username}\n- Features: Real-time Monaco editor, WebSockets sync, WebRTC Voice\n",
                "language": "markdown",
                "size": 180,
                "updated_at": created_at,
                "updated_by": current_user.username
            }
        ]
        await db.files.insert_many(default_files)

    return RoomResponse(
        room_id=room_id,
        name=room_data.name,
        description=room_data.description,
        created_by=current_user.username,
        created_at=created_at,
        is_private=room_data.is_private,
        active_participants=[]
    )


@app.get(f"{settings.API_V1_STR}/rooms", response_model=List[RoomResponse])
async def list_rooms(
    current_user: UserResponse = Depends(get_current_user),
    db=Depends(get_database)
):
    """Lists rooms created by or accessible to user."""
    if db is None:
        return [
            RoomResponse(
                room_id="room_demo",
                name="Main Collaboration Hall",
                description="Default room for instant collaborative pairing",
                created_by="system",
                created_at=datetime.utcnow(),
                is_private=False,
                active_participants=[]
            )
        ]
    cursor = db.rooms.find().sort("created_at", -1).limit(25)
    rooms = []
    async for doc in cursor:
        rooms.append(RoomResponse(
            room_id=doc["room_id"],
            name=doc["name"],
            description=doc.get("description", ""),
            created_by=doc["created_by"],
            created_at=doc["created_at"],
            is_private=doc.get("is_private", False),
            active_participants=[]
        ))
    return rooms


@app.get(f"{settings.API_V1_STR}/rooms/{{room_id}}", response_model=RoomResponse)
async def get_room(room_id: str, db=Depends(get_database)):
    """Fetches room metadata by room_id."""
    if db is None:
        return RoomResponse(
            room_id=room_id,
            name="Room " + room_id,
            description="Active collaboration room",
            created_by="developer",
            created_at=datetime.utcnow(),
            is_private=False,
            active_participants=[]
        )
    room = await db.rooms.find_one({"room_id": room_id})
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    return RoomResponse(
        room_id=room["room_id"],
        name=room["name"],
        description=room.get("description", ""),
        created_by=room["created_by"],
        created_at=room["created_at"],
        is_private=room.get("is_private", False),
        active_participants=[]
    )


# --- REST Endpoints: File Tree Management ---
@app.get(f"{settings.API_V1_STR}/rooms/{{room_id}}/files", response_model=List[FileItem])
async def get_room_files(room_id: str, db=Depends(get_database)):
    """Retrieves file tree items belonging to the project room."""
    if db is None:
        # In-memory default file structure
        now = datetime.utcnow()
        return [
            FileItem(id="f1", room_id=room_id, name="src", path="/src", parent_path="/", is_folder=True, updated_at=now),
            FileItem(id="f2", room_id=room_id, name="main.ts", path="/src/main.ts", parent_path="/src", is_folder=False, content="// TypeScript Entry\nfunction main() {\n  console.log('Collaborative editor initialized!');\n}\nmain();", language="typescript", updated_at=now),
            FileItem(id="f3", room_id=room_id, name="server.py", path="/src/server.py", parent_path="/src", is_folder=False, content="# Python Microservice\nfrom fastapi import FastAPI\napp = FastAPI()\n\n@app.get('/')\ndef home():\n    return {'hello': 'collaborative world'}\n", language="python", updated_at=now),
            FileItem(id="f4", room_id=room_id, name="README.md", path="/README.md", parent_path="/", is_folder=False, content="# Collaborative Project\n\nReal-time code editing with Monaco & WebRTC voice.", language="markdown", updated_at=now)
        ]
    
    files = []
    cursor = db.files.find({"room_id": room_id}).sort("path", 1)
    async for f in cursor:
        files.append(FileItem(
            id=f["id"],
            room_id=f["room_id"],
            name=f["name"],
            path=f["path"],
            parent_path=f["parent_path"],
            is_folder=f.get("is_folder", False),
            content=f.get("content", ""),
            language=f.get("language", "typescript"),
            size=f.get("size", len(f.get("content", ""))),
            updated_at=f.get("updated_at", datetime.utcnow()),
            updated_by=f.get("updated_by")
        ))
    return files


@app.post(f"{settings.API_V1_STR}/rooms/{{room_id}}/files", response_model=FileItem)
async def create_file(
    room_id: str,
    file_data: FileCreateRequest,
    current_user: UserResponse = Depends(get_current_user),
    db=Depends(get_database)
):
    """Creates a new file or directory inside the room file tree."""
    clean_parent = file_data.parent_path.rstrip("/")
    path = f"{clean_parent}/{file_data.name}" if clean_parent else f"/{file_data.name}"
    file_id = str(uuid.uuid4())
    now = datetime.utcnow()
    
    file_doc = {
        "id": file_id,
        "room_id": room_id,
        "name": file_data.name,
        "path": path,
        "parent_path": file_data.parent_path,
        "is_folder": file_data.is_folder,
        "content": file_data.content if not file_data.is_folder else "",
        "language": file_data.language if not file_data.is_folder else None,
        "size": len(file_data.content or "") if not file_data.is_folder else 0,
        "updated_at": now,
        "updated_by": current_user.username
    }
    
    if db is not None:
        # Check duplicate
        exists = await db.files.find_one({"room_id": room_id, "path": path})
        if exists:
            raise HTTPException(status_code=400, detail="File or folder already exists at this path")
        await db.files.insert_one(file_doc)
        
    # Broadcast to room via socketio
    await sio.emit("file_tree_updated", {
        "action": "create",
        "file": file_doc,
        "room_id": room_id,
        "sender_name": current_user.username
    }, room=room_id)

    return FileItem(**file_doc)


@app.put(f"{settings.API_V1_STR}/rooms/{{room_id}}/files/{{file_id}}")
async def update_file_content(
    room_id: str,
    file_id: str,
    data: FileUpdateRequest,
    current_user: UserResponse = Depends(get_current_user),
    db=Depends(get_database)
):
    """Saves updated text buffer content for a file."""
    now = datetime.utcnow()
    if db is not None:
        result = await db.files.update_one(
            {"room_id": room_id, "id": file_id},
            {"$set": {
                "content": data.content,
                "size": len(data.content),
                "updated_at": now,
                "updated_by": current_user.username
            }}
        )
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="File not found")
            
    return {"status": "success", "file_id": file_id, "updated_at": now}


@app.patch(f"{settings.API_V1_STR}/rooms/{{room_id}}/files/{{file_id}}/rename")
async def rename_file(
    room_id: str,
    file_id: str,
    data: FileRenameRequest,
    current_user: UserResponse = Depends(get_current_user),
    db=Depends(get_database)
):
    """Renames a file or folder and updates descendant paths."""
    if db is not None:
        target = await db.files.find_one({"room_id": room_id, "id": file_id})
        if not target:
            raise HTTPException(status_code=404, detail="File not found")
        
        old_path = target["path"]
        parent_path = target["parent_path"]
        clean_parent = parent_path.rstrip("/")
        new_path = f"{clean_parent}/{data.new_name}" if clean_parent else f"/{data.new_name}"
        
        await db.files.update_one(
            {"room_id": room_id, "id": file_id},
            {"$set": {"name": data.new_name, "path": new_path, "updated_at": datetime.utcnow()}}
        )
        
        # If folder, update children paths
        if target.get("is_folder"):
            children_cursor = db.files.find({"room_id": room_id, "path": {"$regex": f"^{old_path}/"}})
            async for child in children_cursor:
                child_new_path = child["path"].replace(old_path, new_path, 1)
                child_new_parent = child["parent_path"].replace(old_path, new_path, 1)
                await db.files.update_one(
                    {"_id": child["_id"]},
                    {"$set": {"path": child_new_path, "parent_path": child_new_parent}}
                )

    await sio.emit("file_tree_updated", {
        "action": "rename",
        "file_id": file_id,
        "new_name": data.new_name,
        "room_id": room_id,
        "sender_name": current_user.username
    }, room=room_id)

    return {"status": "success", "file_id": file_id, "new_name": data.new_name}


@app.delete(f"{settings.API_V1_STR}/rooms/{{room_id}}/files/{{file_id}}")
async def delete_file(
    room_id: str,
    file_id: str,
    current_user: UserResponse = Depends(get_current_user),
    db=Depends(get_database)
):
    """Deletes a file or directory (and recursive child contents)."""
    if db is not None:
        target = await db.files.find_one({"room_id": room_id, "id": file_id})
        if target:
            if target.get("is_folder"):
                await db.files.delete_many({
                    "room_id": room_id,
                    "$or": [
                        {"id": file_id},
                        {"path": {"$regex": f"^{target['path']}/"}}
                    ]
                })
            else:
                await db.files.delete_one({"room_id": room_id, "id": file_id})

    await sio.emit("file_tree_updated", {
        "action": "delete",
        "file_id": file_id,
        "room_id": room_id,
        "sender_name": current_user.username
    }, room=room_id)

    return {"status": "success", "file_id": file_id}


# --- REST Endpoints: Chat History ---
@app.get(f"{settings.API_V1_STR}/rooms/{{room_id}}/messages", response_model=List[ChatMessage])
async def get_messages(room_id: str, limit: int = 50, db=Depends(get_database)):
    """Retrieves chronological chat message history for a room."""
    if db is None:
        return [
            ChatMessage(
                id="msg_welcome",
                room_id=room_id,
                sender_id="sys",
                sender_name="System Bot",
                sender_avatar_color="#6366f1",
                content="Welcome to the room chat! Messages are persisted in MongoDB Atlas.",
                timestamp=datetime.utcnow()
            )
        ]
    cursor = db.messages.find({"room_id": room_id}).sort("timestamp", 1).limit(limit)
    messages = []
    async for m in cursor:
        messages.append(ChatMessage(
            id=m["id"],
            room_id=m["room_id"],
            sender_id=m["sender_id"],
            sender_name=m["sender_name"],
            sender_avatar_color=m.get("sender_avatar_color", "#3b82f6"),
            content=m["content"],
            timestamp=m["timestamp"]
        ))
    return messages


# --- Mount Frontend Static Files if built (allows 1-click single-service deployment) ---
dist_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "dist"))
if os.path.exists(dist_dir):
    from fastapi.staticfiles import StaticFiles
    app.mount("/", StaticFiles(directory=dist_dir, html=True), name="static")

# --- Wrap FastAPI with Socket.IO ASGI App ---
# This is the primary ASGI application callable for uvicorn:
# uvicorn backend.main:socket_app --host 0.0.0.0 --port 8000
socket_app = socketio.ASGIApp(
    socketio_server=sio,
    other_asgi_app=app,
    socketio_path="socket.io"
)
