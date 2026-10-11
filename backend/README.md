# Real-Time Collaborative Code Editor - Python FastAPI Backend

High-performance real-time backend engine built with **FastAPI**, **python-socketio** (ASGI asynchronous WebSocket server), **Motor** (Async MongoDB Atlas driver), **PyJWT** (Authentication), and **WebRTC** peer-to-peer audio signaling.

---

## 🏗️ Architecture Overview

```
                        [ React + Monaco Editor Client ]
                             |                    |
             REST API Calls  |                    |  WebSocket & WebRTC Signaling
           (Auth, Rooms, DB) |                    |  (Code Sync, Chat, Voice, Pres.)
                             v                    v
              +----------------------------------------------+
              |           Python 3.11+ ASGI Engine            |
              |                                              |
              |   +------------------+   +---------------+   |
              |   |  FastAPI (REST)  |   | Python-SocketIO|   |
              |   +------------------+   +---------------+   |
              |             |                     |          |
              |             v                     v          |
              |         PyJWT Auth           WebRTC Signal   |
              |         Passlib/Bcrypt       Presence State  |
              +----------------------------------------------+
                                     |
                                     v (Motor Async Driver)
                         +------------------------+
                         |  MongoDB Atlas Cluster |
                         |   - users              |
                         |   - rooms              |
                         |   - files (tree/code)  |
                         |   - messages (chat)    |
                         +------------------------+
```

---

## 🚀 Key Modules

1. **Authentication (`auth.py`)**:
   - Secure password hashing with bcrypt.
   - JWT token issuance (`jwt.encode`) and validation (`jwt.decode`) using PyJWT.
   - Dependency injection for protected REST routes and WebSocket connection handshake validation.

2. **Database Engine (`database.py`)**:
   - Non-blocking asynchronous MongoDB Atlas connection using `motor.motor_asyncio`.
   - Automated compound index setup for lightning-fast queries (`(room_id, path)` unique index for files, `(room_id, timestamp)` for chat).

3. **Socket.IO Real-Time Engine (`socket_events.py`)**:
   - **Operational Code Synchronization**: Non-echoing broadcast of editor changes to room members, with asynchronous persistence.
   - **Presence & Cursors**: Live remote cursor coordinate tracking, active file selection, and online participant rosters.
   - **Persistent Chat**: Room-scoped text messages stored in MongoDB and broadcast to all room peers.
   - **WebRTC Voice Signaling**: Direct P2P audio connection negotiation (`webrtc_offer`, `webrtc_answer`, `webrtc_ice_candidate`).

4. **REST API & ASGI Mount (`main.py`)**:
   - Full REST suite for user registration, login, room creation, file hierarchy CRUD, and chat history.
   - Combined ASGI app serving both REST and Socket.IO on a single unified port.

---

## 🛠️ Step-by-Step Setup & Execution

### 1. Prerequisites
- Python 3.10 or 3.11+
- A free MongoDB Atlas account (or local MongoDB instance)

### 2. Create Virtual Environment & Install Dependencies
```bash
# Navigate to backend directory
cd backend

# Create virtual environment
python3 -m venv venv

# Activate virtual environment
# On macOS/Linux:
source venv/bin/activate
# On Windows:
# venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

### 3. Environment Configuration
Create a `.env` file in `/backend`:
```env
MONGO_URI=mongodb+srv://<username>:<password>@cluster0.mongodb.net/?retryWrites=true&w=majority
DB_NAME=collab_editor
JWT_SECRET_KEY=your-32-character-random-secret-key-here
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=1440
HOST=0.0.0.0
PORT=8000
```

### 4. Run the Server
Launch the ASGI application using `uvicorn`:
```bash
uvicorn backend.main:socket_app --host 0.0.0.0 --port 8000 --reload
```

- **Interactive API Documentation (Swagger)**: `http://localhost:8000/docs`
- **Alternative ReDoc**: `http://localhost:8000/redoc`
- **Health Check**: `http://localhost:8000/api/health`
- **WebSocket Endpoint**: `ws://localhost:8000/socket.io/`
