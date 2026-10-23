import React from 'react';
import { LogFile, formatFileSize } from '../utils/logParser';

interface FileListProps {
  files: LogFile[];
  selectedFile: string | null;
  onSelectFile: (fileName: string) => void;
}

export const FileList: React.FC<FileListProps> = ({ files, selectedFile, onSelectFile }) => {
  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-gray-700 bg-gray-800/50">
        <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
          </svg>
          Файлы логов
        </h2>
        <p className="text-xs text-gray-500 mt-1">/opt/assembly_visual/logs/</p>
      </div>
      <div className="flex-1 overflow-y-auto">
        {files.map((file) => (
          <button
            key={file.name}
            onClick={() => onSelectFile(file.name)}
            className={`w-full text-left px-4 py-3 border-b border-gray-700/50 transition-all duration-150 hover:bg-gray-700/50 ${
              selectedFile === file.name
                ? 'bg-blue-900/30 border-l-2 border-l-blue-400'
                : 'border-l-2 border-l-transparent'
            }`}
          >
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span className={`text-sm font-mono truncate ${
                selectedFile === file.name ? 'text-blue-300' : 'text-gray-300'
              }`}>
                {file.name}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-1 ml-6">
              <span className="text-xs text-gray-500">{formatFileSize(file.size)}</span>
              <span className="text-xs text-gray-600">•</span>
              <span className="text-xs text-gray-500">{file.lastModified}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};
