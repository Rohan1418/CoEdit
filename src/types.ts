export interface User {
  id: string;
  username: string;
  email: string;
  avatar_color: string;
}

export interface Participant {
  user_id: string;
  username: string;
  avatar_color: string;
  is_voice_active?: boolean;
  is_muted?: boolean;
  is_speaking?: boolean;
  active_file_id?: string | null;
  sid?: string;
}

export interface FileItem {
  id: string;
  room_id: string;
  name: string;
  path: string;
  parent_path: string;
  is_folder: boolean;
  content?: string;
  language?: string;
  size?: number;
  updated_at?: string;
  updated_by?: string;
}

export interface ChatMessage {
  id: string;
  room_id: string;
  sender_id: string;
  sender_name: string;
  sender_avatar_color: string;
  content: string;
  timestamp: string;
}

export interface RemoteCursor {
  user_id: string;
  username: string;
  avatar_color: string;
  file_id: string;
  position: {
    lineNumber: number;
    column: number;
  };
  selection?: {
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;
  };
}

export interface WebRTCPeer {
  user_id: string;
  username: string;
  sid?: string;
  is_muted: boolean;
  is_speaking: boolean;
  stream?: MediaStream;
}

export interface Room {
  room_id: string;
  name: string;
  description: string;
  created_by: string;
  created_at: string;
  is_private: boolean;
  active_participants: Participant[];
}
