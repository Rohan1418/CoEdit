import logging
import uuid
from datetime import datetime
from typing import Dict, Any, List
import socketio

from backend.auth import authenticate_socket_token
from backend.database import db_instance

logger = logging.getLogger("socketio")

# Initialize ASGI-compatible asynchronous Socket.IO server
sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins="*",
    logger=False,
    engineio_logger=False
)

# In-memory tracking of active socket sessions and room participants
# sid -> { user_id, username, email, avatar_color, room_id, active_file_id, is_voice_active, is_muted }
socket_sessions: Dict[str, Dict[str, Any]] = {}

# room_id -> set of sids
room_participants: Dict[str, set] = {}

# user_id -> sid mapping for direct WebRTC signaling routing
user_to_sid: Dict[str, str] = {}


def get_room_user_list(room_id: str) -> List[Dict[str, Any]]:
    """Returns the list of active participants in a given room."""
    sids = room_participants.get(room_id, set())
    users = []
    seen_users = set()
    for sid in sids:
        session = socket_sessions.get(sid)
        if session and session["user_id"] not in seen_users:
            users.append({
                "user_id": session["user_id"],
                "username": session["username"],
                "avatar_color": session.get("avatar_color", "#3b82f6"),
                "is_voice_active": session.get("is_voice_active", False),
                "is_muted": session.get("is_muted", False),
                "active_file_id": session.get("active_file_id", None),
                "sid": sid
            })
            seen_users.add(session["user_id"])
    return users


@sio.event
async def connect(sid: str, environ: dict, auth: dict = None):
    """
    Socket.IO connection handler with token verification.
    Accepts JWT token via auth dict ({ 'token': '...' }) or query parameters.
    """
    token = None
    if auth and isinstance(auth, dict):
        token = auth.get("token")
    
    if not token and "QUERY_STRING" in environ:
        # Fallback to query string: token=...
        from urllib.parse import parse_qs
        params = parse_qs(environ["QUERY_STRING"])
        if "token" in params and len(params["token"]) > 0:
            token = params["token"][0]

    # Validate token or assign temporary guest session
    user_payload = authenticate_socket_token(token) if token else None
    
    if user_payload:
        user_id = user_payload.get("sub", str(uuid.uuid4()))
        username = user_payload.get("username", f"User_{user_id[:4]}")
        email = user_payload.get("email", "")
        avatar_color = user_payload.get("avatar_color", "#3b82f6")
    else:
        # Allow guest connection for testing or fallback
        guest_id = f"guest_{str(uuid.uuid4())[:6]}"
        user_id = auth.get("user_id") if (auth and isinstance(auth, dict) and auth.get("user_id")) else guest_id
        username = auth.get("username") if (auth and isinstance(auth, dict) and auth.get("username")) else f"Developer {guest_id[-4:]}"
        email = f"{user_id}@collab.local"
        avatar_color = auth.get("avatar_color") if (auth and isinstance(auth, dict) and auth.get("avatar_color")) else "#10b981"

    socket_sessions[sid] = {
        "sid": sid,
        "user_id": user_id,
        "username": username,
        "email": email,
        "avatar_color": avatar_color,
        "room_id": None,
        "active_file_id": None,
        "is_voice_active": False,
        "is_muted": False
    }
    user_to_sid[user_id] = sid
    logger.info(f"Socket connected: sid={sid}, user={username} ({user_id})")
    
    await sio.emit("connection_established", {
        "status": "connected",
        "sid": sid,
        "user": socket_sessions[sid]
    }, to=sid)


@sio.event
async def disconnect(sid: str):
    """Cleans up user presence, active rooms, and WebRTC states upon socket disconnect."""
    session = socket_sessions.pop(sid, None)
    if not session:
        return
    
    user_id = session.get("user_id")
    if user_id in user_to_sid and user_to_sid[user_id] == sid:
        del user_to_sid[user_id]
        
    room_id = session.get("room_id")
    if room_id and room_id in room_participants:
        room_participants[room_id].discard(sid)
        if len(room_participants[room_id]) == 0:
            del room_participants[room_id]
            
        # Broadcast presence departure to room
        await sio.emit("user_left", {
            "user_id": user_id,
            "username": session.get("username"),
            "sid": sid,
            "room_id": room_id,
            "active_participants": get_room_user_list(room_id)
        }, room=room_id)
        
        # If in voice channel, notify peers
        if session.get("is_voice_active"):
            await sio.emit("peer_left_voice", {
                "user_id": user_id,
                "sid": sid,
                "room_id": room_id
            }, room=room_id)

    logger.info(f"Socket disconnected: sid={sid}, user={session.get('username')}")


