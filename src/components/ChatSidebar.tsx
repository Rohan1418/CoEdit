import React, { useState, useEffect, useRef } from 'react';
import type { ChatMessage, Participant } from '../types';
import { useSocket } from '../context/SocketContext';
import { 
  Send, 
  MessageSquare, 
  Users, 
  Mic, 
  MicOff, 
  Volume2, 
  Circle,
  Hash
} from 'lucide-react';

interface ChatSidebarProps {
  roomId: string;
  messages: ChatMessage[];
  onSendMessage: (content: string) => void;
  participants: Participant[];
  isInVoice: boolean;
  onJoinVoice: () => void;
  onLeaveVoice: () => void;
  isMuted: boolean;
  onToggleMute: () => void;
  localVolume: number;
}

export const ChatSidebar: React.FC<ChatSidebarProps> = ({
  roomId,
  messages,
  onSendMessage,
  participants,
  isInVoice,
  onJoinVoice,
  onLeaveVoice,
  isMuted,
  onToggleMute,
  localVolume
}) => {
  const { user } = useSocket();
  const [activeTab, setActiveTab] = useState<'chat' | 'participants'>('chat');
  const [inputText, setInputText] = useState<string>('');
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    if (activeTab === 'chat') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, activeTab]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputText.trim();
    if (trimmed) {
      onSendMessage(trimmed);
      setInputText('');
    }
  };

  const formatTime = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  return (
    <div 
      id="collab-sidebar"
      className="h-full flex flex-col bg-stone-900 border-l border-stone-800 text-stone-200 select-none"
    >
      {/* Sidebar Tabs */}
      <div 
        id="sidebar-tabs"
        className="h-10 px-2 flex items-center border-b border-stone-800 bg-stone-900/90 text-xs font-medium"
      >
        <button
          id="tab-chat"
          onClick={() => setActiveTab('chat')}
          className={`flex-1 flex items-center justify-center space-x-1.5 py-1.5 rounded-md transition ${
            activeTab === 'chat'
              ? 'bg-stone-800 text-emerald-400 font-semibold shadow-sm'
              : 'text-stone-400 hover:text-stone-200'
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span>Room Chat</span>
          {messages.length > 0 && (
            <span className="ml-1 text-[10px] px-1.5 py-0.2 rounded-full bg-stone-700 text-stone-300">
              {messages.length}
            </span>
          )}
        </button>

        <button
          id="tab-participants"
          onClick={() => setActiveTab('participants')}
          className={`flex-1 flex items-center justify-center space-x-1.5 py-1.5 rounded-md transition ${
            activeTab === 'participants'
              ? 'bg-stone-800 text-emerald-400 font-semibold shadow-sm'
              : 'text-stone-400 hover:text-stone-200'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Peers</span>
          <span className="ml-1 text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800">
            {participants.length}
          </span>
        </button>
      </div>

      {/* WebRTC Voice Channel Header Banner */}
      <div 
        id="webrtc-voice-banner"
        className="px-3 py-2.5 bg-stone-950 border-b border-stone-800 flex items-center justify-between"
      >
        <div className="flex items-center space-x-2">
          <div className="relative">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center border transition ${
              isInVoice
                ? 'bg-emerald-950/60 border-emerald-600 text-emerald-400'
                : 'bg-stone-900 border-stone-800 text-stone-500'
            }`}>
              <Volume2 className="w-4 h-4" />
            </div>
            {isInVoice && (
              <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
            )}
          </div>
          <div>
            <div className="text-xs font-semibold text-stone-200">
              {isInVoice ? 'P2P Voice Connected' : 'Voice Channel'}
            </div>
            <div className="text-[11px] text-stone-400">
              {isInVoice ? (isMuted ? 'Microphone muted' : 'Live audio active') : 'WebRTC audio disabled'}
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-1.5">
          {isInVoice ? (
            <>
              {/* Mic Mute Toggle Button */}
              <button
                id="voice-mute-toggle-btn"
                onClick={onToggleMute}
                className={`p-1.5 rounded-md border text-xs transition ${
                  isMuted 
                    ? 'bg-rose-950/50 border-rose-800 text-rose-300 hover:bg-rose-900/60' 
                    : 'bg-stone-800 border-stone-700 text-stone-200 hover:bg-stone-700'
                }`}
                title={isMuted ? 'Unmute Mic' : 'Mute Mic'}
              >
                {isMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
              </button>

              {/* Leave Voice Button */}
              <button
                id="voice-leave-btn"
                onClick={onLeaveVoice}
                className="px-2 py-1 bg-rose-900/80 hover:bg-rose-800 text-rose-200 border border-rose-700 rounded-md text-xs font-medium transition"
              >
                Disconnect
              </button>
            </>
          ) : (
            <button
              id="voice-join-btn"
              onClick={onJoinVoice}
              className="flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-md text-xs font-medium shadow-sm transition"
            >
              <Mic className="w-3 h-3" />
              <span>Join Voice</span>
            </button>
          )}
        </div>
      </div>

      {/* Voice Audio Level Meter Bar */}
      {isInVoice && (
        <div className="h-1 bg-stone-900 w-full overflow-hidden">
          <div 
            className={`h-full transition-all duration-75 ${
              isMuted ? 'bg-rose-500' : 'bg-emerald-500'
            }`}
            style={{ width: `${isMuted ? 0 : Math.max(5, localVolume)}%` }}
          />
        </div>
      )}

      {/* Tab 1: Chat Message Stream */}
      {activeTab === 'chat' && (
        <div className="flex-1 flex flex-col min-h-0">
          <div 
            id="chat-messages-container"
            className="flex-1 overflow-y-auto p-3 space-y-3 font-sans text-xs"
          >
            {messages.length === 0 ? (
              <div className="text-center py-10 text-stone-400 space-y-2">
                <Hash className="w-6 h-6 mx-auto text-stone-400" />
                <p>Welcome to #{roomId}</p>
                <p className="text-[11px] text-stone-400">
                  Send a message to start real-time messaging with your room peers.
                </p>
              </div>
            ) : (
              messages.map((msg) => {
                const isSelf = msg.sender_id === user.id;
                return (
                  <div 
                    key={msg.id}
                    id={`chat-msg-${msg.id}`}
                    className={`flex flex-col ${isSelf ? 'items-end' : 'items-start'}`}
                  >
                    <div className="flex items-center space-x-1.5 mb-1">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: msg.sender_avatar_color }}
                      />
                      <span className="font-medium text-stone-300 text-[11px]">
                        {isSelf ? 'You' : msg.sender_name}
                      </span>
                      <span className="text-[10px] text-stone-400">
                        {formatTime(msg.timestamp)}
                      </span>
                    </div>

                    <div
                      className={`px-3 py-2 rounded-xl max-w-[88%] break-words shadow-sm ${
                        isSelf
                          ? 'bg-emerald-600 text-white rounded-tr-none'
                          : 'bg-stone-800 text-stone-200 rounded-tl-none border border-stone-700/60'
                      }`}
                    >
                      {msg.content}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Chat Message Input Bar */}
          <form 
            id="chat-input-form"
            onSubmit={handleSend}
            className="p-2.5 border-t border-stone-800 bg-stone-950 flex items-center space-x-2"
          >
            <input
              id="chat-input-field"
              type="text"
              value={inputText}
              placeholder="Message your peers... (Enter)"
              onChange={(e) => setInputText(e.target.value)}
              className="flex-1 bg-stone-900 border border-stone-700 rounded-lg px-3 py-2 text-xs text-stone-200 placeholder:text-stone-400 focus:outline-none focus:border-emerald-500 transition"
            />
            <button
              id="chat-send-btn"
              type="submit"
              disabled={!inputText.trim()}
              className="p-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:hover:bg-emerald-600 text-white rounded-lg transition"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      )}

      {/* Tab 2: Participants & Presence */}
      {activeTab === 'participants' && (
        <div 
          id="participants-list-container"
          className="flex-1 overflow-y-auto p-3 space-y-2 text-xs"
        >
          <div className="text-[11px] font-semibold text-stone-400 uppercase tracking-wider mb-2">
            Online in Room ({participants.length})
          </div>

          {participants.map((p) => {
            const isSelf = p.user_id === user.id;
            return (
              <div
                key={p.user_id}
                id={`participant-card-${p.user_id}`}
                className="flex items-center justify-between p-2 rounded-lg bg-stone-950/60 border border-stone-800 hover:border-stone-700 transition"
              >
                <div className="flex items-center space-x-2.5 min-w-0">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-white text-[11px] shadow-sm relative shrink-0"
                    style={{ backgroundColor: p.avatar_color }}
                  >
                    {p.username.charAt(0).toUpperCase()}
                    <Circle className="w-2.5 h-2.5 text-emerald-400 fill-emerald-400 absolute -bottom-0.5 -right-0.5 border border-stone-900 rounded-full" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium text-stone-200 truncate flex items-center gap-1.5">
                      <span>{p.username}</span>
                      {isSelf && (
                        <span className="text-[10px] text-emerald-400 px-1 py-0.2 bg-emerald-950 border border-emerald-800 rounded">
                          you
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-stone-400">
                      {p.active_file_id ? 'Editing file' : 'Idle'}
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-1 text-stone-400">
                  {p.is_voice_active ? (
                    p.is_muted ? (
                      <MicOff className="w-3.5 h-3.5 text-rose-400" title="Muted" />
                    ) : (
                      <Mic className="w-3.5 h-3.5 text-emerald-400 animate-pulse" title="Voice Active" />
                    )
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
