import React, { useRef, useEffect, useState, useCallback } from 'react';
import Editor, { OnMount, OnChange } from '@monaco-editor/react';
import type * as monacoType from 'monaco-editor';
import { useSocket } from '../context/SocketContext';
import type { FileItem, RemoteCursor, Participant } from '../types';
import { 
  Code2, 
  Settings2, 
  Maximize2, 
  Minimize2, 
  Users, 
  Sparkles,
  CheckCircle2,
  FileCode
} from 'lucide-react';

interface MonacoEditorProps {
  activeFile: FileItem | null;
  roomId: string;
  onContentChange?: (fileId: string, newContent: string) => void;
  participants: Participant[];
}

export const MonacoEditor: React.FC<MonacoEditorProps> = ({
  activeFile,
  roomId,
  onContentChange,
  participants
}) => {
  const { socket, user, isSimulated } = useSocket();
  const editorRef = useRef<monacoType.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof monacoType | null>(null);
  const isRemoteUpdate = useRef<boolean>(false);
  const decorationsRef = useRef<string[]>([]);

  const [theme, setTheme] = useState<'vs-dark' | 'light' | 'hc-black'>('vs-dark');
  const [fontSize, setFontSize] = useState<number>(14);
  const [cursorPos, setCursorPos] = useState<{ lineNumber: number; column: number }>({ lineNumber: 1, column: 1 });
  const [isFullScreen, setIsFullScreen] = useState<boolean>(false);
  const [remoteCursors, setRemoteCursors] = useState<Map<string, RemoteCursor>>(new Map());
  const [lastSavedTime, setLastSavedTime] = useState<string>('Just now');

  // Detect programming language from file extension
  const getLanguageFromFilename = (filename: string): string => {
    const ext = filename.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'ts':
      case 'tsx':
        return 'typescript';
      case 'js':
      case 'jsx':
        return 'javascript';
      case 'py':
        return 'python';
      case 'json':
        return 'json';
      case 'html':
        return 'html';
      case 'css':
        return 'css';
      case 'md':
        return 'markdown';
      case 'sql':
        return 'sql';
      case 'rs':
        return 'rust';
      case 'go':
        return 'go';
      case 'yaml':
      case 'yml':
        return 'yaml';
      default:
        return 'typescript';
    }
  };

  // Handle local change in editor
  const handleEditorChange: OnChange = (value, ev) => {
    if (isRemoteUpdate.current) {
      return; // Skip if update originated from remote socket event
    }

    if (activeFile && value !== undefined) {
      if (onContentChange) {
        onContentChange(activeFile.id, value);
      }

      setLastSavedTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));

      // Emit code change via WebSocket
      if (socket && socket.connected) {
        socket.emit('code_change', {
          room_id: roomId,
          file_id: activeFile.id,
          content: value,
          delta: ev,
          sender_id: user.id,
          sender_name: user.username
        });
      }
    }
  };

  // Monaco Editor Mounted
  const handleEditorDidMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Track cursor movement
    editor.onDidChangeCursorPosition((e) => {
      setCursorPos({ lineNumber: e.position.lineNumber, column: e.position.column });

      if (socket && socket.connected && activeFile) {
        socket.emit('cursor_move', {
          room_id: roomId,
          file_id: activeFile.id,
          position: { lineNumber: e.position.lineNumber, column: e.position.column },
          selection: editor.getSelection()
        });
      }
    });

    // Notify server of active file selection
    if (socket && socket.connected && activeFile) {
      socket.emit('file_select', {
        room_id: roomId,
        file_id: activeFile.id
      });
    }
  };

  // Listen to remote code and cursor events
  useEffect(() => {
    if (!socket) return;

    // Remote code update
    const handleRemoteCode = (data: { room_id: string; file_id: string; content: string; sender_id: string; sender_name: string }) => {
      if (activeFile && data.file_id === activeFile.id && data.sender_id !== user.id) {
        const editor = editorRef.current;
        if (editor) {
          const currentVal = editor.getValue();
          if (currentVal !== data.content) {
            isRemoteUpdate.current = true;
            const fullRange = editor.getModel()?.getFullModelRange();
            if (fullRange) {
              editor.executeEdits('remote-peer', [
                {
                  range: fullRange,
                  text: data.content,
                  forceMoveMarkers: true
                }
              ]);
            }
            isRemoteUpdate.current = false;
            if (onContentChange) {
              onContentChange(activeFile.id, data.content);
            }
          }
        }
      }
    };

    // Remote cursor update
    const handleRemoteCursor = (data: RemoteCursor) => {
      if (activeFile && data.file_id === activeFile.id && data.user_id !== user.id) {
        setRemoteCursors((prev) => {
          const next = new Map(prev);
          next.set(data.user_id, data);
          return next;
        });
      }
    };

    socket.on('code_update', handleRemoteCode);
    socket.on('cursor_update', handleRemoteCursor);

    return () => {
      socket.off('code_update', handleRemoteCode);
      socket.off('cursor_update', handleRemoteCursor);
    };
  }, [socket, activeFile, user.id, onContentChange]);

  // Render Monaco decorations for remote cursors
  const updateRemoteDecorations = useCallback(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco || !activeFile) return;

    const newDecorations: monacoType.editor.IModelDeltaDecoration[] = [];

    remoteCursors.forEach((c) => {
      if (c.file_id === activeFile.id) {
        // Selection highlight
        if (c.selection) {
          newDecorations.push({
            range: new monaco.Range(
              c.selection.startLineNumber,
              c.selection.startColumn,
              c.selection.endLineNumber,
              c.selection.endColumn
            ),
            options: {
              className: 'remote-selection-highlight',
              hoverMessage: { value: `**${c.username}** is selecting here` }
            }
          });
        }
        // Cursor line highlight
        newDecorations.push({
          range: new monaco.Range(c.position.lineNumber, c.position.column, c.position.lineNumber, c.position.column + 1),
          options: {
            className: 'remote-cursor-indicator',
            beforeContentClassName: 'remote-cursor-line',
            hoverMessage: { value: `**${c.username}** cursor` }
          }
        });
      }
    });

    decorationsRef.current = editor.deltaDecorations(decorationsRef.current, newDecorations);
  }, [activeFile, remoteCursors]);

  useEffect(() => {
    updateRemoteDecorations();
  }, [updateRemoteDecorations]);

  // Simulated peer edits when in demo mode for interactive playground testing
  useEffect(() => {
    if (!isSimulated || !activeFile) return;

    const interval = setInterval(() => {
      const editor = editorRef.current;
      if (!editor) return;

      // Simulated collaborator cursor
      setRemoteCursors((prev) => {
        const next = new Map(prev);
        const line = Math.floor(Math.random() * 8) + 1;
        next.set('sim_coder_99', {
          user_id: 'sim_coder_99',
          username: 'Sarah (Pairing)',
          avatar_color: '#8b5cf6',
          file_id: activeFile.id,
          position: { lineNumber: line, column: 12 }
        });
        return next;
      });
    }, 4500);

    return () => clearInterval(interval);
  }, [isSimulated, activeFile]);

  // Format document action
  const formatDocument = () => {
    if (editorRef.current) {
      editorRef.current.getAction('editor.action.formatDocument')?.run();
    }
  };

  if (!activeFile) {
    return (
      <div 
        id="monaco-empty-state"
        className="h-full flex flex-col items-center justify-center bg-stone-950 text-stone-400 p-8 text-center select-none"
      >
        <div className="w-16 h-16 rounded-2xl bg-stone-900 border border-stone-800 flex items-center justify-center mb-4 text-emerald-400 shadow-inner">
          <Code2 className="w-8 h-8" />
        </div>
        <h3 className="text-stone-200 font-semibold text-lg mb-1">No File Selected</h3>
        <p className="text-stone-400 text-sm max-w-sm">
          Select a file from the explorer on the left or create a new one to begin real-time collaborative editing.
        </p>
      </div>
    );
  }

  const currentLanguage = activeFile.language || getLanguageFromFilename(activeFile.name);

  return (
    <div 
      id="monaco-editor-container"
      className={`h-full flex flex-col bg-stone-950 ${isFullScreen ? 'fixed inset-0 z-50' : 'relative'}`}
    >
      {/* Editor Header Bar */}
      <div 
        id="monaco-header-bar"
        className="h-11 px-4 bg-stone-900/90 border-b border-stone-800 flex items-center justify-between backdrop-blur-sm select-none"
      >
        {/* Left: Active File Details */}
        <div className="flex items-center space-x-3 overflow-hidden">
          <div className="flex items-center space-x-2 text-stone-200 font-mono text-sm">
            <FileCode className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="font-semibold truncate">{activeFile.name}</span>
            <span className="text-xs text-stone-400 font-sans px-2 py-0.5 rounded bg-stone-800 border border-stone-700">
              {currentLanguage}
            </span>
          </div>

          {/* Remote Collaborator Avatars in this file */}
          {Array.from(remoteCursors.values()).length > 0 && (
            <div className="hidden sm:flex items-center space-x-1.5 pl-3 border-l border-stone-800">
              <span className="text-xs text-stone-400 flex items-center gap-1">
                <Users className="w-3 h-3 text-stone-400" />
                Editing:
              </span>
              {(Array.from(remoteCursors.values()) as RemoteCursor[]).map((c: RemoteCursor) => (
                <div
                  key={c.user_id}
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium border"
                  style={{
                    backgroundColor: `${c.avatar_color}22`,
                    borderColor: `${c.avatar_color}66`,
                    color: c.avatar_color
                  }}
                  title={`${c.username} is at Line ${c.position.lineNumber}`}
                >
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: c.avatar_color }} />
                  <span>{c.username}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: Controls & Actions */}
        <div className="flex items-center space-x-2">
          {/* Format Code Button */}
          <button
            id="format-code-button"
            onClick={formatDocument}
            className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-md text-stone-300 bg-stone-800 hover:bg-stone-700 border border-stone-700 transition"
            title="Format Document (Shift+Alt+F)"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden md:inline">Format</span>
          </button>

          {/* Font Size Selector */}
          <div className="hidden sm:flex items-center space-x-1 text-xs text-stone-400 bg-stone-800 px-2 py-1 rounded border border-stone-700">
            <span>Size:</span>
            <select
              value={fontSize}
              onChange={(e) => setFontSize(Number(e.target.value))}
              className="bg-transparent text-stone-200 focus:outline-none cursor-pointer"
            >
              <option value={12} className="bg-stone-800">12px</option>
              <option value={14} className="bg-stone-800">14px</option>
              <option value={16} className="bg-stone-800">16px</option>
              <option value={18} className="bg-stone-800">18px</option>
            </select>
          </div>

          {/* Theme Selector */}
          <select
            value={theme}
            onChange={(e) => setTheme(e.target.value as 'vs-dark' | 'light' | 'hc-black')}
            className="text-xs bg-stone-800 text-stone-300 px-2 py-1 rounded border border-stone-700 focus:outline-none cursor-pointer"
          >
            <option value="vs-dark" className="bg-stone-800">Dark (VS)</option>
            <option value="light" className="bg-stone-800">Light</option>
            <option value="hc-black" className="bg-stone-800">High Contrast</option>
          </select>

          {/* Full Screen Toggle */}
          <button
            id="fullscreen-toggle-btn"
            onClick={() => setIsFullScreen(!isFullScreen)}
            className="p-1.5 text-stone-400 hover:text-stone-200 hover:bg-stone-800 rounded transition"
            title={isFullScreen ? 'Exit Full Screen' : 'Full Screen'}
          >
            {isFullScreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Editor Body */}
      <div className="flex-1 min-h-0 relative">
        <Editor
          height="100%"
          language={currentLanguage}
          value={activeFile.content || ''}
          theme={theme}
          onChange={handleEditorChange}
          onMount={handleEditorDidMount}
          options={{
            fontSize: fontSize,
            fontFamily: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
            fontLigatures: true,
            tabSize: 2,
            insertSpaces: true,
            automaticLayout: true,
            minimap: { enabled: true },
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            lineNumbers: 'on',
            bracketPairColorization: { enabled: true },
            cursorBlinking: 'smooth',
            cursorSmoothCaretAnimation: 'on',
            smoothScrolling: true,
            renderLineHighlight: 'all',
            padding: { top: 12, bottom: 12 },
            suggestOnTriggerCharacters: true
          }}
        />
      </div>

      {/* Status Bar */}
      <div 
        id="monaco-status-bar"
        className="h-6 px-4 bg-stone-900 border-t border-stone-800 text-[11px] text-stone-400 flex items-center justify-between font-mono select-none"
      >
        <div className="flex items-center space-x-4">
          <div className="flex items-center gap-1 text-emerald-400">
            <CheckCircle2 className="w-3 h-3" />
            <span>Saved {lastSavedTime}</span>
          </div>
          <span>Ln {cursorPos.lineNumber}, Col {cursorPos.column}</span>
          <span className="hidden sm:inline">UTF-8</span>
          <span className="hidden md:inline">Spaces: 2</span>
        </div>

        <div className="flex items-center space-x-3">
          <span className="text-stone-300">
            {participants.length} Active {participants.length === 1 ? 'Peer' : 'Peers'}
          </span>
          <span className="capitalize text-emerald-400 font-semibold">{currentLanguage}</span>
        </div>
      </div>
    </div>
  );
};
