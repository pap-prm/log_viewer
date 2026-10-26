/**
 * API клиент для работы с сервером Log Viewer
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export interface LogFileInfo {
  name: string;
  size: number;
  lastModified: string;
  path?: string;
}

export interface LogFileContent {
  name: string;
  size: number;
  lastModified: string;
  content: string;
}

export interface ServerInfo {
  version: string;
  logsDirectory: string;
  whitelistEnabled: boolean;
  features: {
    upload: boolean;
    download: boolean;
  };
}

export interface ApiResponse<T> {
  success: boolean;
  error?: string;
  details?: string;
  data?: T;
}

/**
 * Получить список файлов логов
 */
export async function fetchLogFiles(): Promise<LogFileInfo[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/files`);
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Не удалось получить список файлов');
    }
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Не удалось получить список файлов');
    }
    
    return data.files;
  } catch (err) {
    console.error('Ошибка получения списка файлов:', err);
    throw err;
  }
}

/**
 * Получить содержимое файла лога
 */
export async function fetchLogFile(filename: string): Promise<LogFileContent> {
  try {
    const response = await fetch(`${API_BASE_URL}/files/${encodeURIComponent(filename)}`);
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Не удалось получить файл');
    }
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Не удалось получить файл');
    }
    
    return {
      name: data.file.name,
      size: data.file.size,
      lastModified: data.file.lastModified,
      content: data.content
    };
  } catch (err) {
    console.error('Ошибка получения файла:', err);
    throw err;
  }
}

/**
 * Скачать файл лога
 */
export function downloadLogFile(filename: string): void {
  const url = `${API_BASE_URL}/download/${encodeURIComponent(filename)}`;
  window.open(url, '_blank');
}

/**
 * Загрузить файл на сервер
 */
export async function uploadLogFile(file: File): Promise<LogFileInfo> {
  try {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await fetch(`${API_BASE_URL}/upload`, {
      method: 'POST',
      body: formData
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Не удалось загрузить файл');
    }
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Не удалось загрузить файл');
    }
    
    return {
      name: data.file.name,
      size: data.file.size,
      lastModified: new Date().toISOString()
    };
  } catch (err) {
    console.error('Ошибка загрузки файла:', err);
    throw err;
  }
}

/**
 * Получить информацию о сервере
 */
export async function fetchServerInfo(): Promise<ServerInfo> {
  try {
    const response = await fetch(`${API_BASE_URL}/info`);
    
    if (!response.ok) {
      throw new Error('Не удалось получить информацию о сервере');
    }
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Не удалось получить информацию о сервере');
    }
    
    return data.server;
  } catch (err) {
    console.error('Ошибка получения информации о сервере:', err);
    throw err;
  }
}

/**
 * Проверить доступность сервера
 */
export async function checkServerHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/info`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000)
    });
    return response.ok;
  } catch (err) {
    return false;
  }
}
