import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';
import { parseLogLine, parseLogContent, LogEntry, LogLevel, getLevelBorder } from '../utils/logParser';
import { fetchLogFile } from '../utils/api';

interface LiveLogViewerProps {
  fileName?: string;
  maxLines?: number;
  updateInterval?: number;
  isPaused?: boolean;
}

export const LiveLogViewer: React.FC<LiveLogViewerProps> = ({ 
  fileName,
  maxLines = 1000,
  updateInterval = 1,
  isPaused = false
}) => {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const lineCounter = useRef(1);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Динамическое определение WebSocket URL
  const getWsUrl = () => {
    // Позволяем настройку через переменную окружения
    if (import.meta.env.VITE_WS_URL) {
      return import.meta.env.VITE_WS_URL;
    }
    
    const hostname = window.location.hostname;
    const port = window.location.port;
    
    // Если порт не указан или это стандартный порт HTTP/HTTPS, используем 5555
    const wsPort = (!port || port === '80' || port === '443') ? '5555' : port;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    
    return `${protocol}//${hostname}:${wsPort}/ws/logs`;
  };
  
  const wsUrl = getWsUrl();
  const bufferRef = useRef<LogEntry[]>([]);

  // Загрузка начального содержимого файла
  useEffect(() => {
    if (!fileName) return;

    // Сбрасываем состояние при смене файла
    setEntries([]);
    lineCounter.current = 1;
    bufferRef.current = [];

    const loadInitialContent = async () => {
      try {
        const fileData = await fetchLogFile(fileName);
        const initialEntries = parseLogContent(fileData.content);
        
        // Устанавливаем начальные записи
        setEntries(initialEntries.slice(-maxLines));
        
        // Обновляем счетчик строк
        lineCounter.current = initialEntries.length + 1;
        
        console.log(`✓ Загружено ${initialEntries.length} строк из файла ${fileName}`);
      } catch (err) {
        console.error('Ошибка загрузки начального содержимого:', err);
      }
    };

    loadInitialContent();
  }, [fileName, maxLines]);

  // Обработка буфера с заданным интервалом
  useEffect(() => {
    if (!isPaused && updateInterval > 0) {
      intervalRef.current = setInterval(() => {
        if (bufferRef.current.length > 0) {
          const newEntries = [...bufferRef.current];
          bufferRef.current = [];
          
          setEntries(prev => {
            const combined = [...prev, ...newEntries];
            if (combined.length > maxLines) {
              return combined.slice(-maxLines);
            }
            return combined;
          });
        }
      }, updateInterval * 1000);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isPaused, updateInterval, maxLines]);

  const handleWebSocketMessage = useCallback((message: any) => {
    if (message.type === 'new_lines' && message.lines) {
      // Фильтруем по имени файла, если указано
      if (fileName && message.file !== fileName) {
        return;
      }

      const newEntries = message.lines.map((line: string) => {
        const entry = parseLogLine(line, lineCounter.current++);
        return entry;
      });

      // Если интервал 1 (мгновенно) и не на паузе, добавляем сразу
      if (updateInterval <= 1 && !isPaused) {
        setEntries(prev => {
          const combined = [...prev, ...newEntries];
          if (combined.length > maxLines) {
            return combined.slice(-maxLines);
          }
          return combined;
        });
      } else {
        // Иначе добавляем в буфер
        bufferRef.current = [...bufferRef.current, ...newEntries];
      }
    }
  }, [fileName, maxLines, updateInterval, isPaused]);

  const { isConnected, connect, disconnect } = useWebSocket({
    url: wsUrl,
    onMessage: handleWebSocketMessage,
    onConnect: () => {
      console.log('✓ Подключено к WebSocket серверу');
      if (fileName) {
        // Подписываемся на конкретный файл
      }
    },
    onDisconnect: () => {
      console.log('✓ Отключено от WebSocket сервера');
    }
  });

  // Автопрокрутка вниз
  useEffect(() => {
    if (autoScroll && !isPaused && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [entries, autoScroll, isPaused]);

  // Подписка на файл при изменении fileName
  useEffect(() => {
    if (isConnected && fileName) {
      // Отправляем сообщение о подписке
    }
  }, [isConnected, fileName]);

  const handleDisconnect = () => {
    if (isConnected) {
      disconnect();
    } else {
      connect();
    }
  };

  const handleClear = () => {
    setEntries([]);
    lineCounter.current = 1;
  };

  const getLevelBadgeColor = (level: LogLevel): string => {
    switch (level) {
      case 'FATAL': return 'bg-red-600 text-white';
      case 'ERROR': return 'bg-red-500 text-white';
      case 'WARN': return 'bg-amber-500 text-black';
      case 'INFO': return 'bg-blue-500 text-white';
      case 'DEBUG': return 'bg-gray-500 text-white';
      case 'TRACE': return 'bg-gray-600 text-gray-300';
      default: return 'bg-gray-700 text-gray-400';
    }
  };

  const highlightKeywords = (text: string): React.ReactNode => {
    const keywordPattern = /\b(ERROR|WARN|WARNING|FATAL|CRITICAL|INFO|DEBUG|TRACE|Exception|Error|Throwable|NullPointerException|OutOfMemoryError|ConnectException)\b/g;
    
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;
    
    const regex = new RegExp(keywordPattern);
    regex.lastIndex = 0;
    
    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(text.slice(lastIndex, match.index));
      }
      
      const keyword = match[1];
      let className = 'font-semibold ';
      
      if (['ERROR', 'Exception', 'Error', 'Throwable', 'NullPointerException', 'OutOfMemoryError', 'ConnectException'].includes(keyword)) {
        className += 'text-red-400';
      } else if (['WARN', 'WARNING'].includes(keyword)) {
        className += 'text-amber-400';
      } else if (['FATAL', 'CRITICAL'].includes(keyword)) {
        className += 'text-red-300 font-bold';
      } else if (['INFO'].includes(keyword)) {
        className += 'text-blue-400';
      } else if (['DEBUG'].includes(keyword)) {
        className += 'text-gray-400';
      } else if (['TRACE'].includes(keyword)) {
        className += 'text-gray-500';
      }
      
      parts.push(
        <span key={match.index} className={className}>
          {keyword}
        </span>
      );
      
      lastIndex = match.index + match[0].length;
    }
    
    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex));
    }
    
    return parts.length > 0 ? parts : text;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Панель управления */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
            <span className="text-sm text-gray-300">
              {isConnected ? 'Подключено' : 'Отключено'}
            </span>
          </div>
          
          {fileName && (
            <span className="text-sm text-gray-400">
              Файл: <span className="text-gray-200 font-mono">{fileName}</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleDisconnect}
            className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              isConnected
                ? 'bg-red-600 hover:bg-red-500 text-white'
                : 'bg-green-600 hover:bg-green-500 text-white'
            }`}
          >
            {isConnected ? (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
                Отключить
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Подключить
              </>
            )}
          </button>

          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              autoScroll
                ? 'bg-blue-600 hover:bg-blue-500 text-white'
                : 'bg-gray-600 hover:bg-gray-500 text-white'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
            Автопрокрутка
          </button>

          <button
            onClick={handleClear}
            className="flex items-center gap-2 px-3 py-1.5 bg-gray-600 hover:bg-gray-500 text-white rounded text-xs font-medium transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Очистить
          </button>

          <span className="text-xs text-gray-400">
            {entries.length} строк
          </span>
        </div>
      </div>

      {/* Содержимое логов */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto bg-gray-900 font-mono"
      >
        {entries.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500">
            <div className="text-center">
              <svg className="w-12 h-12 mx-auto mb-3 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              <p className="text-sm">
                {isPaused ? 'Live режим приостановлен' : 'Ожидание новых строк логов...'}
              </p>
              <p className="text-xs text-gray-600 mt-2">
                {isPaused ? 'Нажмите "Старт" для возобновления' : 'Новые строки будут появляться здесь в реальном времени'}
              </p>
            </div>
          </div>
        ) : (
          <div className="min-w-fit">
            {entries.map((entry) => (
              <div
                key={entry.lineNumber}
                className={`flex border-l-2 ${getLevelBorder(entry.level)} ${
                  entry.isStackTrace ? 'bg-gray-900/50 pl-8' : ''
                } hover:bg-gray-800/30 transition-colors duration-100`}
              >
                {/* Номер строки */}
                <span className="flex-shrink-0 w-14 text-right pr-3 py-0.5 text-xs text-gray-600 font-mono select-none border-r border-gray-800">
                  {entry.lineNumber}
                </span>

                {/* Уровень */}
                <span className="flex-shrink-0 w-16 text-center py-0.5">
                  {entry.level !== 'UNKNOWN' && !entry.isStackTrace && (
                    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider ${getLevelBadgeColor(entry.level)}`}>
                      {entry.level}
                    </span>
                  )}
                  {entry.isStackTrace && (
                    <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider bg-red-900/50 text-red-300">
                      STACK
                    </span>
                  )}
                </span>

                {/* Сообщение */}
                <span className="flex-1 py-0.5 px-3 text-sm font-mono text-gray-300 break-all whitespace-pre-wrap leading-5">
                  {highlightKeywords(entry.raw)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
