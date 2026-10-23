import React from 'react';
import { LogLevel } from '../utils/logParser';

interface FilterBarProps {
  activeFilters: Set<LogLevel>;
  onToggleFilter: (level: LogLevel) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  matchCount: number;
  totalCount: number;
  errorCount: number;
  warnCount: number;
  fatalCount: number;
  onAutoScroll: () => void;
  autoScroll: boolean;
}

const FILTERS: { level: LogLevel; label: string; color: string }[] = [
  { level: 'FATAL', label: 'FATAL', color: 'bg-red-600 border-red-500' },
  { level: 'ERROR', label: 'ERROR', color: 'bg-red-500 border-red-400' },
  { level: 'WARN', label: 'WARN', color: 'bg-amber-500 border-amber-400' },
  { level: 'INFO', label: 'INFO', color: 'bg-blue-500 border-blue-400' },
  { level: 'DEBUG', label: 'DEBUG', color: 'bg-gray-500 border-gray-400' },
  { level: 'TRACE', label: 'TRACE', color: 'bg-gray-600 border-gray-500' },
];

export const FilterBar: React.FC<FilterBarProps> = ({
  activeFilters,
  onToggleFilter,
  searchQuery,
  onSearchChange,
  matchCount,
  totalCount,
  errorCount,
  warnCount,
  fatalCount,
  onAutoScroll,
  autoScroll,
}) => {
  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 bg-gray-800/80 border-b border-gray-700">
      {/* Search */}
      <div className="relative flex-1 min-w-[200px] max-w-md">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          placeholder="Поиск по логам..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full pl-9 pr-4 py-1.5 bg-gray-900 border border-gray-600 rounded-md text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        />
        {searchQuery.length >= 2 && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
            {matchCount} совпад.
          </span>
        )}
      </div>

      {/* Level filters */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-gray-500 mr-1">Уровни:</span>
        {FILTERS.map(({ level, label, color }) => (
          <button
            key={level}
            onClick={() => onToggleFilter(level)}
            className={`px-2 py-1 rounded text-[11px] font-bold border transition-all ${
              activeFilters.has(level)
                ? `${color} text-white opacity-100`
                : 'bg-gray-800 border-gray-600 text-gray-500 opacity-50 hover:opacity-75'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Stats */}
      <div className="flex items-center gap-3 ml-auto">
        {fatalCount > 0 && (
          <span className="flex items-center gap-1 text-xs text-red-400">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
            {fatalCount} FATAL
          </span>
        )}
        {errorCount > 0 && (
          <span className="flex items-center gap-1 text-xs text-red-300">
            {errorCount} ERR
          </span>
        )}
        {warnCount > 0 && (
          <span className="flex items-center gap-1 text-xs text-amber-400">
            {warnCount} WARN
          </span>
        )}
        <span className="text-xs text-gray-500">{totalCount} строк</span>
        
        {/* Auto-scroll toggle */}
        <button
          onClick={onAutoScroll}
          className={`p-1.5 rounded transition-colors ${
            autoScroll ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
          }`}
          title="Автопрокрутка вниз"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
        </button>
      </div>
    </div>
  );
};
