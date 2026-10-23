import React from 'react';
import { LogEntry, getLevelBadgeColor, getLevelBorder } from '../utils/logParser';

interface LogLineProps {
  entry: LogEntry;
  searchQuery: string;
  isHighlighted: boolean;
}

function highlightSearch(text: string, query: string): React.ReactNode {
  if (!query || query.length < 2) return text;
  
  const parts: React.ReactNode[] = [];
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const segments = text.split(regex);
  
  segments.forEach((segment, i) => {
    if (segment.toLowerCase() === query.toLowerCase()) {
      parts.push(
        <mark key={i} className="bg-yellow-400/60 text-yellow-100 rounded px-0.5">
          {segment}
        </mark>
      );
    } else {
      parts.push(segment);
    }
  });
  
  return parts;
}

function highlightKeywords(text: string): React.ReactNode {
  // Highlight Java exception classes and keywords
  const keywordPattern = /\b(ERROR|WARN|WARNING|FATAL|CRITICAL|INFO|DEBUG|TRACE|Exception|Error|Throwable|NullPointerException|OutOfMemoryError|ConnectException|StackOverflowError|ClassCastException|IllegalArgumentException|IOException|SQLException)\b/g;
  
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
    
    if (['ERROR', 'Exception', 'Error', 'Throwable', 'NullPointerException', 'OutOfMemoryError', 'ConnectException', 'StackOverflowError', 'ClassCastException', 'IllegalArgumentException', 'IOException', 'SQLException'].includes(keyword)) {
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
}

export const LogLine: React.FC<LogLineProps> = ({ entry, searchQuery, isHighlighted }) => {
  const lineContent = entry.isStackTrace
    ? highlightKeywords(entry.raw)
    : highlightKeywords(entry.raw);

  const finalContent = searchQuery.length >= 2
    ? highlightSearch(entry.raw, searchQuery)
    : lineContent;

  return (
    <div
      className={`flex border-l-2 ${getLevelBorder(entry.level)} ${
        entry.isStackTrace ? 'bg-gray-900/50 pl-8' : ''
      } ${isHighlighted ? 'bg-yellow-900/20' : 'hover:bg-gray-800/30'} transition-colors duration-100`}
    >
      {/* Line number */}
      <span className="flex-shrink-0 w-14 text-right pr-3 py-0.5 text-xs text-gray-600 font-mono select-none border-r border-gray-800">
        {entry.lineNumber}
      </span>

      {/* Level badge */}
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

      {/* Message */}
      <span className="flex-1 py-0.5 px-3 text-sm font-mono text-gray-300 break-all whitespace-pre-wrap leading-5">
        {finalContent}
      </span>
    </div>
  );
};