# --- Room Management Events ---
@sio.event
async def join_room(sid: str, data: dict):
    """
    Subscribes the client socket to a project room.
    Emits the current participant roster and notifies existing members.
    """
    room_id = data.get("room_id")
    if not room_id:
        return {"status": "error", "message": "room_id is required"}

    session = socket_sessions.get(sid)
    if not session:
        return {"status": "error", "message": "Session not found"}

    # Leave previous room if joined
    prev_room = session.get("room_id")
    if prev_room and prev_room != room_id:
        await sio.leave_room(sid, prev_room)
        if prev_room in room_participants:
            room_participants[prev_room].discard(sid)
            await sio.emit("user_left", {
                "user_id": session["user_id"],
                "username": session["username"],
                "sid": sid,
                "active_participants": get_room_user_list(prev_room)
            }, room=prev_room)

    # Join new room
    await sio.enter_room(sid, room_id)
    session["room_id"] = room_id
    
    if room_id not in room_participants:
        room_participants[room_id] = set()
    room_participants[room_id].add(sid)

    user_list = get_room_user_list(room_id)

    # Send room info and participant list to joiner
    await sio.emit("room_joined", {
        "room_id": room_id,
        "user": session,
        "participants": user_list
    }, to=sid)

    # Broadcast to other room members
    await sio.emit("user_joined", {
        "user_id": session["user_id"],
        "username": session["username"],
        "avatar_color": session.get("avatar_color", "#3b82f6"),
        "sid": sid,
        "participants": user_list
    }, room=room_id, skip_sid=sid)

    return {"status": "success", "room_id": room_id, "participants": user_list}


@sio.event
async def leave_room(sid: str, data: dict):
    """Unsubscribes the socket from the specified room."""
    room_id = data.get("room_id")
    session = socket_sessions.get(sid)
    if not session or not room_id:
        return

    await sio.leave_room(sid, room_id)
    if room_id in room_participants:
        room_participants[room_id].discard(sid)
        
    session["room_id"] = None
    
    await sio.emit("user_left", {
        "user_id": session["user_id"],
        "username": session["username"],
        "sid": sid,
        "participants": get_room_user_list(room_id)
    }, room=room_id)


# --- Collaborative Code Synchronization Events ---
@sio.event
async def code_change(sid: str, data: dict):
    """
    Receives code change event from Monaco Editor.
    Broadcasts the delta/content to all other participants in the room without echoing back to sender.
    Asynchronously persists updated document content in MongoDB.
    """
    session = socket_sessions.get(sid)
    if not session:
        return
        
    room_id = data.get("room_id") or session.get("room_id")
    file_id = data.get("file_id")
    content = data.get("content")
    delta = data.get("delta")
    version = data.get("version", 1)

    if not room_id or not file_id:
        return

    # Broadcast code change to all other peers in the room
    logger.info(f"Broadcasting code_update to room {room_id} (skip_sid={sid})")
    await sio.emit("code_update", {
        "room_id": room_id,
        "file_id": file_id,
        "content": content,
        "delta": delta,
        "version": version,
        "sender_id": session["user_id"],
        "sender_name": session["username"]
    }, room=room_id, skip_sid=sid)

    # Asynchronously update content in MongoDB Atlas
    if db_instance.db is not None and content is not None:
        try:
            await db_instance.db.files.update_one(
                {"room_id": room_id, "id": file_id},
                {"$set": {
                    "content": content,
                    "updated_at": datetime.utcnow(),
                    "updated_by": session["username"]
                }}
            )
        except Exception as e:
            logger.error(f"Error persisting file {file_id}: {e}")


