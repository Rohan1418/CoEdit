import React, { useState } from 'react';
import { useSocket } from '../context/SocketContext';
import { Plus, Users, Hash, X, ArrowRight } from 'lucide-react';
import type { Room } from '../types';

interface RoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentRoomId: string;
  onSelectRoom: (roomId: string) => void;
  availableRooms: Room[];
}

export const RoomModal: React.FC<RoomModalProps> = ({
  isOpen,
  onClose,
  currentRoomId,
  onSelectRoom,
  availableRooms
}) => {
  const { backendUrl, token } = useSocket();
  const [newRoomName, setNewRoomName] = useState<string>('');
  const [newRoomDesc, setNewRoomDesc] = useState<string>('');
  const [manualRoomId, setManualRoomId] = useState<string>('');
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsCreating(true);

    try {
      const res = await fetch(`${backendUrl}/api/rooms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          name: newRoomName,
          description: newRoomDesc,
          is_private: false
        })
      });

      if (!res.ok) {
        throw new Error('Failed to create room on backend. Connecting to local room instead.');
      }

      const roomData = await res.json();
      onSelectRoom(roomData.room_id);
      onClose();
    } catch {
      // Fallback: create local room
      const localRoomId = 'room_' + newRoomName.toLowerCase().replace(/[^a-z0-9]/g, '_');
      onSelectRoom(localRoomId);
      onClose();
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinManual = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualRoomId.trim()) {
      onSelectRoom(manualRoomId.trim());
      onClose();
    }
  };

  return (
    <div 
      id="room-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
    >
      <div 
        id="room-modal-card"
        className="w-full max-w-lg bg-stone-900 border border-stone-800 rounded-2xl p-6 shadow-2xl relative text-stone-200"
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 text-stone-400 hover:text-stone-200 hover:bg-stone-800 rounded-lg transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center space-x-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-blue-950 border border-blue-800 flex items-center justify-center text-blue-400">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-stone-100">Project Rooms & Channels</h2>
            <p className="text-xs text-stone-400">
              Create an isolated collaboration workspace or join an existing session
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-2.5 rounded-lg bg-amber-950/60 border border-amber-800 text-xs text-amber-300">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Column 1: Create New Room */}
          <form onSubmit={handleCreateRoom} className="space-y-3">
            <div className="text-xs font-semibold text-stone-300 uppercase tracking-wider flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5 text-emerald-400" />
              <span>Create New Room</span>
            </div>

            <input
              type="text"
              required
              value={newRoomName}
              onChange={(e) => setNewRoomName(e.target.value)}
              placeholder="e.g. Frontend Architecture"
              className="w-full bg-stone-950 border border-stone-700 rounded-lg px-3 py-2 text-xs text-stone-200 focus:outline-none focus:border-emerald-500"
            />

            <input
              type="text"
              value={newRoomDesc}
              onChange={(e) => setNewRoomDesc(e.target.value)}
              placeholder="Description (optional)"
              className="w-full bg-stone-950 border border-stone-700 rounded-lg px-3 py-2 text-xs text-stone-200 focus:outline-none focus:border-emerald-500"
            />

            <button
              type="submit"
              disabled={isCreating || !newRoomName.trim()}
              className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-lg text-xs font-semibold shadow-sm transition"
            >
              {isCreating ? 'Creating Room...' : 'Create & Join'}
            </button>
          </form>

          {/* Column 2: Join By Room ID */}
          <div className="space-y-4 border-t md:border-t-0 md:border-l border-stone-800 md:pl-6 pt-4 md:pt-0">
            <form onSubmit={handleJoinManual} className="space-y-2">
              <div className="text-xs font-semibold text-stone-300 uppercase tracking-wider flex items-center gap-1.5">
                <Hash className="w-3.5 h-3.5 text-blue-400" />
                <span>Join By Room ID</span>
              </div>
              <div className="flex items-center space-x-1.5">
                <input
                  type="text"
                  value={manualRoomId}
                  onChange={(e) => setManualRoomId(e.target.value)}
                  placeholder="room_id"
                  className="flex-1 bg-stone-950 border border-stone-700 rounded-lg px-3 py-2 text-xs text-stone-200 focus:outline-none focus:border-blue-500"
                />
                <button
                  type="submit"
                  disabled={!manualRoomId.trim()}
                  className="p-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-lg text-xs transition"
                >
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </form>

            {/* Quick Switch Preset Rooms */}
            <div>
              <div className="text-[11px] font-medium text-stone-400 mb-1.5">Available Rooms:</div>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {availableRooms.map((r) => (
                  <button
                    key={r.room_id}
                    onClick={() => {
                      onSelectRoom(r.room_id);
                      onClose();
                    }}
                    className={`w-full text-left px-2.5 py-1.5 rounded-md text-xs flex items-center justify-between transition ${
                      r.room_id === currentRoomId
                        ? 'bg-emerald-950/70 border border-emerald-800 text-emerald-300 font-medium'
                        : 'bg-stone-950/40 hover:bg-stone-800 text-stone-300'
                    }`}
                  >
                    <span className="truncate">{r.name}</span>
                    <span className="text-[10px] text-stone-400 font-mono">#{r.room_id}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
