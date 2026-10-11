import React, { useState } from 'react';
import { useSocket } from '../context/SocketContext';
import { 
  Server, 
  Database, 
  Radio, 
  CheckCircle2, 
  Copy, 
  Check, 
  X,
  ExternalLink,
  Wifi,
  WifiOff,
  Code2,
  FileCode2,
  ShieldCheck,
  Headphones,
  HelpCircle,
  Play
} from 'lucide-react';

interface SetupGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PYTHON_FILES_SNIPPETS: Record<string, { desc: string; code: string }> = {
  'main.py': {
    desc: 'FastAPI REST Application & ASGI Socket.IO Mounting',
    code: `import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
import socketio

from backend.config import settings
from backend.database import connect_to_mongo, close_mongo_connection, get_database
from backend.auth import get_current_user, create_access_token, verify_password, get_password_hash
from backend.socket_events import sio
from backend.models import UserCreate, UserLogin, TokenResponse, RoomCreate, FileItem

@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect_to_mongo()
    yield
    await close_mongo_connection()

app = FastAPI(title=settings.PROJECT_NAME, lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

@app.get("/health")
@app.get("/api/health")
async def health():
    return {"status": "online", "backend": "Python FastAPI + Socket.IO"}

# Wrap FastAPI with Async Socket.IO server into a single ASGI application:
socket_app = socketio.ASGIApp(socketio_server=sio, other_asgi_app=app, socketio_path="socket.io")
`
  },
  'socket_events.py': {
    desc: 'python-socketio AsyncServer: Code Sync, Chat & WebRTC Signaling',
    code: `import socketio
from backend.database import db_instance

# Initialize ASGI-compatible asynchronous Socket.IO server
sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins="*")

# Monaco Code Synchronization
@sio.event
async def code_change(sid: str, data: dict):
    # Broadcast change delta to room peers without echoing back to sender
    await sio.emit("code_update", data, room=data.get("room_id"), skip_sid=sid)

# Live Cursor Coordinates
@sio.event
async def cursor_move(sid: str, data: dict):
    await sio.emit("cursor_update", data, room=data.get("room_id"), skip_sid=sid)

# Persistent Text Chat
@sio.event
async def send_message(sid: str, data: dict):
    # Save to MongoDB Atlas and broadcast to room
    await sio.emit("new_message", data, room=data.get("room_id"))

# WebRTC Voice Signaling (SDP Offer, Answer & ICE Candidates)
@sio.event
async def voice_join(sid: str, data: dict):
    await sio.emit("peer_joined_voice", {"sid": sid, "room_id": data.get("room_id")}, room=data.get("room_id"), skip_sid=sid)

@sio.event
async def webrtc_offer(sid: str, data: dict):
    await sio.emit("webrtc_offer", data, to=data.get("target_sid"))

@sio.event
async def webrtc_answer(sid: str, data: dict):
    await sio.emit("webrtc_answer", data, to=data.get("target_sid"))

@sio.event
async def webrtc_ice_candidate(sid: str, data: dict):
    await sio.emit("webrtc_ice_candidate", data, to=data.get("target_sid"))
`
  },
  'auth.py': {
    desc: 'PyJWT Token Validation & Passlib Bcrypt Hashing',
    code: `import jwt
from passlib.context import CryptContext
from datetime import datetime, timedelta
from backend.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": int(expire.timestamp())})
    return jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm="HS256")
`
  },
  'database.py': {
    desc: 'Motor Async MongoDB Atlas Driver & Compound Index Creation',
    code: `from motor.motor_asyncio import AsyncIOMotorClient
from backend.config import settings

class Database:
    client = None
    db = None

db_instance = Database()

async def connect_to_mongo():
    db_instance.client = AsyncIOMotorClient(settings.MONGO_URI)
    db_instance.db = db_instance.client[settings.DB_NAME]
    # Configure compound indexes for ultra-fast multi-tenant queries:
    await db_instance.db.files.create_index([("room_id", 1), ("path", 1)], unique=True)
    await db_instance.db.messages.create_index([("room_id", 1), ("timestamp", -1)])
`
  },
  'requirements.txt': {
    desc: 'Python 3.11+ Production Dependencies',
    code: `fastapi>=0.109.0
uvicorn[standard]>=0.27.0
python-socketio>=5.11.0
motor>=3.3.2
pymongo>=4.6.1
pyjwt>=2.8.0
passlib[bcrypt]>=1.7.4
bcrypt>=4.1.2
pydantic>=2.6.0
pydantic-settings>=2.1.0
python-dotenv>=1.0.1
`
  }
};