@sio.event
async def cursor_move(sid: str, data: dict):
    """
    Broadcasts Monaco editor cursor position & text selection coordinates to room peers.
    """
    session = socket_sessions.get(sid)
    if not session:
        return
        
    room_id = data.get("room_id") or session.get("room_id")
    if not room_id:
        return

    await sio.emit("cursor_update", {
        "room_id": room_id,
        "file_id": data.get("file_id"),
        "sender_id": session["user_id"],
        "sender_name": session["username"],
        "sender_avatar_color": session.get("avatar_color", "#3b82f6"),
        "position": data.get("position"),
        "selection": data.get("selection")
    }, room=room_id, skip_sid=sid)


@sio.event
async def file_select(sid: str, data: dict):
    """Tracks which file a user currently has active in Monaco Editor."""
    session = socket_sessions.get(sid)
    if not session:
        return
        
    file_id = data.get("file_id")
    room_id = data.get("room_id") or session.get("room_id")
    session["active_file_id"] = file_id

    if room_id:
        await sio.emit("peer_file_selected", {
            "user_id": session["user_id"],
            "username": session["username"],
            "file_id": file_id
        }, room=room_id, skip_sid=sid)


@sio.event
async def file_tree_change(sid: str, data: dict):
    """
    Broadcasts file creation, renaming, or deletion events to all room members.
    """
    session = socket_sessions.get(sid)
    if not session:
        return
        
    room_id = data.get("room_id") or session.get("room_id")
    if not room_id:
        return

    await sio.emit("file_tree_updated", {
        "action": data.get("action"),  # 'create', 'rename', 'delete'
        "file": data.get("file"),
        "file_id": data.get("file_id"),
        "room_id": room_id,
        "sender_name": session["username"]
    }, room=room_id, skip_sid=sid)


# --- Persistent Text Chat Events ---
@sio.event
async def send_message(sid: str, data: dict):
    """
    Receives chat message, stores it persistently in MongoDB Atlas,
    and broadcasts to all participants in the room.
    """
    session = socket_sessions.get(sid)
    if not session:
        return {"status": "error", "message": "Unauthorized"}
        
    room_id = data.get("room_id") or session.get("room_id")
    content = (data.get("content") or "").strip()
    
    if not room_id or not content:
        return {"status": "error", "message": "Content cannot be empty"}

    msg_id = str(uuid.uuid4())
    timestamp = datetime.utcnow()
    
    message_payload = {
        "id": msg_id,
        "room_id": room_id,
        "sender_id": session["user_id"],
        "sender_name": session["username"],
        "sender_avatar_color": session.get("avatar_color", "#3b82f6"),
        "content": content,
        "timestamp": timestamp.isoformat()
    }

    # Broadcast to all members including sender immediately
    logger.info(f"Broadcasting new_message to room {room_id}")
    await sio.emit("new_message", message_payload, room=room_id)

    # Store in MongoDB asynchronously if database is connected
    if db_instance.db is not None:
        try:
            await db_instance.db.messages.insert_one({
                "id": msg_id,
                "room_id": room_id,
                "sender_id": session["user_id"],
                "sender_name": session["username"],
                "sender_avatar_color": session.get("avatar_color", "#3b82f6"),
                "content": content,
                "timestamp": timestamp
            })
        except Exception as e:
            logger.error(f"Error saving chat message to MongoDB: {e}")

    return {"status": "success", "message": message_payload}


