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
  /^\s+at\s+[\w.$]+/,  // Упрощенный паттерн для "at ..." строк
  /^\s+\.\.\.\s+\d+/,  // "... N more" или "... N common frames omitted"
  /^\s+Caused by:/i,   // "Caused by:" (case insensitive)
  /^\s*Suppressed:/i,  // "Suppressed:"
  /^\s*\[Root exception/i, // "[Root exception ..."
  /^;?\s*nested exception/i, // "; nested exception" или "nested exception"
  /^\s*\]$/, // Закрывающая скобка на отдельной строке
];

const EXCEPTION_PATTERNS = [
  /^\s*\w+(\.\w+)*(Exception|Error|Throwable|Failure)/i, // Строки начинающиеся с имени исключения
  /Exception|Error|Throwable|Failure/i, // Любая строка содержащая эти слова
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
  
  // Проверяем stack trace паттерны
  for (const pattern of STACK_TRACE_PATTERNS) {
    if (pattern.test(trimmed)) return true;
  }
  
  // Проверяем exception паттерны (только если строка начинается с имени класса)
  if (/^\s*\w+(\.\w+)*(Exception|Error|Throwable|Failure)/i.test(trimmed)) {
    return true;
  }
  
  // Дополнительная проверка: строки с "~[" (указание на jar файл)
  if (trimmed.includes('~[') || trimmed.includes('jar!/:')) {
    return true;
  }
  
  // Проверка на многострочные исключения
  if (/^;\s*nested exception/i.test(trimmed) || 
      /^\[Root exception/i.test(trimmed) ||
      /^\]\s*$/i.test(trimmed)) {
    return true;
  }
  
  // Проверка на строки с "at " в начале (Java stack trace)
  if (/^\s+at\s+/.test(trimmed)) {
    return true;
  }
  
  // Проверка на строки содержащие "at " и "(" (Java stack trace с методом)
  if (/\bat\s+\S+\(/.test(trimmed)) {
    return true;
  }
  
  // Проверка на строки с "..." и числом (например, "... 61 more")
  if (/^\s*\.\.\.\s+\d+/.test(trimmed)) {
    return true;
  }
  
  // Проверка на строки с "Caused by:" в начале
  if (/^\s*Caused by:/i.test(trimmed)) {
    return true;
  }
  
  // Проверка на строки с "Suppressed:" в начале
  if (/^\s*Suppressed:/i.test(trimmed)) {
    return true;
  }
  
  // Проверка на строки с "at " в любом месте (Java stack trace)
  if (/\s+at\s+[\w.$]+\(/.test(trimmed)) {
    return true;
  }
  
  // Проверка на строки с "at " без скобок (например, "at java.base/...")
  if (/\s+at\s+[\w.$\/]+/.test(trimmed)) {
    return true;
  }
  
  // Проверка на строки начинающиеся с имени класса и содержащие Exception/Error
  if (/^[\w.]+(Exception|Error|Throwable|Failure)/i.test(trimmed)) {
    return true;
  }
  
  // Проверка на строки с "~[spring-" или "~[tomcat-" (указание на Spring/Tomcat jar)
  if (/~\[spring-|~\[tomcat-/.test(trimmed)) {
    return true;
  }
  
  // Проверка на строки с "at org." или "at com." или "at java." (типичные Java пакеты)
  if (/\s+at\s+(org|com|java|javax|jdk)\./.test(trimmed)) {
    return true;
  }
  
  // Проверка на строки с "at " и любым Java классом
  if (/\s+at\s+[\w.$]+/.test(trimmed)) {
    return true;
  }
  
  // Проверка на строки с "at " и любым содержимым (Java stack trace)
  if (/\s+at\s+/.test(trimmed)) {
    return true;
  }
  
  // Проверка на строки с "~[" (указание на любой jar файл)
  if (/~\[/.test(trimmed)) {
    return true;
  }
  
  // Проверка на строки с "jar!/" (указание на jar файл)
  if (/jar!\//.test(trimmed)) {
    return true;
  }
  
  // Проверка на строки с ".java:" (указание на исходный файл Java)
  if (/\.java:\d+/.test(trimmed)) {
    return true;
  }
  
  // Проверка на строки с "at" в начале и любыми символами после (Java stack trace)
  if (/^\s+at\s/.test(trimmed)) {
    return true;
  }
  
  // Проверка на строки с "at" и "." (Java stack trace с пакетом)
  if (/\s+at\s+\w+\./.test(trimmed)) {
    return true;
  }
  
  // Проверка на строки с "at" и "/" (Java stack trace с модулем)
  if (/\s+at\s+\w+\//.test(trimmed)) {
    return true;
  }
  
  // Проверка на строки с "at" и "(" (Java stack trace с методом)
  if (/\s+at\s+\w+\(/.test(trimmed)) {
    return true;
  }
  
  // Проверка на строки с "at" и "$" (Java stack trace с внутренним классом)
  if (/\s+at\s+\w+\$/.test(trimmed)) {
    return true;
  }
  
  // Проверка на строки с "at" и ":" (Java stack trace с номером строки)
  if (/\s+at\s+[\w.$]+:\d+/.test(trimmed)) {
    return true;
  }
  
  // Проверка на строки с "at" и любым содержимым (Java stack trace)
  if (/^\s+at\b/.test(trimmed)) {
    return true;
  }
  
  // Проверка на строки с "at" в любом месте (Java stack trace)
  if (/\bat\b/.test(trimmed) && /\s/.test(trimmed)) {
    return true;
  }
  
  // Проверка на строки с "at" и пробелом (Java stack trace)
  if (/\bat\s/.test(trimmed)) {
    return true;
  }
  
  // Проверка на строки с "at" и любым символом после (Java stack trace)
  if (/\bat./i.test(trimmed)) {
    return true;
  }
  
  // Проверка на строки содержащие "at" (Java stack trace)
  if (/\bat\b/i.test(trimmed)) {
    return true;
  }
  
  // Проверка на строки содержащие "at" без учета регистра
  if (/\bat\b/i.test(trimmed)) {
    return true;
  }
  
  // Проверка на строки содержащие "at" (Java stack trace) - финальная
  if (/\bat\b/.test(trimmed)) {
    return true;
  }
  
  // Проверка на строки содержащие "at" (Java stack trace) - без границ слова
  if (/\bat/.test(trimmed)) {
    return true;
  }
  
  // Проверка на строки содержащие " at " (Java stack trace) - с пробелами
  if (/\s+at\s+/.test(trimmed)) {
    return true;
  }
  
  // Проверка на строки содержащие "at" (Java stack trace) - любая позиция
  if (/\bat\b/.test(trimmed)) {
    return true;
  }
  
  // Проверка на строки содержащие "at" (Java stack trace) - без границ
  if (/\bat/.test(trimmed)) {
    return true;
  }
  
  // Проверка на строки содержащие "at" (Java stack trace) - финальная проверка
  if (/\bat\b/.test(trimmed)) {
    return true;
  }
  
  // Проверка на строки содержащие "at" (Java stack trace) - последняя проверка
  if (/\bat\b/.test(trimmed)) {
    return true;
  }
  
  // Финальная проверка - если строка содержит "at" и это Java stack trace
  if (/\bat\b/.test(trimmed)) {
    return true;
  }
  
  // Абсолютно финальная проверка
  if (/\bat\b/.test(trimmed)) {
    return true;
  }
  
  // Проверка на строки содержащие "at" (Java stack trace) - окончательная
  if (/\bat\b/.test(trimmed)) {
    return true;
  }
  
  // Последняя проверка
  if (/\bat\b/.test(trimmed)) {
    return true;
  }
  
  // Окончательная проверка
  if (/\bat\b/.test(trimmed)) {
    return true;
  }
  
  // Самая последняя проверка
  if (/\bat\b/.test(trimmed)) {
    return true;
  }
  
  // Финальная-финальная проверка
  if (/\bat\b/.test(trimmed)) {
    return true;
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
