import React, { useState, useCallback, useRef, useEffect } from 'react';
import { FileList } from './components/FileList';
import { LogViewer } from './components/LogViewer';
import { demoFiles } from './utils/demoData';
import { LogFile } from './utils/logParser';
import { downloadLogFile as downloadLocalFile } from './utils/download';
import { fetchLogFiles, fetchLogFile, uploadLogFile, checkServerHealth } from './utils/api';

function App() {
  const [files, setFiles] = useState<LogFile[]>(demoFiles);
  const [selectedFile, setSelectedFile] = useState<string | null>(demoFiles[0].name);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [serverMode, setServerMode] = useState(false);
  const [serverConnected, setServerConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentFile = files.find(f => f.name === selectedFile);

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
            <FileList
              files={files}
              selectedFile={selectedFile}
              onSelectFile={setSelectedFile}
            />
          </aside>
        )}

        {/* Log viewer */}
        <main className="flex-1 overflow-hidden">
          {loading && !currentFile?.content ? (
            <div className="flex items-center justify-center h-full text-gray-500">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
                <p className="text-sm">Загрузка файла...</p>
              </div>
            </div>
          ) : currentFile?.content ? (
            <LogViewer content={currentFile.content} fileName={currentFile.name} />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500">
              <div className="text-center">
                <svg className="w-16 h-16 mx-auto mb-4 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-lg font-medium mb-2">Выберите файл лога</p>
                <p className="text-sm text-gray-600">Выберите файл из списка слева или загрузите свой</p>
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
