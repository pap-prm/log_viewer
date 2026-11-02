import { useEffect, useRef } from 'react';

interface FileChangeMessage {
  type: 'file_added' | 'file_removed' | 'file_modified';
  filename: string;
  timestamp: string;
}

interface UseFileWatcherOptions {
  onFileAdded?: (filename: string) => void;
  onFileRemoved?: (filename: string) => void;
  onFileModified?: (filename: string) => void;
  enabled?: boolean;
}

export function useFileWatcher({
  onFileAdded,
  onFileRemoved,
  onFileModified,
  enabled = true
}: UseFileWatcherOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbacksRef = useRef({ onFileAdded, onFileRemoved, onFileModified });

  // Обновляем callback'и при изменении
  useEffect(() => {
    callbacksRef.current = { onFileAdded, onFileRemoved, onFileModified };
  }, [onFileAdded, onFileRemoved, onFileModified]);

  useEffect(() => {
    if (!enabled) return;

    const connect = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const hostname = window.location.hostname;
      const port = window.location.port || '5555';
      const wsUrl = `${protocol}//${hostname}:${port}/ws/files`;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('✓ File watcher WebSocket подключён');
      };

      ws.onmessage = (event) => {
        try {
          const message: FileChangeMessage = JSON.parse(event.data);
          
          switch (message.type) {
            case 'file_added':
              console.log('📄 Новый файл:', message.filename);
              callbacksRef.current.onFileAdded?.(message.filename);
              break;
            case 'file_removed':
              console.log('🗑️ Файл удалён:', message.filename);
              callbacksRef.current.onFileRemoved?.(message.filename);
              break;
            case 'file_modified':
              console.log('📝 Файл изменён:', message.filename);
              callbacksRef.current.onFileModified?.(message.filename);
              break;
          }
        } catch (err) {
          console.error('Ошибка обработки сообщения file watcher:', err);
        }
      };

      ws.onclose = () => {
        console.log('✗ File watcher WebSocket отключён');
        // Переподключение через 3 секунды
        reconnectTimeoutRef.current = setTimeout(connect, 3000);
      };

      ws.onerror = (error) => {
        console.error('Ошибка file watcher WebSocket:', error);
        ws.close();
      };
    };

    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [enabled]);
}
