import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { parseLogContent, LogEntry, LogLevel } from '../utils/logParser';
import { LogLine } from './LogLine';
import { FilterBar } from './FilterBar';

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
  const containerRef = useRef<HTMLDivElement>(null);

  const entries = useMemo(() => parseLogContent(content), [content]);

  const filteredEntries = useMemo(() => {
    return entries.filter(entry => activeFilters.has(entry.level));
  }, [entries, activeFilters]);

  const matchCount = useMemo(() => {
    if (searchQuery.length < 2) return 0;
    const query = searchQuery.toLowerCase();
    return filteredEntries.filter(e => e.raw.toLowerCase().includes(query)).length;
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
