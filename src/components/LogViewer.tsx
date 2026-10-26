import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { parseLogContent, LogEntry, LogLevel } from '../utils/logParser';
import { LogLine } from './LogLine';
import { FilterBar } from './FilterBar';
import { 
  downloadLogFile, 
  downloadSearchResults, 
  downloadAsCSV,
  copyToClipboard 
} from '../utils/download';

interface LogViewerProps {
  content: string;
  fileName: string;
}

export const LogViewer: React.FC<LogViewerProps> = ({ content, fileName }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilters, setActiveFilters] = useState<Set<LogLevel>>(
    new Set(['FATAL', 'ERROR', 'WARN', 'INFO', 'DEBUG', 'TRACE', 'UNKNOWN'])
  );
  const [autoScroll, setAutoScroll] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  const entries = useMemo(() => parseLogContent(content), [content]);

  const filteredEntries = useMemo(() => {
    return entries.filter(entry => activeFilters.has(entry.level));
  }, [entries, activeFilters]);

  const matchCount = useMemo(() => {
    if (searchQuery.length < 2) return 0;
    const query = searchQuery.toLowerCase();
    return filteredEntries.filter(e => e.raw.toLowerCase().includes(query)).length;
  }, [filteredEntries, searchQuery]);

  const searchResults = useMemo(() => {
    if (searchQuery.length < 2) return [];
    const query = searchQuery.toLowerCase();
    return filteredEntries.filter(e => e.raw.toLowerCase().includes(query));
  }, [filteredEntries, searchQuery]);

  const stats = useMemo(() => {
    const errorCount = entries.filter(e => e.level === 'ERROR').length;
    const warnCount = entries.filter(e => e.level === 'WARN').length;
    const fatalCount = entries.filter(e => e.level === 'FATAL').length;
    return { errorCount, warnCount, fatalCount };
  }, [entries]);

  const handleToggleFilter = useCallback((level: LogLevel) => {
    setActiveFilters(prev => {
      const next = new Set(prev);
      if (next.has(level)) {
        next.delete(level);
      } else {
        next.add(level);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [filteredEntries, autoScroll]);

  // Закрытие меню экспорта при клике вне его
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setShowExportMenu(false);
      }
    };

    if (showExportMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showExportMenu]);

  // Обработчики экспорта
  const handleDownloadFull = () => {
    downloadLogFile(content, fileName);
    setShowExportMenu(false);
  };

  const handleDownloadFiltered = () => {
    const lines = filteredEntries.map(e => e.raw);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const baseName = fileName.replace(/\.[^/.]+$/, '');
    downloadLogFile(lines.join('\n'), `${baseName}_filtered_${timestamp}.log`);
    setShowExportMenu(false);
  };

  const handleDownloadSearch = () => {
    if (searchResults.length === 0) return;
    const lines = searchResults.map(e => e.raw);
    downloadSearchResults(lines, fileName, searchQuery);
    setShowExportMenu(false);
  };

  const handleDownloadCSV = () => {
    const csvData = filteredEntries.map(e => ({
      lineNumber: e.lineNumber,
      timestamp: e.timestamp || '',
      level: e.level,
      message: e.raw
    }));
    downloadAsCSV(csvData, fileName);
    setShowExportMenu(false);
  };

  const handleCopyAll = async () => {
    const text = filteredEntries.map(e => e.raw).join('\n');
    const success = await copyToClipboard(text);
    if (success) {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    }
    setShowExportMenu(false);
  };

  const handleCopySearch = async () => {
    if (searchResults.length === 0) return;
    const text = searchResults.map(e => e.raw).join('\n');
    const success = await copyToClipboard(text);
    if (success) {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    }
    setShowExportMenu(false);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <h3 className="text-sm font-mono text-gray-200">{fileName}</h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setActiveFilters(new Set(['FATAL', 'ERROR', 'WARN', 'INFO', 'DEBUG', 'TRACE', 'UNKNOWN']));
              setSearchQuery('');
            }}
            className="px-2 py-1 text-xs text-gray-400 hover:text-gray-200 bg-gray-700 hover:bg-gray-600 rounded transition-colors"
          >
            Сбросить фильтры
          </button>
          <button
            onClick={() => {
              setActiveFilters(new Set(['FATAL', 'ERROR', 'WARN']));
            }}
            className="px-2 py-1 text-xs text-red-300 hover:text-red-200 bg-red-900/30 hover:bg-red-900/50 rounded transition-colors"
          >
            Только ошибки
          </button>
          
          {/* Кнопка экспорта */}
          <div className="relative" ref={exportMenuRef}>
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="flex items-center gap-1 px-2 py-1 text-xs text-green-300 hover:text-green-200 bg-green-900/30 hover:bg-green-900/50 rounded transition-colors"
              title="Экспорт лога"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Экспорт
            </button>

            {/* Выпадающее меню экспорта */}
            {showExportMenu && (
              <div className="absolute right-0 mt-2 w-64 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50">
                <div className="py-1">
                  <div className="px-3 py-2 text-xs text-gray-500 uppercase tracking-wider border-b border-gray-700">
                    Скачать файл
                  </div>
                  
                  <button
                    onClick={handleDownloadFull}
                    className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700 flex items-center gap-2 transition-colors"
                  >
                    <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <div>
                      <div className="font-medium">Весь лог</div>
                      <div className="text-xs text-gray-500">Скачать {fileName}</div>
                    </div>
                  </button>

                  <button
                    onClick={handleDownloadFiltered}
                    className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700 flex items-center gap-2 transition-colors"
                  >
                    <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                    </svg>
                    <div>
                      <div className="font-medium">Отфильтрованные</div>
                      <div className="text-xs text-gray-500">{filteredEntries.length} записей</div>
                    </div>
                  </button>

                  {searchResults.length > 0 && (
                    <button
                      onClick={handleDownloadSearch}
                      className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700 flex items-center gap-2 transition-colors"
                    >
                      <svg className="w-4 h-4 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                      <div>
                        <div className="font-medium">Результаты поиска</div>
                        <div className="text-xs text-gray-500">{searchResults.length} совпадений</div>
                      </div>
                    </button>
                  )}

                  <div className="border-t border-gray-700 my-1"></div>

                  <button
                    onClick={handleDownloadCSV}
                    className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700 flex items-center gap-2 transition-colors"
                  >
                    <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <div>
                      <div className="font-medium">Экспорт в CSV</div>
                      <div className="text-xs text-gray-500">Для Excel/анализа</div>
                    </div>
                  </button>

                  <div className="border-t border-gray-700 my-1"></div>

                  <div className="px-3 py-2 text-xs text-gray-500 uppercase tracking-wider">
                    Копировать в буфер
                  </div>

                  <button
                    onClick={handleCopyAll}
                    className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700 flex items-center gap-2 transition-colors"
                  >
                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    <div>
                      <div className="font-medium">Все записи</div>
                      <div className="text-xs text-gray-500">{filteredEntries.length} строк</div>
                    </div>
                  </button>

                  {searchResults.length > 0 && (
                    <button
                      onClick={handleCopySearch}
                      className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700 flex items-center gap-2 transition-colors"
                    >
                      <svg className="w-4 h-4 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      <div>
                        <div className="font-medium">Результаты поиска</div>
                        <div className="text-xs text-gray-500">{searchResults.length} строк</div>
                      </div>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Уведомление о копировании */}
          {copySuccess && (
            <span className="text-xs text-green-400 animate-pulse">
              ✓ Скопировано
            </span>
          )}
        </div>
      </div>

      {/* Filter bar */}
      <FilterBar
        activeFilters={activeFilters}
        onToggleFilter={handleToggleFilter}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        matchCount={matchCount}
        totalCount={filteredEntries.length}
        errorCount={stats.errorCount}
        warnCount={stats.warnCount}
        fatalCount={stats.fatalCount}
        onAutoScroll={() => setAutoScroll(!autoScroll)}
        autoScroll={autoScroll}
      />

      {/* Log content */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto bg-gray-900 font-mono"
      >
        {filteredEntries.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500">
            <div className="text-center">
              <svg className="w-12 h-12 mx-auto mb-3 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm">Нет записей, соответствующих фильтрам</p>
            </div>
          </div>
        ) : (
          <div className="min-w-fit">
            {filteredEntries.map((entry) => (
              <LogLine
                key={entry.lineNumber}
                entry={entry}
                searchQuery={searchQuery}
                isHighlighted={
                  searchQuery.length >= 2 &&
                  entry.raw.toLowerCase().includes(searchQuery.toLowerCase())
                }
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
