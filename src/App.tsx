import React, { useState, useEffect, useCallback } from 'react';
import { SocketProvider, useSocket } from './context/SocketContext';
import { MonacoEditor } from './components/MonacoEditor';
import { FileExplorer } from './components/FileExplorer';
import { ChatSidebar } from './components/ChatSidebar';
import { AuthModal } from './components/AuthModal';
import { RoomModal } from './components/RoomModal';
import { SetupGuideModal } from './components/SetupGuideModal';
import { ShareModal } from './components/ShareModal';
import { useWebRTC } from './hooks/useWebRTC';
import type { FileItem, ChatMessage, Participant, Room } from './types';
import { 
  Code2, 
  Terminal, 
  Share2, 
  Users, 
  Wifi, 
  WifiOff, 
  BookOpen, 
  LogIn, 
  LogOut, 
  Copy, 
  Check, 
  Mic, 
  MicOff, 
  Sparkles,
  Layers,
  ChevronDown
} from 'lucide-react';

const INITIAL_FILES: FileItem[] = [
  {
    id: 'f-root',
    room_id: 'room_main',
    name: 'src',
    path: '/src',
    parent_path: '/',
    is_folder: true,
    size: 0
  },
  {
    id: 'f-index',
    room_id: 'room_main',
    name: 'index.ts',
    path: '/src/index.ts',
    parent_path: '/src',
    is_folder: false,
    language: 'typescript',
    content: `// Real-Time Collaborative Code Editor
// Powered by Monaco Editor, Python FastAPI, Socket.IO & WebRTC

export interface ProjectState {
  roomId: string;
  activeUsers: number;
  syncTimestamp: number;
}

export function initializeCollaboration(room: string): ProjectState {
  console.log(\`[RealTime] Initializing peer session in \${room}\`);
  return {
    roomId: room,
    activeUsers: 1,
    syncTimestamp: Date.now()
  };
}

// Operational edits are transmitted instantly to room peers via WebSockets!
const session = initializeCollaboration("room_main");
console.log("Ready for multi-user coding session:", session);
`,
    size: 580
  },
  {
    id: 'f-backend-folder',
    room_id: 'room_main',
    name: 'backend',
    path: '/backend',
    parent_path: '/',
    is_folder: true,
    size: 0
  },
  {
    id: 'f-backend-main',
    room_id: 'room_main',
    name: 'main.py',
    path: '/backend/main.py',
    parent_path: '/backend',
    is_folder: false,
    language: 'python',
    content: `# Python 3.11+ FastAPI & Socket.IO Combined ASGI Application
import logging
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
    return {"status": "online", "backend": "Python FastAPI + Socket.IO ASGI", "version": "3.11+"}

# Wrap FastAPI with python-socketio AsyncServer into a unified ASGI app
socket_app = socketio.ASGIApp(
    socketio_server=sio,
    other_asgi_app=app,
    socketio_path="socket.io"
)
`,
    size: 1100
  },
  {
    id: 'f-backend-sockets',
    room_id: 'room_main',
    name: 'socket_events.py',
    path: '/backend/socket_events.py',
    parent_path: '/backend',
    is_folder: false,
    language: 'python',
    content: `# Real-Time Socket.IO Handlers & WebRTC Signaling
import socketio
from backend.database import db_instance

sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins="*")

# Monaco Code Delta Broadcast (Non-Echoing)
@sio.event
async def code_change(sid: str, data: dict):
    await sio.emit("code_update", data, room=data.get("room_id"), skip_sid=sid)

# Cursor Coordinates
@sio.event
async def cursor_move(sid: str, data: dict):
    await sio.emit("cursor_update", data, room=data.get("room_id"), skip_sid=sid)

# Persistent Chat
@sio.event
async def send_message(sid: str, data: dict):
    await sio.emit("new_message", data, room=data.get("room_id"))

# WebRTC Voice Signaling (P2P Audio Calls)
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
`,
    size: 1250
  },
  {
    id: 'f-backend-reqs',
    room_id: 'room_main',
    name: 'requirements.txt',
    path: '/backend/requirements.txt',
    parent_path: '/backend',
    is_folder: false,
    language: 'markdown',
    content: `fastapi>=0.109.0
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
`,
    size: 220
  },
  {
    id: 'f-readme',
    room_id: 'room_main',
    name: 'README.md',
    path: '/README.md',
    parent_path: '/',
    is_folder: false,
    language: 'markdown',
    content: `# Collaborative Code Editor

Welcome to your real-time collaborative workspace!

### Architecture & Tech Stack:
- **Backend (Python 3.11+)**:
  - \`FastAPI\`: REST APIs for Auth, Room Management & File Tree CRUD
  - \`python-socketio\`: Async ASGI server handling code syncing, cursors, chat, and WebRTC signaling
  - \`Motor\`: Async MongoDB driver for persistence
  - \`PyJWT\` & \`Passlib/Bcrypt\`: Security & authentication tokens
- **Frontend**:
  - \`Monaco Editor\`: Operational change capture and syntax highlighting
  - \`WebRTC API\`: P2P real-time audio voice channels with volume meter
  - \`Socket.IO Client\`: Event-driven bidirectional communication
  - \`Tailwind CSS\`: Responsive developer dark theme
`,
    size: 650
  }
];

