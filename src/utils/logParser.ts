export type LogLevel = 'ERROR' | 'WARN' | 'FATAL' | 'INFO' | 'DEBUG' | 'TRACE' | 'UNKNOWN';

export interface LogEntry {
  lineNumber: number;
  timestamp?: string;
  level: LogLevel;
  logger?: string;
  thread?: string;
  message: string;
  raw: string;
  isStackTrace: boolean;
}

export interface LogFile {
  name: string;
  size: number;
  lastModified: string;
  content: string;
}

const LOG_LEVEL_PATTERNS: Record<string, LogLevel> = {
  'ERROR': 'ERROR',
  'ERR': 'ERROR',
  'SEVERE': 'ERROR',
  'WARN': 'WARN',
  'WARNING': 'WARN',
  'FATAL': 'FATAL',
  'CRITICAL': 'FATAL',
  'CRIT': 'FATAL',
  'INFO': 'INFO',
  'DEBUG': 'DEBUG',
  'TRACE': 'TRACE',
};

// Pattern for typical Java log formats:
// 2026-10-22 16:09:15.123 [thread-name] LEVEL logger - message
// 2026-10-22 16:09:15.123 LEVEL [thread] logger - message
// [2026-10-22 16:09:15.123] LEVEL ...
const TIMESTAMP_PATTERN = /(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}[.,]\d{3})/;
const LEVEL_PATTERN = /\b(ERROR|ERR|SEVERE|WARN|WARNING|FATAL|CRITICAL|CRIT|INFO|DEBUG|TRACE)\b/;
const THREAD_PATTERN = /\[([^\]]+)\]/;
const LOGGER_PATTERN = /(?:^|\s)([a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*){2,})\s*[-–—]/i;

// Stack trace patterns
const STACK_TRACE_PATTERNS = [
  /^\s+at\s+[\w.$]+\(/,
  /^\s+at\s+[\w.$]+$/,
  /^\s+\.\.\.\s+\d+\s+(?:more|common frames omitted)/,
  /^\s+Caused by:\s+/,
  /^\s*Suppressed:/,
];

const EXCEPTION_PATTERNS = [
  /^\w+(\.\w+)*(Exception|Error|Throwable|Failure)(:\s*.*)?$/,
  /^\w+(\.\w+)*(Exception|Error|Throwable|Failure)\s/,
];

export function detectLogLevel(line: string): LogLevel {
  const match = line.match(LEVEL_PATTERN);
  if (match) {
    return LOG_LEVEL_PATTERNS[match[1]] || 'UNKNOWN';
  }
  return 'UNKNOWN';
}

export function isStackTraceLine(line: string): boolean {
  const trimmed = line.trimStart();
  for (const pattern of STACK_TRACE_PATTERNS) {
    if (pattern.test(trimmed)) return true;
  }
  for (const pattern of EXCEPTION_PATTERNS) {
    if (pattern.test(trimmed)) return true;
  }
  return false;
}

export function parseLogLine(line: string, lineNumber: number): LogEntry {
  const entry: LogEntry = {
    lineNumber,
    level: 'UNKNOWN',
    message: line,
    raw: line,
    isStackTrace: isStackTraceLine(line),
  };

  if (entry.isStackTrace) {
    entry.level = 'ERROR'; // Stack traces belong to errors
    return entry;
  }

  // Extract timestamp
  const tsMatch = line.match(TIMESTAMP_PATTERN);
  if (tsMatch) {
    entry.timestamp = tsMatch[1];
  }

  // Extract level
  entry.level = detectLogLevel(line);

  // Extract thread
  const threadMatch = line.match(THREAD_PATTERN);
  if (threadMatch) {
    entry.thread = threadMatch[1];
  }

  // Extract logger
  const loggerMatch = line.match(LOGGER_PATTERN);
  if (loggerMatch) {
    entry.logger = loggerMatch[1];
  }

  return entry;
}

export function parseLogContent(content: string): LogEntry[] {
  const lines = content.split('\n');
  return lines.map((line, index) => parseLogLine(line, index + 1));
}

export function getLevelColor(level: LogLevel): string {
  switch (level) {
    case 'FATAL': return 'text-red-100 bg-red-900';
    case 'ERROR': return 'text-red-100 bg-red-800/70';
    case 'WARN': return 'text-amber-100 bg-amber-800/60';
    case 'INFO': return 'text-blue-100 bg-blue-800/50';
    case 'DEBUG': return 'text-gray-300 bg-gray-700/50';
    case 'TRACE': return 'text-gray-400 bg-gray-800/40';
    default: return 'text-gray-300 bg-transparent';
  }
}

export function getLevelBadgeColor(level: LogLevel): string {
  switch (level) {
    case 'FATAL': return 'bg-red-600 text-white';
    case 'ERROR': return 'bg-red-500 text-white';
    case 'WARN': return 'bg-amber-500 text-black';
    case 'INFO': return 'bg-blue-500 text-white';
    case 'DEBUG': return 'bg-gray-500 text-white';
    case 'TRACE': return 'bg-gray-600 text-gray-300';
    default: return 'bg-gray-700 text-gray-400';
  }
}

export function getLevelBorder(level: LogLevel): string {
  switch (level) {
    case 'FATAL': return 'border-l-red-500';
    case 'ERROR': return 'border-l-red-400';
    case 'WARN': return 'border-l-amber-400';
    case 'INFO': return 'border-l-blue-400';
    case 'DEBUG': return 'border-l-gray-500';
    case 'TRACE': return 'border-l-gray-600';
    default: return 'border-l-gray-700';
  }
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}
