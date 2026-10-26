/**
 * Утилита для скачивания файлов на компьютер
 */

export interface DownloadOptions {
  filename: string;
  mimeType?: string;
}

/**
 * Скачать текст как файл
 */
export function downloadText(content: string, options: DownloadOptions): void {
  const { filename, mimeType = 'text/plain' } = options;
  
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  
  document.body.appendChild(link);
  link.click();
  
  // Очистка
  setTimeout(() => {
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, 100);
}

/**
 * Скачать лог-файл
 */
export function downloadLogFile(content: string, filename: string): void {
  downloadText(content, {
    filename,
    mimeType: 'text/plain;charset=utf-8'
  });
}

/**
 * Скачать отфильтрованные записи лога
 */
export function downloadFilteredLog(
  lines: string[],
  originalFilename: string,
  filterInfo?: string
): void {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const baseName = originalFilename.replace(/\.[^/.]+$/, '');
  const suffix = filterInfo ? `_${filterInfo}` : '_filtered';
  const filename = `${baseName}${suffix}_${timestamp}.log`;
  
  downloadLogFile(lines.join('\n'), filename);
}

/**
 * Скачать все записи определённого уровня
 */
export function downloadByLevel(
  lines: string[],
  originalFilename: string,
  level: string
): void {
  downloadFilteredLog(lines, originalFilename, level.toLowerCase());
}

/**
 * Скачать результаты поиска
 */
export function downloadSearchResults(
  lines: string[],
  originalFilename: string,
  searchQuery: string
): void {
  const safeQuery = searchQuery.replace(/[^a-zA-Z0-9а-яА-Я]/g, '_').slice(0, 20);
  downloadFilteredLog(lines, originalFilename, `search_${safeQuery}`);
}

/**
 * Экспорт в формат CSV (для анализа в Excel)
 */
export function downloadAsCSV(
  entries: Array<{
    lineNumber: number;
    timestamp?: string;
    level: string;
    message: string;
  }>,
  originalFilename: string
): void {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const baseName = originalFilename.replace(/\.[^/.]+$/, '');
  const filename = `${baseName}_${timestamp}.csv`;
  
  // Заголовок CSV
  const header = 'Line Number,Timestamp,Level,Message';
  
  // Строки данных
  const rows = entries.map(entry => {
    // Экранируем кавычки и оборачиваем в кавычки
    const escapeCSV = (str: string) => `"${str.replace(/"/g, '""')}"`;
    
    return [
      entry.lineNumber,
      escapeCSV(entry.timestamp || ''),
      escapeCSV(entry.level),
      escapeCSV(entry.message)
    ].join(',');
  });
  
  const csvContent = [header, ...rows].join('\n');
  
  // Добавляем BOM для корректного отображения кириллицы в Excel
  const BOM = '\uFEFF';
  downloadText(BOM + csvContent, {
    filename,
    mimeType: 'text/csv;charset=utf-8'
  });
}

/**
 * Копировать текст в буфер обмена
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    // Fallback для старых браузеров
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    
    try {
      document.execCommand('copy');
      document.body.removeChild(textarea);
      return true;
    } catch (err) {
      document.body.removeChild(textarea);
      return false;
    }
  }
}