const INITIAL_ROOMS: Room[] = [
  {
    room_id: 'room_main',
    name: 'Main Collaboration Room',
    description: 'General collaborative development workspace',
    created_by: 'system',
    created_at: new Date().toISOString(),
    is_private: false,
    active_participants: []
  },
  {
    room_id: 'room_algorithms',
    name: 'Algorithm Pair Coding',
    description: 'Data structures and algorithms pairing session',
    created_by: 'system',
    created_at: new Date().toISOString(),
    is_private: false,
    active_participants: []
  }
];

function CollaborativeApp() {
  const { socket, isConnected, user, logout, isSimulated, setIsSimulated } = useSocket();

  const [currentRoomId, setCurrentRoomId] = useState<string>('room_main');
  const [files, setFiles] = useState<FileItem[]>(INITIAL_FILES);
  const [activeFileId, setActiveFileId] = useState<string>('f-index');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([
    {
      user_id: user.id,
      username: user.username,
      avatar_color: user.avatar_color,
      is_voice_active: false,
      is_muted: false
    }
  ]);
  const [availableRooms, setAvailableRooms] = useState<Room[]>(INITIAL_ROOMS);

  // Modals
  const [isAuthOpen, setIsAuthOpen] = useState<boolean>(false);
  const [isRoomOpen, setIsRoomOpen] = useState<boolean>(false);
  const [isGuideOpen, setIsGuideOpen] = useState<boolean>(false);
  const [isShareOpen, setIsShareOpen] = useState<boolean>(false);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);

  // WebRTC Voice Hook
  const {
    isInVoice,
    isMuted,
    localVolume,
    joinVoice,
    leaveVoice,
    toggleMute
  } = useWebRTC({
    socket,
    roomId: currentRoomId,
    currentUser: user,
    isSimulated
  });

  // Active File object
  const activeFile = files.find((f) => f.id === activeFileId) || files.find((f) => !f.is_folder) || null;

  // Sync Room Join when socket connects or room changes
  useEffect(() => {
    if (socket && isConnected) {
      socket.emit('join_room', { room_id: currentRoomId }, (res: { participants?: Participant[] }) => {
        if (res?.participants) {
          setParticipants(res.participants);
        }
      });
    } else {
      // Keep self in participant roster
      setParticipants([
        {
          user_id: user.id,
          username: user.username,
          avatar_color: user.avatar_color,
          is_voice_active: isInVoice,
          is_muted: isMuted
        }
      ]);
    }
  }, [socket, isConnected, currentRoomId, user, isInVoice, isMuted]);

  // Socket event subscriptions
  useEffect(() => {
    if (!socket) return;

    // Room joined payload
    const handleRoomJoined = (data: { participants: Participant[] }) => {
      if (data.participants) {
        setParticipants(data.participants);
      }
    };

    // User joined room
    const handleUserJoined = (data: { user_id: string; username: string; avatar_color: string; participants: Participant[] }) => {
      if (data.participants) {
        setParticipants(data.participants);
      }
    };

    // User left room
    const handleUserLeft = (data: { user_id: string; participants: Participant[] }) => {
      if (data.participants) {
        setParticipants(data.participants);
      }
    };

    // New chat message
    const handleNewMessage = (msg: ChatMessage) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
    };

    // File tree updated by peer
    const handleFileTreeUpdate = (data: { action: string; file?: FileItem; file_id?: string; new_name?: string }) => {
      if (data.action === 'create' && data.file) {
        setFiles((prev) => [...prev, data.file!]);
      } else if (data.action === 'rename' && data.file_id && data.new_name) {
        setFiles((prev) =>
          prev.map((f) => (f.id === data.file_id ? { ...f, name: data.new_name! } : f))
        );
      } else if (data.action === 'delete' && data.file_id) {
        setFiles((prev) => prev.filter((f) => f.id !== data.file_id));
      }
    };

    socket.on('room_joined', handleRoomJoined);
    socket.on('user_joined', handleUserJoined);
    socket.on('user_left', handleUserLeft);
    socket.on('new_message', handleNewMessage);
    socket.on('file_tree_updated', handleFileTreeUpdate);

    return () => {
      socket.off('room_joined', handleRoomJoined);
      socket.off('user_joined', handleUserJoined);
      socket.off('user_left', handleUserLeft);
      socket.off('new_message', handleNewMessage);
      socket.off('file_tree_updated', handleFileTreeUpdate);
    };
  }, [socket]);

  // Initial welcome message in chat
  useEffect(() => {
    setMessages([
      {
        id: 'welcome-msg',
        room_id: currentRoomId,
        sender_id: 'sys',
        sender_name: 'Python Engine',
        sender_avatar_color: '#10b981',
        content: `Connected to #${currentRoomId}. Real-time operational code sync, persistent chat, and WebRTC voice signaling are active.`,
        timestamp: new Date().toISOString()
      }
    ]);
  }, [currentRoomId]);

  // File Handlers
  const handleSelectFile = (file: FileItem) => {
    setActiveFileId(file.id);
  };

  const handleContentChange = useCallback((fileId: string, newContent: string) => {
    setFiles((prev) =>
      prev.map((f) => (f.id === fileId ? { ...f, content: newContent, size: newContent.length } : f))
    );
  }, []);

  const handleCreateFile = (name: string, parentPath: string, isFolder: boolean) => {
    const cleanParent = parentPath.replace(/\/$/, '');
    const path = cleanParent ? `${cleanParent}/${name}` : `/${name}`;
    const ext = name.split('.').pop()?.toLowerCase();
    
    let language = 'typescript';
    if (ext === 'py') language = 'python';
    if (ext === 'md') language = 'markdown';
    if (ext === 'json') language = 'json';
    if (ext === 'html') language = 'html';
    if (ext === 'css') language = 'css';

    const newFile: FileItem = {
      id: 'f_' + Math.random().toString(36).substring(2, 9),
      room_id: currentRoomId,
      name,
      path,
      parent_path: parentPath,
      is_folder: isFolder,
      content: isFolder ? '' : `// File: ${name}\n`,
      language: isFolder ? undefined : language,
      size: 0
    };

    setFiles((prev) => [...prev, newFile]);
    if (!isFolder) {
      setActiveFileId(newFile.id);
    }

    if (socket && socket.connected) {
      socket.emit('file_tree_change', {
        action: 'create',
        file: newFile,
        room_id: currentRoomId
      });
    }
  };

  const handleRenameFile = (fileId: string, newName: string) => {
    setFiles((prev) =>
      prev.map((f) => {
        if (f.id === fileId) {
          const parent = f.parent_path.replace(/\/$/, '');
          const newPath = parent ? `${parent}/${newName}` : `/${newName}`;
          return { ...f, name: newName, path: newPath };
        }
        return f;
      })
    );

    if (socket && socket.connected) {
      socket.emit('file_tree_change', {
        action: 'rename',
        file_id: fileId,
        new_name: newName,
        room_id: currentRoomId
      });
    }
  };

  const handleDeleteFile = (fileId: string) => {
    const fileToDelete = files.find((f) => f.id === fileId);
    if (!fileToDelete) return;

    setFiles((prev) => prev.filter((f) => f.id !== fileId && !f.path.startsWith(fileToDelete.path + '/')));
    if (activeFileId === fileId) {
      const remaining = files.filter((f) => f.id !== fileId && !f.is_folder);
      if (remaining.length > 0) {
        setActiveFileId(remaining[0].id);
      }
    }

    if (socket && socket.connected) {
      socket.emit('file_tree_change', {
        action: 'delete',
        file_id: fileId,
        room_id: currentRoomId
      });
    }
  };

  // Chat send handler
  const handleSendMessage = (content: string) => {
    const newMsg: ChatMessage = {
      id: 'msg_' + Math.random().toString(36).substring(2, 9),
      room_id: currentRoomId,
      sender_id: user.id,
      sender_name: user.username,
      sender_avatar_color: user.avatar_color,
      content,
      timestamp: new Date().toISOString()
    };

    setMessages((prev) => [...prev, newMsg]);

    if (socket && socket.connected) {
      socket.emit('send_message', {
        room_id: currentRoomId,
        content
      });
    }
  };

  // Copy share invite link
  const handleCopyInviteLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <div 
      id="app-root-container"
      className="h-screen w-screen flex flex-col bg-stone-950 text-stone-100 font-sans overflow-hidden select-none"
    >
      {/* Top Application Header */}
      <header 
        id="top-nav-bar"
        className="h-12 px-4 bg-stone-900 border-b border-stone-800 flex items-center justify-between z-20 shrink-0"
      >
        {/* Left: Brand & Room Selector */}
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-950 border border-emerald-800 flex items-center justify-center text-emerald-400 shadow-sm">
              <Code2 className="w-4 h-4" />
            </div>
            <span className="font-bold text-sm tracking-tight text-stone-100 hidden sm:inline">
              Collaborative Code
            </span>
          </div>

          <div className="h-4 w-px bg-stone-800 hidden sm:block" />

          {/* Current Room Selector Button */}
          <button
            id="room-selector-button"
            onClick={() => setIsRoomOpen(true)}
            className="flex items-center space-x-1.5 px-2.5 py-1 bg-stone-950 hover:bg-stone-800 border border-stone-800 hover:border-stone-700 rounded-lg text-xs transition"
          >
            <Layers className="w-3.5 h-3.5 text-emerald-400" />
            <span className="font-mono font-medium text-stone-200">#{currentRoomId}</span>
            <ChevronDown className="w-3 h-3 text-stone-400" />
          </button>

          {/* Share Room Button */}
          <button
            id="share-room-button"
            onClick={() => setIsShareOpen(true)}
            className="flex items-center space-x-1 px-2 py-1 text-xs text-stone-300 hover:text-white bg-stone-950 hover:bg-stone-800 border border-stone-800 rounded transition"
            title="Share Room Link"
          >
            <Share2 className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden md:inline">Share</span>
          </button>
        </div>

        {/* Center: Online Participants Roster */}
        <div className="hidden lg:flex items-center space-x-1.5 bg-stone-950/80 px-3 py-1 rounded-full border border-stone-800">
          <span className="text-[11px] text-stone-400 mr-1 flex items-center gap-1">
            <Users className="w-3 h-3" />
            <span>Online:</span>
          </span>
          {participants.slice(0, 5).map((p) => (
            <div
              key={p.user_id}
              className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white shadow-sm ring-1 ring-stone-900"
              style={{ backgroundColor: p.avatar_color }}
              title={`${p.username}${p.user_id === user.id ? ' (You)' : ''}`}
            >
              {p.username.charAt(0).toUpperCase()}
            </div>
          ))}
          {participants.length > 5 && (
            <span className="text-[10px] text-stone-400">+{participants.length - 5}</span>
          )}
        </div>

        {/* Right: Voice Quick Toggle, Backend Status, Setup Guide & Auth */}
        <div className="flex items-center space-x-2">
          {/* WebRTC Voice Quick Action */}
          {isInVoice ? (
            <div className="flex items-center space-x-1 bg-stone-950 border border-emerald-800 px-2 py-1 rounded-lg">
              <button
                onClick={toggleMute}
                className={`p-1 rounded ${isMuted ? 'text-rose-400' : 'text-emerald-400'}`}
                title={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
              </button>
              <div 
                className="w-1.5 h-3 rounded bg-emerald-500 transition-all"
                style={{ opacity: isMuted ? 0.3 : Math.max(0.2, localVolume / 100) }}
              />
              <span className="text-[10px] text-emerald-400 font-medium hidden sm:inline">Voice Active</span>
            </div>
          ) : (
            <button
              onClick={joinVoice}
              className="flex items-center space-x-1 px-2.5 py-1 text-xs text-stone-300 hover:text-white bg-stone-800 hover:bg-stone-700 border border-stone-700 rounded-lg transition"
              title="Join WebRTC Voice Channel"
            >
              <Mic className="w-3.5 h-3.5 text-stone-400" />
              <span className="hidden sm:inline">Voice</span>
            </button>
          )}

          {/* Backend Status Indicator */}
          <button
            id="backend-status-btn"
            onClick={() => setIsGuideOpen(true)}
            className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-xs border transition ${
              isConnected
                ? 'bg-emerald-950/70 border-emerald-800 text-emerald-300 shadow-sm'
                : 'bg-stone-950 border-stone-800 text-stone-300 hover:text-white'
            }`}
            title="Inspect Python FastAPI + Socket.IO Backend Setup & Code"
          >
            {isConnected ? <Wifi className="w-3 h-3 text-emerald-400" /> : <WifiOff className="w-3 h-3 text-amber-500" />}
            <span className="hidden sm:inline font-mono font-medium">
              Python 3.11+ Backend
            </span>
          </button>

          {/* Architecture / Setup Guide Modal Trigger */}
          <button
            id="architecture-guide-btn"
            onClick={() => setIsGuideOpen(true)}
            className="p-1.5 text-stone-400 hover:text-stone-200 hover:bg-stone-800 rounded-lg transition"
            title="Step-by-step Setup Guide"
          >
            <BookOpen className="w-4 h-4" />
          </button>

          {/* User Account / Login Button */}
          {user ? (
            <div className="flex items-center space-x-2 pl-2 border-l border-stone-800">
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shadow-sm"
                style={{ backgroundColor: user.avatar_color }}
                title={user.username}
              >
                {user.username.charAt(0).toUpperCase()}
              </div>
              <button
                id="logout-btn"
                onClick={logout}
                className="p-1 text-stone-400 hover:text-rose-400 transition"
                title="Switch User / Log Out"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              id="login-btn"
              onClick={() => setIsAuthOpen(true)}
              className="flex items-center space-x-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold transition"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Login</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Workspace 3-Column Layout */}
      <main 
        id="main-editor-workspace"
        className="flex-1 flex min-h-0 relative"
      >
        {/* Left Column: File Tree Explorer */}
        <div className="w-60 min-w-[200px] max-w-[320px] h-full shrink-0">
          <FileExplorer
            files={files}
            activeFileId={activeFileId}
            onSelectFile={handleSelectFile}
            onCreateFile={handleCreateFile}
            onRenameFile={handleRenameFile}
            onDeleteFile={handleDeleteFile}
          />
        </div>

        {/* Middle Column: Monaco Code Editor */}
        <div className="flex-1 min-w-0 h-full">
          <MonacoEditor
            activeFile={activeFile}
            roomId={currentRoomId}
            onContentChange={handleContentChange}
            participants={participants}
          />
        </div>

        {/* Right Column: Chat & WebRTC Voice Sidebar */}
        <div className="w-72 min-w-[260px] max-w-[360px] h-full shrink-0">
          <ChatSidebar
            roomId={currentRoomId}
            messages={messages}
            onSendMessage={handleSendMessage}
            participants={participants}
            isInVoice={isInVoice}
            onJoinVoice={joinVoice}
            onLeaveVoice={leaveVoice}
            isMuted={isMuted}
            onToggleMute={toggleMute}
            localVolume={localVolume}
          />
        </div>
      </main>

      {/* Dialog Modals */}
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
      />

      <RoomModal
        isOpen={isRoomOpen}
        onClose={() => setIsRoomOpen(false)}
        currentRoomId={currentRoomId}
        onSelectRoom={(rId) => {
          setCurrentRoomId(rId);
        }}
        availableRooms={availableRooms}
      />

      <SetupGuideModal
        isOpen={isGuideOpen}
        onClose={() => setIsGuideOpen(false)}
      />

      <ShareModal
        isOpen={isShareOpen}
        onClose={() => setIsShareOpen(false)}
        currentRoomId={currentRoomId}
      />
    </div>
  );
}

export default function App() {
  return (
    <SocketProvider>
      <CollaborativeApp />
    </SocketProvider>
  );
}
