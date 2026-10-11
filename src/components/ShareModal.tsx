import React, { useState } from 'react';
import { 
  Share2, 
  Copy, 
  Check, 
  X, 
  ExternalLink, 
  AlertCircle, 
  Globe, 
  Laptop, 
  ShieldAlert,
  ArrowRight,
  Layers
} from 'lucide-react';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentRoomId: string;
}

export const ShareModal: React.FC<ShareModalProps> = ({ isOpen, onClose, currentRoomId }) => {
  const [copiedLink, setCopiedLink] = useState<'shared' | 'dev' | 'room' | null>(null);

  if (!isOpen) return null;

  const currentUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  const sharedUrl = `${currentUrl}`;

  const handleCopy = (text: string, type: 'shared' | 'dev' | 'room') => {
    navigator.clipboard.writeText(text);
    setCopiedLink(type);
    setTimeout(() => setCopiedLink(null), 2500);
  };

  const handleOpenDuplicateTab = () => {
    window.open(window.location.href, '_blank');
  };

  return (
    <div 
      id="share-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 select-none"
    >
      <div 
        id="share-modal-card"
        className="w-full max-w-xl bg-stone-900 border border-stone-800 rounded-2xl p-6 shadow-2xl relative text-stone-200"
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 text-stone-400 hover:text-stone-200 hover:bg-stone-800 rounded-lg transition"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center space-x-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-emerald-950 border border-emerald-800 flex items-center justify-center text-emerald-400">
            <Share2 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-stone-100">Share & Join Room #{currentRoomId}</h2>
            <p className="text-xs text-stone-400">
              Invite teammates to collaborate in real time with live code sync and voice
            </p>
          </div>
        </div>

        {/* Local & Network notice */}
        <div className="mb-4 p-3.5 rounded-xl bg-stone-950 border border-stone-800 text-xs space-y-2">
          <div className="flex items-center space-x-2 text-emerald-400 font-semibold">
            <Globe className="w-4 h-4 shrink-0" />
            <span>Application Share URL</span>
          </div>
          <div className="text-stone-300 space-y-1 text-[11px] leading-relaxed">
            <p>
              • <strong>On This Machine:</strong> Open a second tab or incognito window to simulate another collaborator.
            </p>
            <p>
              • <strong>On Local Network (Wi-Fi):</strong> Other devices can connect using your computer's local IP address (e.g. <code className="text-emerald-300">http://192.168.x.x:3000</code>).
            </p>
          </div>
        </div>

        {/* How to activate public link on other devices */}
        <div className="space-y-4 text-xs">
          <div className="p-3.5 bg-stone-950 border border-stone-800 rounded-xl space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-stone-200 flex items-center gap-1.5">
                <Globe className="w-4 h-4 text-emerald-400" />
                Collaborator Link
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">
                Active
              </span>
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="text"
                readOnly
                value={sharedUrl}
                className="flex-1 bg-stone-900 border border-stone-700 rounded-lg px-3 py-1.5 text-xs text-emerald-300 font-mono focus:outline-none"
              />
              <button
                onClick={() => handleCopy(sharedUrl, 'shared')}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-medium transition flex items-center gap-1"
              >
                {copiedLink === 'shared' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedLink === 'shared' ? 'Copied!' : 'Copy'}</span>
              </button>
            </div>
          </div>

          {/* Quick Local Testing in 2nd Tab */}
          <div className="p-3.5 bg-stone-950 border border-stone-800 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-stone-200 flex items-center gap-1.5">
                <Laptop className="w-4 h-4 text-blue-400" />
                Test Right Now on This Computer (Instant 2-User Test)
              </span>
            </div>
            <p className="text-[11px] text-stone-400">
              You can immediately test real-time typing and voice calling by opening a second tab in your current browser:
            </p>
            <button
              onClick={handleOpenDuplicateTab}
              className="w-full py-2 bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-700 rounded-lg font-medium flex items-center justify-center gap-1.5 transition"
            >
              <span>Open Second Window / Tab</span>
              <ExternalLink className="w-3.5 h-3.5 text-blue-400" />
            </button>
          </div>

          {/* Room ID quick copy */}
          <div className="flex items-center justify-between pt-2 border-t border-stone-800 text-stone-400 text-[11px]">
            <span className="flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-stone-500" />
              Active Room ID: <code className="text-stone-200 font-bold">#{currentRoomId}</code>
            </span>
            <button
              onClick={() => handleCopy(currentRoomId, 'room')}
              className="hover:text-stone-200 text-emerald-400 flex items-center gap-1"
            >
              {copiedLink === 'room' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              <span>{copiedLink === 'room' ? 'Room ID Copied' : 'Copy Room ID'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