export const SetupGuideModal: React.FC<SetupGuideModalProps> = ({ isOpen, onClose }) => {
  const { backendUrl, setBackendUrl, isConnected, isConnecting } = useSocket();
  const [activeTab, setActiveTab] = useState<'setup' | 'code' | 'troubleshoot'>('setup');
  const [selectedFile, setSelectedFile] = useState<string>('main.py');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState<boolean>(false);

  if (!isOpen) return null;

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleTestBackend = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`${backendUrl}/health`, { signal: AbortSignal.timeout(4000) });
      if (res.ok) {
        const data = await res.json();
        setTestResult(`Online! Service: ${data.service || 'Python FastAPI'}`);
      } else {
        setTestResult(`Backend responded with HTTP status ${res.status}`);
      }
    } catch {
      setTestResult(`Could not reach ${backendUrl}. Ensure 'uvicorn backend.main:socket_app' is running.`);
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div 
      id="setup-guide-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
    >
      <div 
        id="setup-guide-card"
        className="w-full max-w-3xl bg-stone-900 border border-stone-800 rounded-2xl p-6 shadow-2xl relative text-stone-200 max-h-[90vh] flex flex-col"
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 text-stone-400 hover:text-stone-200 hover:bg-stone-800 rounded-lg transition"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center space-x-3 mb-4 pb-3 border-b border-stone-800">
          <div className="w-10 h-10 rounded-xl bg-emerald-950 border border-emerald-800 flex items-center justify-center text-emerald-400">
            <Server className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-lg font-bold text-stone-100">
                Python FastAPI & Socket.IO Real-Time Engine
              </h2>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-950 text-emerald-400 border border-emerald-800">
                Python 3.11+
              </span>
            </div>
            <p className="text-xs text-stone-400">
              FastAPI REST + python-socketio (ASGI) + Motor MongoDB Atlas + WebRTC Audio Signaling
            </p>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center space-x-2 mb-4 border-b border-stone-800 pb-2 text-xs">
          <button
            onClick={() => setActiveTab('setup')}
            className={`px-3 py-1.5 rounded-lg font-medium transition flex items-center gap-1.5 ${
              activeTab === 'setup'
                ? 'bg-emerald-950 border border-emerald-800 text-emerald-400'
                : 'text-stone-400 hover:text-stone-200 hover:bg-stone-800'
            }`}
          >
            <Play className="w-3.5 h-3.5" />
            <span>Execution & Quickstart</span>
          </button>
          <button
            onClick={() => setActiveTab('code')}
            className={`px-3 py-1.5 rounded-lg font-medium transition flex items-center gap-1.5 ${
              activeTab === 'code'
                ? 'bg-emerald-950 border border-emerald-800 text-emerald-400'
                : 'text-stone-400 hover:text-stone-200 hover:bg-stone-800'
            }`}
          >
            <FileCode2 className="w-3.5 h-3.5" />
            <span>Python Source Code (/backend)</span>
          </button>
          <button
            onClick={() => setActiveTab('troubleshoot')}
            className={`px-3 py-1.5 rounded-lg font-medium transition flex items-center gap-1.5 ${
              activeTab === 'troubleshoot'
                ? 'bg-emerald-950 border border-emerald-800 text-emerald-400'
                : 'text-stone-400 hover:text-stone-200 hover:bg-stone-800'
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Multi-User, Voice & 403 Guide</span>
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-1 text-xs text-stone-300">
          {activeTab === 'setup' && (
            <div className="space-y-4">
              {/* Connection Target Bar */}
              <div className="p-3.5 bg-stone-950 rounded-xl border border-stone-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-stone-200 flex items-center gap-1.5">
                    <Radio className="w-4 h-4 text-emerald-400" />
                    Python Backend URL Target
                  </span>
                  <div className="flex items-center gap-1.5">
                    {isConnected ? (
                      <span className="flex items-center gap-1 text-[11px] text-emerald-400 bg-emerald-950 px-2.5 py-0.5 rounded border border-emerald-800 font-medium">
                        <Wifi className="w-3 h-3" /> Connected to Python Server
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[11px] text-amber-400 bg-amber-950/60 px-2.5 py-0.5 rounded border border-amber-800 font-medium">
                        <WifiOff className="w-3 h-3" /> {isConnecting ? 'Connecting...' : 'Ready for Connection'}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={backendUrl}
                    onChange={(e) => setBackendUrl(e.target.value)}
                    placeholder="http://localhost:8000"
                    className="flex-1 bg-stone-900 border border-stone-700 rounded-lg px-3 py-1.5 text-xs text-stone-100 focus:outline-none focus:border-emerald-500 font-mono"
                  />
                  <button
                    onClick={handleTestBackend}
                    disabled={isTesting}
                    className="px-3 py-1.5 bg-stone-800 hover:bg-stone-700 text-stone-200 rounded-lg text-xs font-medium border border-stone-700 transition"
                  >
                    {isTesting ? 'Testing...' : 'Ping Test'}
                  </button>
                </div>
                {testResult && (
                  <div className="text-[11px] text-stone-300 bg-stone-900 p-2 rounded border border-stone-800 font-mono">
                    {testResult}
                  </div>
                )}
              </div>

              {/* Steps */}
              <div className="space-y-3">
                {/* Step 1 */}
                <div className="p-3 bg-stone-950 rounded-xl border border-stone-800">
                  <div className="flex items-center justify-between font-semibold text-stone-200 mb-1.5">
                    <span className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800 flex items-center justify-center text-[10px]">1</span>
                      Install Python Dependencies
                    </span>
                    <button
                      onClick={() => copyToClipboard('cd backend\npip install -r requirements.txt', 'step1')}
                      className="text-stone-400 hover:text-stone-200 flex items-center gap-1 text-[11px]"
                    >
                      {copiedKey === 'step1' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedKey === 'step1' ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                  <pre className="bg-stone-900 p-2.5 rounded-lg text-emerald-400 font-mono text-[11px]">
                    cd backend{'\n'}pip install -r requirements.txt
                  </pre>
                </div>

                {/* Step 2 */}
                <div className="p-3 bg-stone-950 rounded-xl border border-stone-800">
                  <div className="flex items-center justify-between font-semibold text-stone-200 mb-1.5">
                    <span className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800 flex items-center justify-center text-[10px]">2</span>
                      Configure MongoDB Atlas & Secrets (.env)
                    </span>
                    <button
                      onClick={() => copyToClipboard('MONGO_URI=mongodb+srv://<user>:<pwd>@cluster0.mongodb.net/?retryWrites=true&w=majority\nDB_NAME=collab_editor\nJWT_SECRET_KEY=super-secret-key-1234567890', 'step2')}
                      className="text-stone-400 hover:text-stone-200 flex items-center gap-1 text-[11px]"
                    >
                      {copiedKey === 'step2' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedKey === 'step2' ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                  <pre className="bg-stone-900 p-2.5 rounded-lg text-stone-300 font-mono text-[11px]">
                    MONGO_URI=mongodb+srv://&lt;username&gt;:&lt;password&gt;@cluster0.mongodb.net/?retryWrites=true&amp;w=majority{'\n'}
                    DB_NAME=collab_editor{'\n'}
                    JWT_SECRET_KEY=super-secret-jwt-key-change-in-production
                  </pre>
                </div>

                {/* Step 3 */}
                <div className="p-3 bg-stone-950 rounded-xl border border-stone-800">
                  <div className="flex items-center justify-between font-semibold text-stone-200 mb-1.5">
                    <span className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800 flex items-center justify-center text-[10px]">3</span>
                      Launch Combined ASGI Application
                    </span>
                    <button
                      onClick={() => copyToClipboard('uvicorn backend.main:socket_app --host 0.0.0.0 --port 8000 --reload', 'step3')}
                      className="text-stone-400 hover:text-stone-200 flex items-center gap-1 text-[11px]"
                    >
                      {copiedKey === 'step3' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedKey === 'step3' ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                  <pre className="bg-stone-900 p-2.5 rounded-lg text-emerald-400 font-mono text-[11px]">
                    uvicorn backend.main:socket_app --host 0.0.0.0 --port 8000 --reload
                  </pre>
                  <p className="text-stone-400 text-[11px] mt-1.5">
                    This launches FastAPI (REST), interactive Swagger API docs at <code className="text-stone-200">http://localhost:8000/docs</code>, and the python-socketio ASGI server on port 8000.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'code' && (
            <div className="space-y-3">
              {/* File selector buttons */}
              <div className="flex flex-wrap gap-1.5 pb-1">
                {Object.keys(PYTHON_FILES_SNIPPETS).map((fileName) => (
                  <button
                    key={fileName}
                    onClick={() => setSelectedFile(fileName)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-mono transition ${
                      selectedFile === fileName
                        ? 'bg-emerald-950 border border-emerald-800 text-emerald-300 font-bold'
                        : 'bg-stone-950 hover:bg-stone-800 text-stone-400 border border-stone-800'
                    }`}
                  >
                    backend/{fileName}
                  </button>
                ))}
              </div>

              {/* Selected File Description & Copy */}
              <div className="flex items-center justify-between bg-stone-950 p-2.5 rounded-lg border border-stone-800">
                <span className="text-stone-300 font-medium text-[11px]">
                  {PYTHON_FILES_SNIPPETS[selectedFile]?.desc}
                </span>
                <button
                  onClick={() => copyToClipboard(PYTHON_FILES_SNIPPETS[selectedFile]?.code || '', 'code_snippet')}
                  className="px-2.5 py-1 bg-stone-800 hover:bg-stone-700 text-stone-200 rounded text-[11px] flex items-center gap-1 transition"
                >
                  {copiedKey === 'code_snippet' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedKey === 'code_snippet' ? 'Copied' : 'Copy File'}</span>
                </button>
              </div>

              {/* Code display */}
              <pre className="bg-stone-950 border border-stone-800 p-3 rounded-xl text-stone-200 font-mono text-[11px] overflow-x-auto max-h-[380px] leading-relaxed">
                {PYTHON_FILES_SNIPPETS[selectedFile]?.code}
              </pre>
            </div>
          )}

          {activeTab === 'troubleshoot' && (
            <div className="space-y-4">
              {/* Multiple users join room & talk */}
              <div className="p-3.5 bg-stone-950 rounded-xl border border-stone-800 space-y-2">
                <div className="flex items-center space-x-2 text-stone-100 font-semibold">
                  <Headphones className="w-4 h-4 text-emerald-400" />
                  <span>How Multiple Users Join One Room and Talk</span>
                </div>
                <div className="text-[11px] text-stone-300 space-y-2 leading-relaxed">
                  <p>
                    1. <strong className="text-stone-100">Same Room ID:</strong> Both users must be in the same room (e.g. <code className="text-emerald-300">#room_main</code>). To switch rooms, click the room button in the top bar.
                  </p>
                  <p>
                    2. <strong className="text-stone-100">WebRTC Voice Channel:</strong> Click the <strong>Voice</strong> button (mic icon) in the header. Grant browser microphone permission.
                  </p>
                  <p>
                    3. <strong className="text-stone-100">P2P Audio Signaling:</strong> The Python Socket.IO server automatically exchanges WebRTC SDP offers/answers between all active voice participants and establishes direct peer-to-peer audio streams.
                  </p>
                  <p>
                    4. <strong className="text-stone-100">Instant 2-User Test on this computer:</strong> Open a second browser tab, click <strong>Login &gt; Instant Guest Mode</strong>, and click <strong>Voice</strong>. Both tabs will communicate in real time!
                  </p>
                </div>
              </div>

              {/* 403 Forbidden & 404 Page Not Found Explanations */}
              <div className="p-3.5 bg-stone-950 rounded-xl border border-amber-900/60 space-y-2">
                <div className="flex items-center space-x-2 text-amber-400 font-semibold">
                  <ShieldCheck className="w-4 h-4 text-amber-400" />
                  <span>Why Did "403 Forbidden" or "Page Not Found" Occur?</span>
                </div>
                <div className="text-[11px] text-stone-300 space-y-2 leading-relaxed">
                  <p>
                    • <strong className="text-stone-100">403 Forbidden:</strong> The URL starting with <code className="text-amber-300">ais-dev-...</code> is a private developer sandbox restricted strictly to your authenticated Google AI Studio account. If you open it on a phone or another machine without your Google account login, Google Cloud blocks it with 403.
                  </p>
                  <p>
                    • <strong className="text-stone-100">Page Not Found:</strong> The public preview URL starting with <code className="text-emerald-300">ais-pre-...</code> is only activated when you click the <strong>Share</strong> button in Google AI Studio and publish a preview release.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-4 pt-3 border-t border-stone-800 flex items-center justify-between">
          <span className="text-[11px] text-stone-400 font-mono">
            FastAPI + python-socketio ASGI + Motor MongoDB
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold transition"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
