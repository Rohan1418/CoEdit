# Collaborative Code Editor - Frontend Client

Modern React + Vite + Monaco Editor frontend for real-time collaborative coding, peer-to-peer WebRTC voice communication, and live persistent chat.

---

## 💻 Tech Stack
- **Framework**: React 19 / 18+ with Vite
- **Code Editor**: `@monaco-editor/react` (Operational change capture, syntax highlighting, themes)
- **Real-Time WebSockets**: `socket.io-client`
- **Voice Communication**: Native WebRTC API (`RTCPeerConnection`, `getUserMedia`, `AudioContext` volume analyzer)
- **Styling**: Tailwind CSS
- **Icons**: `lucide-react`

---

## 📁 Key Components & Hooks
- `src/hooks/useWebRTC.js`: WebRTC audio signaling, peer negotiation, STUN servers, volume level detection.
- `src/components/MonacoEditor.tsx`: Monaco editor integration with non-echoing delta broadcast and remote cursor markers.
- `src/components/FileExplorer.tsx`: Hierarchical file tree with create, rename, delete, and directory collapsing.
- `src/components/ChatSidebar.tsx`: Room-scoped text chat and live voice channel status.
- `src/context/SocketContext.tsx`: Socket.IO client manager with JWT authentication and fallback demo capabilities.

---

## 🚀 Running Locally

```bash
# 1. Install dependencies
npm install

# 2. Start development server
npm run dev
```

The frontend will bind to `http://localhost:3000` (or `5173`) and automatically connect to your Python ASGI backend running at `http://localhost:8000`.
