import React, { useState, useCallback, useRef, useEffect } from 'react';
import { FileList } from './components/FileList';
import { LiveLogViewer } from './components/LiveLogViewer';
import { demoFiles } from './utils/demoData';
import { LogFile } from './utils/logParser';
import { downloadLogFile as downloadLocalFile } from './utils/download';
import { fetchLogFiles, fetchLogFile, uploadLogFile, checkServerHealth } from './utils/api';
import { useFileWatcher } from './hooks/useFileWatcher';

interface LogFolder {
  id: string;
  name: string;
  path: string;
  files: LogFile[];
}

function App() {
  const [folders, setFolders] = useState<LogFolder[]>([
    {
      id: 'default',
      name: 'Логи приложения',
      path: '/opt/assembly_visual/logs/',
      files: demoFiles
    }
  ]);
  const [selectedFolderId, setSelectedFolderId] = useState<string>('default');
  const [files, setFiles] = useState<LogFile[]>(demoFiles);
  const [selectedFile, setSelectedFile] = useState<string | null>(demoFiles[0].name);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [serverMode, setServerMode] = useState(false);
  const [serverConnected, setServerConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [liveInterval, setLiveInterval] = useState<1 | 5 | 10 | 15 | 20 | 30 | 60>(1);
  const [isLivePaused, setIsLivePaused] = useState(false);
  const [showAddFolderDialog, setShowAddFolderDialog] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderPath, setNewFolderPath] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const selectedFolder = folders.find(f => f.id === selectedFolderId);

  const currentFile = files.find(f => f.name === selectedFile);

  // Функция добавления новой папки
  const handleAddFolder = useCallback(() => {
    if (!newFolderName || !newFolderPath) return;
    
    const newFolder: LogFolder = {
      id: Date.now().toString(),
      name: newFolderName,
      path: newFolderPath,
      files: []
    };
    
    setFolders(prev => [...prev, newFolder]);
    setSelectedFolderId(newFolder.id);
    setFiles([]);
    setSelectedFile(null);
    setShowAddFolderDialog(false);
    setNewFolderName('');
    setNewFolderPath('');
  }, [newFolderName, newFolderPath]);

  // Функция переключения между папками
  const handleSelectFolder = useCallback((folderId: string) => {
    setSelectedFolderId(folderId);
    const folder = folders.find(f => f.id === folderId);
    if (folder) {
      setFiles(folder.files);
      if (folder.files.length > 0) {
        setSelectedFile(folder.files[0].name);
      } else {
        setSelectedFile(null);
      }
    }
  }, [folders]);

  // Функция удаления папки
  const handleDeleteFolder = useCallback((folderId: string) => {
    if (folders.length <= 1) {
      alert('Нельзя удалить последнюю папку');
      return;
    }
    
    setFolders(prev => prev.filter(f => f.id !== folderId));
    if (selectedFolderId === folderId) {
      const remainingFolder = folders.find(f => f.id !== folderId);
      if (remainingFolder) {
        setSelectedFolderId(remainingFolder.id);
        setFiles(remainingFolder.files);
        if (remainingFolder.files.length > 0) {
          setSelectedFile(remainingFolder.files[0].name);
        }
      }
    }
  }, [folders, selectedFolderId]);

  // Проверка доступности сервера при загрузке
  useEffect(() => {
    const checkServer = async () => {
      const isAvailable = await checkServerHealth();
      if (isAvailable) {
        setServerMode(true);
        setServerConnected(true);
        // Загружаем список файлов с сервера
        try {
          const serverFiles = await fetchLogFiles();
          const logFiles: LogFile[] = serverFiles.map(f => ({
            name: f.name,
            size: f.size,
            lastModified: new Date(f.lastModified).toLocaleString('ru-RU'),
            content: '' // Контент загрузим при выборе
          }));
          setFiles(logFiles);
          if (logFiles.length > 0) {
            setSelectedFile(logFiles[0].name);
          }
        } catch (err) {
          console.error('Ошибка загрузки списка файлов с сервера:', err);
        }
      } else {
        setServerMode(false);
        setServerConnected(false);
      }
    };
    checkServer();
  }, []);

  // Функция обновления списка файлов
  const updateFileList = useCallback(async () => {
    try {
      const serverFiles = await fetchLogFiles();
      const logFiles: LogFile[] = serverFiles.map(f => ({
        name: f.name,
        size: f.size,
        lastModified: new Date(f.lastModified).toLocaleString('ru-RU'),
        content: '' // Контент загрузим при выборе
      }));
      
      // Обновляем список только если изменился
      setFiles(prev => {
        const prevNames = new Set(prev.map(f => f.name));
        const newNames = new Set(logFiles.map(f => f.name));
        
        // Проверяем, есть ли новые файлы
        const hasNewFiles = logFiles.some(f => !prevNames.has(f.name));
        // Проверяем, есть ли удалённые файлы
        const hasRemovedFiles = prev.some(f => !newNames.has(f.name));
        
        if (hasNewFiles || hasRemovedFiles) {
          console.log('📁 Список файлов обновлён:', {
            новых: logFiles.length - prev.length,
            удалённых: prev.length - logFiles.length
          });
          
          // Обновляем файлы в выбранной папке
          setFolders(prevFolders => 
            prevFolders.map(folder => 
              folder.id === selectedFolderId 
                ? { ...folder, files: logFiles }
                : folder
            )
          );
          
          return logFiles;
        }
        
        return prev;
      });
    } catch (err) {
      console.error('Ошибка обновления списка файлов:', err);
    }
  }, [selectedFolderId]);

  // Периодическое обновление списка файлов (каждые 5 секунд)
  useEffect(() => {
    if (!serverMode) return;

    // Обновляем список каждые 5 секунд
    const intervalId = setInterval(updateFileList, 5000);

    return () => {
      clearInterval(intervalId);
    };
  }, [serverMode, updateFileList]);

  // WebSocket для мгновенного обновления списка файлов
  useFileWatcher({
    onFileAdded: () => {
      console.log('📄 Получено уведомление о новом файле');
      updateFileList();
    },
    onFileRemoved: () => {
      console.log('🗑️ Получено уведомление об удалении файла');
      updateFileList();
    },
    enabled: serverMode
  });

  // Загрузка содержимого файла при выборе
  useEffect(() => {
    if (serverMode && selectedFile && !files.find(f => f.name === selectedFile)?.content) {
      const loadFile = async () => {
        setLoading(true);
        try {
          const fileData = await fetchLogFile(selectedFile);
          setFiles(prev => prev.map(f => 
            f.name === selectedFile 
              ? { ...f, content: fileData.content, size: fileData.size }
              : f
          ));
        } catch (err) {
          console.error('Ошибка загрузки файла:', err);
        } finally {
          setLoading(false);
        }
      };
      loadFile();
    }
  }, [selectedFile, serverMode]);

  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFiles = event.target.files;
    if (!uploadedFiles) return;

    if (serverMode) {
      // Загрузка на сервер
      for (const file of Array.from(uploadedFiles)) {
        try {
          setLoading(true);
          await uploadLogFile(file);
          // Обновляем список файлов
          const serverFiles = await fetchLogFiles();
          const logFiles: LogFile[] = serverFiles.map(f => ({
            name: f.name,
            size: f.size,
            lastModified: new Date(f.lastModified).toLocaleString('ru-RU'),
            content: ''
          }));
          setFiles(logFiles);
        } catch (err) {
          console.error('Ошибка загрузки файла на сервер:', err);
          alert('Ошибка загрузки файла на сервер');
        } finally {
          setLoading(false);
        }
      }
    } else {
      // Локальная загрузка
      Array.from(uploadedFiles).forEach(file => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const content = e.target?.result as string;
          const newFile: LogFile = {
            name: file.name,
            size: file.size,
            lastModified: new Date(file.lastModified).toLocaleString('ru-RU'),
            content,
          };
          setFiles(prev => [...prev, newFile]);
          setSelectedFile(file.name);
        };
        reader.readAsText(file);
      });
    }
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [serverMode]);

  const handleDrop = useCallback(async (event: React.DragEvent) => {
    event.preventDefault();
    const droppedFiles = event.dataTransfer.files;
    
    if (serverMode) {
      for (const file of Array.from(droppedFiles)) {
        try {
          setLoading(true);
          await uploadLogFile(file);
          const serverFiles = await fetchLogFiles();
          const logFiles: LogFile[] = serverFiles.map(f => ({
            name: f.name,
            size: f.size,
            lastModified: new Date(f.lastModified).toLocaleString('ru-RU'),
            content: ''
          }));
          setFiles(logFiles);
        } catch (err) {
          console.error('Ошибка загрузки файла на сервер:', err);
        } finally {
          setLoading(false);
        }
      }
    } else {
      Array.from(droppedFiles).forEach(file => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const content = e.target?.result as string;
          const newFile: LogFile = {
            name: file.name,
            size: file.size,
            lastModified: new Date(file.lastModified).toLocaleString('ru-RU'),
            content,
          };
          setFiles(prev => [...prev, newFile]);
          setSelectedFile(file.name);
        };
        reader.readAsText(file);
      });
    }
  }, [serverMode]);

  const handleDownload = useCallback(() => {
    if (!currentFile) return;
    
    if (serverMode) {
      // Скачивание через сервер
      const url = `http://localhost:3001/api/download/${encodeURIComponent(currentFile.name)}`;
      window.open(url, '_blank');
    } else {
      // Локальное скачивание
      downloadLocalFile(currentFile.content, currentFile.name);
    }
  }, [currentFile, serverMode]);

  return (
    <div
      className="h-screen w-screen flex flex-col bg-gray-900 text-gray-100 overflow-hidden"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      {/* Top bar */}
      <header className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1.5 rounded hover:bg-gray-700 transition-colors text-gray-400 hover:text-gray-200"
            title={sidebarOpen ? 'Скрыть панель' : 'Показать панель'}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <h1 className="text-sm font-bold text-gray-100">Log Viewer</h1>
              <p className="text-[10px] text-gray-500">
                {serverMode ? 'Серверный режим' : 'Локальный режим'} — /opt/assembly_visual/logs/
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".log,.txt"
            multiple
            onChange={handleFileUpload}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 text-white text-xs font-medium rounded-md transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            {loading ? 'Загрузка...' : 'Загрузить'}
          </button>
          
          {/* Управление Live режимом */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsLivePaused(!isLivePaused)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                isLivePaused
                  ? 'bg-green-600 hover:bg-green-500 text-white'
                  : 'bg-red-600 hover:bg-red-500 text-white'
              }`}
              title={isLivePaused ? 'Возобновить Live режим' : 'Приостановить Live режим'}
            >
              {isLivePaused ? (
                <>
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                  </svg>
                  Старт
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                    <rect x="5" y="5" width="10" height="10" />
                  </svg>
                  Стоп
                </>
              )}
            </button>
            
            <select
              value={liveInterval}
              onChange={(e) => setLiveInterval(Number(e.target.value) as any)}
              className="bg-gray-700 text-gray-200 text-xs rounded-md px-3 py-1.5 border border-gray-600 focus:border-blue-500 focus:outline-none cursor-pointer"
            >
              <option value={1}>Мгновенно</option>
              <option value={5}>5 сек</option>
              <option value={10}>10 сек</option>
              <option value={15}>15 сек</option>
              <option value={20}>20 сек</option>
              <option value={30}>30 сек</option>
              <option value={60}>60 сек</option>
            </select>
          </div>

          {currentFile && (
            <button
              onClick={handleDownload}
              disabled={loading}
              className="flex items-center gap-2 px-3 py-1.5 bg-green-700 hover:bg-green-600 disabled:bg-gray-600 text-white text-xs font-medium rounded-md transition-colors"
              title={`Скачать ${currentFile.name}`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Скачать
            </button>
          )}
          
          <div className="flex items-center gap-1.5 px-2 py-1 bg-gray-700 rounded text-xs text-gray-400">
            <span className={`w-2 h-2 rounded-full ${serverConnected ? 'bg-green-500' : 'bg-yellow-500'}`}></span>
            {files.length} файлов
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        {sidebarOpen && (
          <aside className="w-72 flex-shrink-0 bg-gray-850 border-r border-gray-700 overflow-hidden flex flex-col"
            style={{ backgroundColor: '#1a1f2e' }}
          >
            {/* Список папок */}
            <div className="border-b border-gray-700">
              <div className="px-4 py-2 flex items-center justify-between bg-gray-800/50">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Папки с логами</h3>
                <button
                  onClick={() => setShowAddFolderDialog(true)}
                  className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-gray-200 transition-colors"
                  title="Добавить папку"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              </div>
              <div className="max-h-32 overflow-y-auto">
                {folders.map(folder => (
                  <div
                    key={folder.id}
                    className={`flex items-center justify-between px-4 py-2 cursor-pointer transition-colors ${
                      selectedFolderId === folder.id
                        ? 'bg-blue-900/30 border-l-2 border-l-blue-400'
                        : 'hover:bg-gray-700/50 border-l-2 border-l-transparent'
                    }`}
                    onClick={() => handleSelectFolder(folder.id)}
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                      </svg>
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm font-medium truncate ${
                          selectedFolderId === folder.id ? 'text-blue-300' : 'text-gray-300'
                        }`}>
                          {folder.name}
                        </div>
                        <div className="text-xs text-gray-500 truncate">{folder.path}</div>
                      </div>
                    </div>
                    {folders.length > 1 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteFolder(folder.id);
                        }}
                        className="p-1 rounded hover:bg-gray-600 text-gray-500 hover:text-red-400 transition-colors"
                        title="Удалить папку"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
            
            {/* Список файлов */}
            <FileList
              files={files}
              selectedFile={selectedFile}
              onSelectFile={setSelectedFile}
            />
          </aside>
        )}

        {/* Диалог добавления папки */}
        {showAddFolderDialog && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg p-6 w-96 border border-gray-700">
              <h2 className="text-lg font-bold text-gray-100 mb-4">Добавить папку с логами</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-300 mb-1">Название папки</label>
                  <input
                    type="text"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-gray-200 text-sm focus:outline-none focus:border-blue-500"
                    placeholder="Например: Логи приложения"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-300 mb-1">Путь к папке</label>
                  <input
                    type="text"
                    value={newFolderPath}
                    onChange={(e) => setNewFolderPath(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-gray-200 text-sm focus:outline-none focus:border-blue-500"
                    placeholder="Например: /var/log/app/"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button
                  onClick={() => {
                    setShowAddFolderDialog(false);
                    setNewFolderName('');
                    setNewFolderPath('');
                  }}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm rounded transition-colors"
                >
                  Отмена
                </button>
                <button
                  onClick={handleAddFolder}
                  disabled={!newFolderName || !newFolderPath}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 text-white text-sm rounded transition-colors"
                >
                  Добавить
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Log viewer */}
        <main className="flex-1 overflow-hidden">
          {selectedFile ? (
            <LiveLogViewer 
              fileName={selectedFile}
              updateInterval={liveInterval}
              isPaused={isLivePaused}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500">
              <div className="text-center">
                <svg className="w-16 h-16 mx-auto mb-4 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-lg font-medium mb-2">Выберите файл лога</p>
                <p className="text-sm text-gray-600">Выберите файл из списка слева</p>
                <p className="text-xs text-gray-700 mt-4">
                  {serverMode ? 'Режим сервера — файлы загружаются с /opt/assembly_visual/logs/' : 'Локальный режим — можно перетащить файл в это окно'}
                </p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