# --- WebRTC Voice Module Signaling Events ---
@sio.event
async def voice_join(sid: str, data: dict):
    """Marks user as active in voice channel and broadcasts to peers to trigger peer connections."""
    session = socket_sessions.get(sid)
    if not session:
        return {"status": "error", "message": "Session not found"}
        
    room_id = data.get("room_id") or session.get("room_id")
    if room_id:
        session["room_id"] = room_id
        if room_id not in room_participants:
            room_participants[room_id] = set()
        room_participants[room_id].add(sid)

    session["is_voice_active"] = True
    session["is_muted"] = data.get("is_muted", False)
    logger.info(f"User joined voice: {session.get('username')} (sid={sid}) in room {room_id}")

    # Broadcast to room members that this user joined voice
    await sio.emit("peer_joined_voice", {
        "user_id": session["user_id"],
        "username": session["username"],
        "avatar_color": session.get("avatar_color", "#3b82f6"),
        "sid": sid,
        "is_muted": session["is_muted"],
        "room_id": room_id
    }, room=room_id, skip_sid=sid)

    # Return list of existing peers who are already in voice in this room
    existing_voice_peers = [
        {
            "user_id": socket_sessions[s]["user_id"],
            "username": socket_sessions[s]["username"],
            "sid": s,
            "is_muted": socket_sessions[s].get("is_muted", False)
        }
        for s in room_participants.get(room_id, set())
        if s != sid and socket_sessions.get(s, {}).get("is_voice_active")
    ]

    return {"status": "success", "existing_voice_peers": existing_voice_peers}


@sio.event
async def voice_leave(sid: str, data: dict):
    """Marks user as inactive in voice channel and notifies peers."""
    session = socket_sessions.get(sid)
    if not session:
        return
        
    room_id = data.get("room_id") or session.get("room_id")
    session["is_voice_active"] = False
    logger.info(f"User left voice: {session.get('username')} (sid={sid})")

    await sio.emit("peer_left_voice", {
        "user_id": session["user_id"],
        "sid": sid,
        "room_id": room_id
    }, room=room_id, skip_sid=sid)


@sio.event
async def voice_mute_toggle(sid: str, data: dict):
    """Broadcasts mute/unmute or active speaking state changes."""
    session = socket_sessions.get(sid)
    if not session:
        return
        
    room_id = data.get("room_id") or session.get("room_id")
    is_muted = data.get("is_muted", False)
    session["is_muted"] = is_muted

    await sio.emit("peer_voice_status", {
        "user_id": session["user_id"],
        "sid": sid,
        "is_muted": is_muted,
        "is_speaking": data.get("is_speaking", False)
    }, room=room_id, skip_sid=sid)


@sio.event
async def webrtc_offer(sid: str, data: dict):
    """
    Routes WebRTC SDP Offer from caller to target peer.
    """
    session = socket_sessions.get(sid)
    target_sid = data.get("target_sid")
    target_user_id = data.get("target_user_id")

    dest_sid = target_sid or user_to_sid.get(target_user_id)
    if dest_sid:
        logger.info(f"Routing webrtc_offer: {sid} -> {dest_sid}")
        await sio.emit("webrtc_offer", {
            "caller_sid": sid,
            "caller_user_id": session["user_id"] if session else data.get("sender_id"),
            "caller_name": session["username"] if session else "Peer",
            "offer": data.get("offer")
        }, to=dest_sid)
    else:
        logger.warning(f"webrtc_offer: Target peer not found ({target_sid or target_user_id})")


@sio.event
async def webrtc_answer(sid: str, data: dict):
    """
    Routes WebRTC SDP Answer from receiver back to caller.
    """
    session = socket_sessions.get(sid)
    target_sid = data.get("target_sid")
    target_user_id = data.get("target_user_id")

    dest_sid = target_sid or user_to_sid.get(target_user_id)
    if dest_sid:
        logger.info(f"Routing webrtc_answer: {sid} -> {dest_sid}")
        await sio.emit("webrtc_answer", {
            "responder_sid": sid,
            "responder_user_id": session["user_id"] if session else data.get("sender_id"),
            "answer": data.get("answer")
        }, to=dest_sid)
    else:
        logger.warning(f"webrtc_answer: Caller peer not found ({target_sid or target_user_id})")


@sio.event
async def webrtc_ice_candidate(sid: str, data: dict):
    """
    Transfers ICE candidate information between peers for NAT traversal.
    """
    session = socket_sessions.get(sid)
    target_sid = data.get("target_sid")
    target_user_id = data.get("target_user_id")

    dest_sid = target_sid or user_to_sid.get(target_user_id)
    if dest_sid:
        await sio.emit("webrtc_ice_candidate", {
            "sender_sid": sid,
            "sender_user_id": session["user_id"] if session else data.get("sender_id"),
            "candidate": data.get("candidate")
        }, to=dest_sid)
