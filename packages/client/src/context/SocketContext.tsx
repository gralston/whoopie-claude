import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  emit: <T>(event: string, data: any) => Promise<T>;
}

const SocketContext = createContext<SocketContextType | null>(null);

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const socketUrl = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3005';
    const newSocket = io(socketUrl, {
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      transports: ['websocket', 'polling'],
      withCredentials: true,
    });

    newSocket.on('connect', () => {
      console.log('Socket connected');
      setIsConnected(true);
    });

    newSocket.on('disconnect', () => {
      console.log('Socket disconnected');
      setIsConnected(false);
    });

    newSocket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
    });

    // When the tab becomes visible again (e.g., returning from another app on mobile),
    // force a reconnect if the socket dropped while backgrounded
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !newSocket.connected) {
        console.log('Tab visible again, forcing socket reconnect...');
        newSocket.connect();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    setSocket(newSocket);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      newSocket.close();
    };
  }, []);

  const emit = useCallback(<T,>(event: string, data: any): Promise<T> => {
    return new Promise((resolve, reject) => {
      if (!socket) {
        reject(new Error('Socket not connected'));
        return;
      }

      socket.emit(event, data, (response: { success: boolean; error?: string } & T) => {
        if (response.success) {
          resolve(response);
        } else {
          reject(new Error(response.error || 'Unknown error'));
        }
      });
    });
  }, [socket]);

  return (
    <SocketContext.Provider value={{ socket, isConnected, emit }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
}
