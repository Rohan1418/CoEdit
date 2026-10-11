import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import type { User } from '../types';

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  isConnecting: boolean;
  backendUrl: string;
  setBackendUrl: (url: string) => void;
  token: string | null;
  user: User;
  setUser: React.Dispatch<React.SetStateAction<User>>;
  login: (token: string, user: User) => void;
  logout: () => void;
  isSimulated: boolean;
  setIsSimulated: (val: boolean) => void;
}

const SocketContext = createContext<SocketContextType | null>(null);

const AVATAR_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4', '#f97316'];

const createRandomUser = (): User => ({
  id: 'usr_' + Math.random().toString(36).substring(2, 9),
  username: 'Coder_' + Math.floor(1000 + Math.random() * 9000),
  email: 'coder@collab.dev',
  avatar_color: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)]
});

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [backendUrl, setBackendUrlState] = useState<string>(() => {
    if (import.meta.env.VITE_BACKEND_URL) {
      return import.meta.env.VITE_BACKEND_URL;
    }
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('collab_backend_url');
      const isCloud = window.location.hostname.includes('.onrender.com') || window.location.hostname.includes('.run.app') || window.location.hostname.includes('.app');
      if (isCloud) {
        return window.location.origin;
      }
      if (saved) return saved;

      if (window.location.port === '3000' || window.location.port === '5173') {
        return `${window.location.protocol}//${window.location.hostname}:8000`;
      }
      return window.location.origin;
    }
    return 'http://localhost:8000';
  });

  const [token, setToken] = useState<string | null>(() => {
    return localStorage.getItem('collab_jwt_token') || null;
  });

  const [user, setUser] = useState<User>(() => {
    const saved = localStorage.getItem('collab_user');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        // fallback
      }
    }
    return createRandomUser();
  });

  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [isSimulated, setIsSimulated] = useState<boolean>(false);
  const socketRef = useRef<Socket | null>(null);

  const setBackendUrl = (url: string) => {
    setBackendUrlState(url);
    localStorage.setItem('collab_backend_url', url);
  };

  const login = (newToken: string, newUser: User) => {
    setToken(newToken);
    setUser(newUser);
    localStorage.setItem('collab_jwt_token', newToken);
    localStorage.setItem('collab_user', JSON.stringify(newUser));
  };

  const logout = () => {
    setToken(null);
    localStorage.removeItem('collab_jwt_token');
    const freshUser = {
      id: 'usr_' + Math.random().toString(36).substring(2, 8),
      username: 'Guest_' + Math.floor(1000 + Math.random() * 9000),
      email: 'guest@collab.dev',
      avatar_color: '#10b981'
    };
    setUser(freshUser);
    localStorage.setItem('collab_user', JSON.stringify(freshUser));
  };

  // Connect to Socket.IO backend
  const connectSocket = useCallback(() => {
    if (isSimulated) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      setSocket(null);
      setIsConnected(false);
      return;
    }

    try {
      setIsConnecting(true);
      if (socketRef.current) {
        socketRef.current.disconnect();
      }

      const s = io(backendUrl, {
        path: '/socket.io',
        auth: {
          token: token || undefined,
          user_id: user.id,
          username: user.username,
          avatar_color: user.avatar_color
        },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 2000,
        timeout: 5000
      });

      s.on('connect', () => {
        setIsConnected(true);
        setIsConnecting(false);
      });

      s.on('disconnect', () => {
        setIsConnected(false);
        setIsConnecting(false);
      });

      s.on('connect_error', () => {
        setIsConnected(false);
        setIsConnecting(false);
      });

      socketRef.current = s;
      setSocket(s);
    } catch {
      setIsConnected(false);
      setIsConnecting(false);
    }
  }, [backendUrl, token, user.username, user.avatar_color, isSimulated]);

  useEffect(() => {
    connectSocket();
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [connectSocket]);

  return (
    <SocketContext.Provider
      value={{
        socket,
        isConnected,
        isConnecting,
        backendUrl,
        setBackendUrl,
        token,
        user,
        setUser,
        login,
        logout,
        isSimulated,
        setIsSimulated
      }}
    >
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => {
  const ctx = useContext(SocketContext);
  if (!ctx) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return ctx;
};
